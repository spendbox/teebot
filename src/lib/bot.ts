import { MIN_CONFIDENCE, aiGate, recordReviewOutcomes } from "./ai-gate";
import { getClosedHourlyCandles, getLastPrice } from "./bybit";
import { liveBroker } from "./broker/live";
import { paperBroker } from "./broker/paper";
import type { Broker, Exit } from "./broker/types";
import {
  acquireLock,
  closedPositions,
  db,
  getSettings,
  insertPosition,
  logEvent,
  openPositions,
  releaseLock,
  updatePosition,
  updateSettings,
  type Position,
  type Settings,
} from "./db";
import { WARMUP, analyze } from "./engine/analysis";
import { decide } from "./engine/decide";
import { getProfile } from "./engine/profiles";
import { BREAKEVEN, canSplit, initialStop, nextStop, positionSize, takeProfitPrice, timeStopHit } from "./engine/risk";
import type { Candle } from "./engine/types";
import { getFearGreed } from "./sentiment";
import { sendTelegram } from "./telegram";
import { loadTunings, retuneStale } from "./tuning";

export interface CoinReport {
  symbol: string;
  price: number;
  regime: string;
  combined: number;
  threshold: number;
  outcome: string; // plain-English result of this check
}

export interface TickReport {
  status: "ran" | "disabled" | "busy" | "error";
  messages: string[];
  coins?: CoinReport[];
}

const usd = (n: number) => `$${n.toFixed(2)}`;

export function getBroker(s: Settings): Broker {
  return s.mode === "live" ? liveBroker() : paperBroker(s.paper_start_balance);
}

// One pass of the bot. Supabase calls this every 5 minutes.
export async function runTick(opts: { manual?: boolean } = {}): Promise<TickReport> {
  const settings = await getSettings();
  // "Run now" from the dashboard may test practice mode while the bot is off, never live.
  if (!settings.enabled && !(opts.manual && settings.mode === "paper")) return { status: "disabled", messages: ["Bot is switched off"] };
  if (settings.kill_switch) return { status: "disabled", messages: ["Safety shutdown is active - reset it in Settings"] };
  if (!(await acquireLock())) return { status: "busy", messages: ["Another run is in progress"] };

  const messages: string[] = [];
  const alert = async (level: "trade" | "warn" | "error", text: string) => {
    messages.push(text);
    await logEvent(level, text);
    await sendTelegram(settings.telegram_chat_id, `${settings.mode === "paper" ? "[PRACTICE] " : ""}${text}`);
  };

  try {
    const profile = getProfile(settings.risk_profile);
    const broker = getBroker(settings);
    const fng = await getFearGreed();

    const market: Record<string, { candles: Candle[]; price: number }> = {};
    await Promise.all(
      settings.symbols.map(async (sym) => {
        const [candles, price] = await Promise.all([getClosedHourlyCandles(sym), getLastPrice(sym)]);
        market[sym] = { candles, price };
      }),
    );
    const prices = Object.fromEntries(Object.entries(market).map(([s, m]) => [s, m.price]));

    let open = await openPositions(settings.mode);
    let { equity, cash } = await broker.account(prices, open);

    // Daily loss and drawdown tracking.
    const today = new Date().toISOString().slice(0, 10);
    let dayStart = settings.day_start_equity ?? equity;
    if (settings.day_start_date !== today) dayStart = equity;
    const peak = Math.max(settings.peak_equity ?? equity, equity);
    const drawdown = peak > 0 ? (peak - equity) / peak : 0;
    const dayLoss = dayStart > 0 ? (dayStart - equity) / dayStart : 0;

    const closedNow = new Set<string>();
    const closePosition = async (pos: Position, exit: Exit, reason: string) => {
      closedNow.add(pos.symbol);
      const total = (pos.realized ?? 0) + exit.proceeds;
      const pnl = total - pos.cost;
      await updatePosition(pos.id, {
        status: "closed",
        closed_at: new Date().toISOString(),
        exit_price: exit.price,
        proceeds: total,
        pnl,
        exit_reason: reason,
      });
      cash += exit.proceeds;
      await alert("trade", `SOLD ${pos.symbol} at ${exit.price} (${reason}). Result: ${pnl >= 0 ? "+" : ""}${usd(pnl)}`);
    };

    if (drawdown >= profile.maxDrawdown) {
      for (const pos of open) {
        await closePosition(pos, await broker.sell(pos, prices[pos.symbol]), "safety shutdown");
      }
      await updateSettings({
        kill_switch: true,
        enabled: false,
        kill_reason: `Balance fell ${(drawdown * 100).toFixed(1)}% from its peak`,
      });
      await alert("error", `SAFETY SHUTDOWN: balance fell ${(drawdown * 100).toFixed(1)}% from its peak. All trades closed, bot stopped.`);
      return { status: "ran", messages };
    }

    const entriesBlocked = dayLoss >= profile.dailyLossLimit;
    if (entriesBlocked && settings.daily_halt_date !== today) {
      await updateSettings({ daily_halt_date: today });
      await alert("warn", `Down ${(dayLoss * 100).toFixed(1)}% today - no new trades until tomorrow (UTC).`);
    }

    const recent = await closedPositions(settings.mode, 20);

    // Keep each coin's settings fresh (a couple of coins per run).
    const tunings = await loadTunings();
    try {
      const retuned = await retuneStale(settings.symbols, profile, tunings);
      if (retuned.length) await logEvent("info", `Re-tuned settings for ${retuned.join(", ")}`);
    } catch (e) {
      messages.push(`Tuning skipped: ${(e as Error).message}`);
    }
    const coins: CoinReport[] = [];
    let btcContext: { regime: string; change24h: number } | null = null;
    if (market.BTCUSDT && market.BTCUSDT.candles.length > WARMUP) {
      const b = market.BTCUSDT.candles;
      btcContext = { regime: analyze(b).regime[b.length - 1], change24h: b[b.length - 1].c / b[b.length - 25].c - 1 };
    }

    for (const sym of settings.symbols) {
      const { candles, price } = market[sym];
      if (candles.length < WARMUP + 1) {
        messages.push(`${sym}: not enough price history yet`);
        continue;
      }
      const a = analyze(candles);
      const i = candles.length - 1;
      const atrNow = a.atr[i];
      let pos: Position | undefined = open.find((p) => p.symbol === sym);

      const tuned = tunings.get(sym);
      const params = tuned?.params ?? profile.defaults;

      // 1. Manage the open trade: stop-loss, take-profit, trailing stop, time stop.
      if (pos) {
        const posParams = pos.params ?? profile.defaults;
        const stopName = pos.tp_done ? "trailing stop" : "stop-loss";
        const stopState = await broker.checkStop(pos);
        if (stopState.status === "filled") {
          await closePosition(pos, stopState.exit, stopName);
          pos = undefined;
        } else if (price <= pos.stop_price) {
          await closePosition(pos, await broker.sell(pos, price), stopName);
          pos = undefined;
        } else if (!pos.tp_done && pos.take_profit_price && price >= pos.take_profit_price) {
          if (canSplit(pos.qty * price, await broker.minOrderUsd(sym))) {
            // Bank half the gain; the rest is protected at break-even and trails the price.
            const exit = await broker.sell(pos, price, pos.qty / 2);
            const newStop = Math.max(pos.stop_price, pos.entry_price * BREAKEVEN);
            const remaining = pos.qty - exit.qty;
            let stopId: string | null = null;
            try {
              stopId = await broker.placeStop(sym, remaining, newStop);
            } catch (e) {
              await alert("warn", `Could not place the new stop-loss for ${sym} (${(e as Error).message}). The bot will watch it instead.`);
            }
            const patch: Partial<Position> = {
              qty: remaining,
              realized: (pos.realized ?? 0) + exit.proceeds,
              tp_done: true,
              stop_price: newStop,
              stop_order_id: stopId,
              highest_price: Math.max(pos.highest_price, price),
            };
            await updatePosition(pos.id, patch);
            cash += exit.proceeds;
            const gain = exit.proceeds - pos.cost * (exit.qty / pos.qty);
            await alert("trade", `TOOK PROFIT on half of ${sym} at ${exit.price} (+${usd(gain)}). The rest can't lose now - its stop is at break-even and follows the price up.`);
            pos = { ...pos, ...patch };
          } else {
            await closePosition(pos, await broker.sell(pos, price), "take-profit");
            pos = undefined;
          }
        } else {
          const highest = Math.max(pos.highest_price, price);
          const hoursOpen = (Date.now() - Date.parse(pos.opened_at)) / 3600_000;
          if (timeStopHit({ hoursOpen, price, entry: pos.entry_price, initialStop: pos.initial_stop ?? pos.stop_price, params: posParams, tpDone: pos.tp_done })) {
            await closePosition(pos, await broker.sell(pos, price), `time stop (no progress in ${posParams.maxHoldHours}h)`);
            pos = undefined;
          } else {
            const newStop = nextStop({ entry: pos.entry_price, stop: pos.stop_price, highest, atr: atrNow, params: posParams, tpDone: pos.tp_done });
            const patch: Partial<Position> = { highest_price: highest };
            if (stopState.status === "missing" || newStop - pos.stop_price >= 0.25 * atrNow) {
              patch.stop_price = newStop;
              patch.stop_order_id = await broker.moveStop(pos, newStop);
            }
            await updatePosition(pos.id, patch);
            pos = { ...pos, ...patch };
          }
        }
      }

      // 2. Ask the strategies.
      const d = decide(a, i, profile, { inPosition: !!pos, fng, params });
      await db().from("signals").upsert({
        symbol: sym,
        updated_at: new Date().toISOString(),
        regime: d.regime,
        action: d.action,
        reason: d.reason,
        price,
        combined: d.combined,
        threshold: d.threshold,
        confirmations: d.confirmations,
        scores: d.scores,
        weights: d.weights,
      });

      const report: CoinReport = { symbol: sym, price, regime: d.regime, combined: d.combined, threshold: d.threshold, outcome: d.reason };
      coins.push(report);
      if (closedNow.has(sym)) report.outcome = "Just sold - waiting before trading this coin again";
      else if (pos) {
        report.outcome = pos.tp_done
          ? `Holding the second half risk-free. Stop at ${pos.stop_price.toPrecision(6)}`
          : `Holding. Target ${pos.take_profit_price?.toPrecision(6) ?? "-"}, stop-loss ${pos.stop_price.toPrecision(6)}`;
      }

      if (pos && d.action === "exit") {
        await closePosition(pos, await broker.sell(pos, price), d.reason);
        report.outcome = `Sold: ${d.reason}`;
        continue;
      }
      if (pos || d.action !== "enter") continue;

      // 3. Entry checks.
      if (entriesBlocked || closedNow.has(sym)) {
        if (entriesBlocked) report.outcome = "Buy signal, but trading is paused for today after losses";
        continue;
      }
      if (open.length >= profile.maxOpenPositions) {
        report.outcome = `Buy signal, but already holding ${profile.maxOpenPositions} trades`;
        continue;
      }
      if (tuned && !tuned.active) {
        report.outcome = `Buy signal ignored: ${tuned.reason}`;
        continue;
      }
      const coinTrades = recent.filter((p) => p.symbol === sym);
      const last = coinTrades[0];
      if (last?.closed_at && Date.now() - Date.parse(last.closed_at) < profile.cooldownHours * 3600_000) {
        report.outcome = "Buy signal, but cooling down after the last trade";
        continue;
      }
      // Losing-streak brake: two losses in a row on a coin -> rest it for a day.
      if (
        coinTrades.length >= 2 &&
        (coinTrades[0].pnl ?? 0) < 0 &&
        (coinTrades[1].pnl ?? 0) < 0 &&
        Date.now() - Date.parse(coinTrades[0].closed_at!) < 24 * 3600_000
      ) {
        report.outcome = "Buy signal, but resting this coin for 24h after two losses in a row";
        continue;
      }

      let stop = initialStop(price, atrNow, params);
      const minOrderUsd = await broker.minOrderUsd(sym);
      let spend = positionSize({ equity, cash, entry: price, stop, profile, minOrderUsd });
      if (spend <= 0) {
        report.outcome = "Buy signal, but the balance is too small for a safe trade";
        continue;
      }
      // After three losses in a row anywhere, trade half size until a win.
      const cold = recent.length >= 3 && recent.slice(0, 3).every((p) => (p.pnl ?? 0) < 0);
      if (cold) spend = Math.max(minOrderUsd, spend * 0.5);

      // 4. Second opinion from Opus 5.5 (it can only veto, tighten the stop or shrink the size).
      const gate = await aiGate(settings, {
        symbol: sym,
        analysis: a,
        decision: d,
        fng,
        btc: sym === "BTCUSDT" ? null : btcContext,
        recentTrades: recent.slice(0, 8),
        proposal: { entry: price, stop, takeProfit: takeProfitPrice(price, stop, params), spendUsd: spend, equityUsd: equity },
        tuningNote: tuned ? `${tuned.reason}. Out-of-sample return on the last 18 days: ${tuned.stats.testReturnPct.toFixed(1)}%` : "Not tuned yet (using defaults)",
        candleTime: candles[i].t,
      });
      let aiNote = "";
      if (gate.status === "rejected") {
        report.outcome = `AI said no (${gate.verdict.confidence.toFixed(0)}% confident it's worth it): ${gate.verdict.reasoning}`;
        if (gate.fresh) {
          await alert("trade", `AI skipped a ${sym} buy (needs ${MIN_CONFIDENCE}%+, got ${gate.verdict.confidence.toFixed(0)}%). ${gate.verdict.reasoning}`);
        }
        continue;
      }
      if (gate.status === "unavailable") {
        report.outcome = `Buy signal, but skipped because the AI review was unavailable (${gate.reason})`;
        if (gate.fresh) await alert("warn", `AI review unavailable for ${sym}, trade skipped to be safe: ${gate.reason}`);
        continue;
      }
      if (gate.status === "approved") {
        stop = gate.verdict.stop_price;
        spend = Math.min(spend, Math.max(minOrderUsd, spend * gate.verdict.size_multiplier));
        aiNote = ` AI approved (${gate.verdict.confidence.toFixed(0)}%): ${gate.verdict.reasoning}`;
      }

      const fill = await broker.buy(sym, spend, price);
      // Keep the same stop distance relative to the actual fill price.
      const fillStop = fill.price - (price - stop);
      const target = takeProfitPrice(fill.price, fillStop, params);
      let stopOrderId: string | null = null;
      try {
        stopOrderId = await broker.placeStop(sym, fill.qty, fillStop);
      } catch (e) {
        await alert("warn", `Could not place stop-loss on Bybit for ${sym} (${(e as Error).message}). The bot will watch it instead.`);
      }
      await insertPosition({
        mode: settings.mode,
        symbol: sym,
        qty: fill.qty,
        entry_price: fill.price,
        cost: fill.cost,
        stop_price: fillStop,
        highest_price: fill.price,
        stop_order_id: stopOrderId,
        signal: d,
        take_profit_price: target,
        initial_stop: fillStop,
        params,
      });
      cash -= fill.cost;
      open = [...open, { symbol: sym } as Position];
      report.outcome = `BOUGHT ${usd(fill.cost)} at ${fill.price}`;
      await alert(
        "trade",
        `BOUGHT ${sym}: ${usd(fill.cost)} at ${fill.price}. Target ${target.toPrecision(6)}, stop-loss ${fillStop.toPrecision(6)} (max loss ~${usd(fill.cost * (1 - fillStop / fill.price))}).${cold ? " Half size after a losing streak." : ""} Why: ${d.reason}.${aiNote}`,
      );
    }

    await recordReviewOutcomes(prices);

    // Record the balance after this run.
    open = await openPositions(settings.mode);
    ({ equity } = await broker.account(prices, open));
    await db().from("equity_snapshots").insert({ mode: settings.mode, equity });
    await updateSettings({
      peak_equity: Math.max(peak, equity),
      day_start_equity: dayStart,
      day_start_date: today,
      last_tick_at: new Date().toISOString(),
      last_error: null,
    });
    return { status: "ran", messages, coins };
  } catch (e) {
    const msg = (e as Error).message;
    // Only alert when the error is new, so a lasting outage doesn't spam you.
    if (msg !== settings.last_error) await alert("error", `Bot error: ${msg}`);
    else await logEvent("error", msg);
    await updateSettings({ last_error: msg, last_tick_at: new Date().toISOString() });
    return { status: "error", messages: [...messages, msg] };
  } finally {
    await releaseLock();
  }
}
