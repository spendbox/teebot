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
  trimEvents,
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
import { initialStop, positionSize, updateStop } from "./engine/risk";
import type { Candle } from "./engine/types";
import { getFearGreed } from "./sentiment";
import { sendTelegram } from "./telegram";
import { runBreakoutTick } from "./breakout/bot";
import { ethMode, runEthTick } from "./eth/bot";

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

// One pass of the bot. Supabase calls this every minute.
export async function runTick(opts: { manual?: boolean } = {}): Promise<TickReport> {
  const settings = await getSettings();
  // "Run now" from the dashboard may test practice mode while the bot is off, never live.
  if (!settings.enabled && !(opts.manual && settings.mode === "paper")) return { status: "disabled", messages: ["Bot is switched off"] };
  if (settings.kill_switch) return { status: "disabled", messages: ["Safety shutdown is active - reset it in Settings"] };

  if ((settings.strategy ?? "breakout") === "breakout") {
    if (!(await acquireLock(50))) return { status: "busy", messages: ["Another run is in progress"] };
    try {
      let report: TickReport;
      try {
        report = await runBreakoutTick(settings, opts);
      } catch (e) {
        const msg = (e as Error).message;
        if (msg !== settings.last_error) {
          await logEvent("error", `Bot error: ${msg}`);
          await sendTelegram(settings.telegram_chat_id, `Bot error: ${msg}`);
        }
        await updateSettings({ last_error: msg, last_tick_at: new Date().toISOString() });
        report = { status: "error", messages: [msg] };
      }
      // The Ethereum trader runs after Bitcoin; an error in one never stops the other.
      const eth = await runEthSafely(opts);
      const merged: TickReport = eth
        ? { status: report.status, messages: [...report.messages, ...eth.messages], coins: [...(report.coins ?? []), ...(eth.coins ?? [])] }
        : report;
      await logCheck(merged);
      return merged;
    } finally {
      await releaseLock();
    }
  }

  // The classic strategy only needs to run every 5 minutes.
  if (!opts.manual && settings.last_tick_at && Date.now() - Date.parse(settings.last_tick_at) < 4.5 * 60_000) {
    return { status: "ran", messages: ["Classic strategy runs every 5 minutes"] };
  }
  if (!(await acquireLock())) return { status: "busy", messages: ["Another run is in progress"] };
  const report = await runClassicTick(settings);
  await logCheck(report);
  return report;
}

async function runEthSafely(opts: { manual?: boolean }): Promise<TickReport | null> {
  try {
    const s = await getSettings(); // fresh: the Bitcoin pass may have triggered the safety shutdown
    if (ethMode(s) === "off") return null;
    if (s.kill_switch) return await runEthTick(s, { flattenOnly: true });
    if (!s.enabled && ethMode(s) !== "paper") return null; // "Check now" with the bot off only runs practice
    const report = await runEthTick(s, opts);
    if (s.eth_last_error) await updateSettings({ eth_last_error: null });
    return report;
  } catch (e) {
    const msg = (e as Error).message;
    try {
      const s = await getSettings();
      if (msg !== s.eth_last_error) {
        await logEvent("error", `ETH bot error: ${msg}`);
        await sendTelegram(s.telegram_chat_id, `ETH bot error: ${msg}`);
      }
      await updateSettings({ eth_last_error: msg });
    } catch {
      // never let the Ethereum trader break the Bitcoin one
    }
    return { status: "error", messages: [`ETH: ${msg}`] };
  }
}

// One line in the activity log per market check; the log is capped at 5,000 rows.
async function logCheck(report: TickReport): Promise<void> {
  try {
    const summary = (report.coins ?? [])
      .map((c) => `${c.symbol.replace("USDT", "")} ${c.price >= 1000 ? Math.round(c.price).toLocaleString("en-US") : c.price}: ${c.outcome}`)
      .join(" | ");
    await logEvent("check", summary || report.messages.join(" | ") || "Checked the market");
    await trimEvents();
  } catch {
    // Logging must never break trading.
  }
}

async function runClassicTick(settings: Settings): Promise<TickReport> {
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
      const pnl = exit.proceeds - pos.cost;
      await updatePosition(pos.id, {
        status: "closed",
        closed_at: new Date().toISOString(),
        exit_price: exit.price,
        proceeds: exit.proceeds,
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

      // 1. Protect the open trade.
      if (pos) {
        const stopState = await broker.checkStop(pos);
        if (stopState.status === "filled") {
          await closePosition(pos, stopState.exit, "stop-loss");
          pos = undefined;
        } else if (price <= pos.stop_price) {
          await closePosition(pos, await broker.sell(pos, price), "stop-loss");
          pos = undefined;
        } else {
          const highest = Math.max(pos.highest_price, price);
          const newStop = updateStop({ entry: pos.entry_price, stop: pos.stop_price, highest, atr: atrNow, profile });
          const patch: Partial<Position> = { highest_price: highest };
          if (stopState.status === "missing" || newStop - pos.stop_price >= 0.25 * atrNow) {
            patch.stop_price = newStop;
            patch.stop_order_id = await broker.moveStop(pos, newStop);
          }
          await updatePosition(pos.id, patch);
          pos = { ...pos, ...patch };
        }
      }

      // 2. Ask the strategies.
      const d = decide(a, i, profile, { inPosition: !!pos, fng });
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
      else if (pos) report.outcome = `Holding. Stop-loss at ${pos.stop_price.toPrecision(6)}`;

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
      const last = recent.find((p) => p.symbol === sym);
      if (last?.closed_at && Date.now() - Date.parse(last.closed_at) < profile.cooldownHours * 3600_000) {
        report.outcome = "Buy signal, but cooling down after the last trade";
        continue;
      }

      let stop = initialStop(price, atrNow, profile);
      const minOrderUsd = await broker.minOrderUsd(sym);
      let spend = positionSize({ equity, cash, entry: price, stop, profile, minOrderUsd });
      if (spend <= 0) {
        report.outcome = "Buy signal, but the balance is too small for a safe trade";
        continue;
      }

      // 4. Second opinion from Opus 5.5 (it can only veto, tighten the stop or shrink the size).
      const gate = await aiGate(settings, {
        symbol: sym,
        analysis: a,
        decision: d,
        fng,
        btc: sym === "BTCUSDT" ? null : btcContext,
        recentTrades: recent.slice(0, 8),
        proposal: { entry: price, stop, spendUsd: spend, equityUsd: equity },
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
      });
      cash -= fill.cost;
      open = [...open, { symbol: sym } as Position];
      report.outcome = `BOUGHT ${usd(fill.cost)} at ${fill.price}`;
      await alert(
        "trade",
        `BOUGHT ${sym}: ${usd(fill.cost)} at ${fill.price}. Stop-loss ${fillStop.toFixed(4)} (max loss ~${usd(fill.cost * (1 - fillStop / fill.price))}). Why: ${d.reason}.${aiNote}`,
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
