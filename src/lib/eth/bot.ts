import * as bybit from "../bybit";
import { FEE, FUNDING, SLIPPAGE, type Bar } from "../breakout/strategy";
import { closedPositions, db, insertPosition, logEvent, openPositions, updatePosition, updateSettings, type Position, type Settings } from "../db";
import { sendTelegram } from "../telegram";
import type { CoinReport, TickReport } from "../bot";
import { ETH_HISTORY_DAYS, ETH_SYMBOL, btcTriggerFor, ethLeverage, ethStopDistance, planEthDay, scoreEth, type EthPlan } from "./strategy";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const EXCHANGE_LEVERAGE = 10; // margin setting only; real exposure is set by order size (max 3x)
const CLOSE_MINUTE = 23 * 60 + 57;
const MAX_DRAWDOWN = 0.5; // pauses the Ethereum trader if its money falls 50% from its peak

const usd = (n: number) => `$${n.toFixed(2)}`;

export type EthMode = "paper" | "live";

// "off" until supabase/upgrade-eth.sql has been run.
export function ethMode(s: Settings): "off" | EthMode {
  if (!("eth_mode" in s)) return "off";
  return s.eth_mode === "live" || s.eth_mode === "off" ? s.eth_mode : "paper";
}

// Share of the Bybit balance each bot may use when both trade real money.
export function btcShare(s: Settings): number {
  return s.mode === "live" && ethMode(s) === "live" ? 1 - (s.eth_share ?? 0.5) : 1;
}

// Money the Ethereum trader is working with right now.
export async function ethEquity(s: Settings, pos: Position | undefined, price: number): Promise<number> {
  if (ethMode(s) === "live") return (await bybit.getWallet()).totalEquity * (s.eth_share ?? 0.5);
  const { data } = await db().from("positions").select("pnl").eq("mode", "paper").eq("strategy", "eth").eq("status", "closed");
  const realized = (data ?? []).reduce((a, r) => a + (r.pnl ?? 0), 0);
  const unrealized = pos ? pos.qty * (price - pos.entry_price) : 0;
  return (s.eth_paper_start_balance ?? 100) + realized + unrealized;
}

function fundingCount(openedAt: number, closedAt: number): number {
  let n = 0;
  for (let t = Math.ceil(openedAt / (8 * HOUR)) * 8 * HOUR; t <= closedAt; t += 8 * HOUR) n++;
  return n;
}

// One pass of the Ethereum trader. `flattenOnly` closes any open trade and does nothing else
// (used right after a safety shutdown).
export async function runEthTick(settings: Settings, opts: { manual?: boolean; flattenOnly?: boolean } = {}): Promise<TickReport> {
  const mode = ethMode(settings);
  if (mode === "off") return { status: "disabled", messages: ["Ethereum trader is off"] };
  const messages: string[] = [];
  const alert = async (level: "trade" | "warn" | "error" | "info", text: string, notify = true) => {
    const full = `${mode === "paper" ? "[PRACTICE] " : ""}ETH: ${text}`;
    messages.push(full);
    await logEvent(level, full);
    if (notify) await sendTelegram(settings.telegram_chat_id, full);
  };

  const now = Date.now();
  const dayStart = Math.floor(now / DAY) * DAY;
  const minuteOfDay = Math.floor((now - dayStart) / 60_000);
  const hourNow = Math.floor(minuteOfDay / 60);
  const today = new Date(dayStart).toISOString().slice(0, 10);

  const [ethDaily, btcDaily, price] = await Promise.all([
    bybit.getKlines(ETH_SYMBOL, "D", ETH_HISTORY_DAYS + 3, undefined, "linear"),
    bybit.getKlines("BTCUSDT", "D", 4, undefined, "linear"),
    bybit.getFuturesPrice(ETH_SYMBOL),
  ]);
  const completed: Bar[] = ethDaily.filter((d) => d.t < dayStart).slice(-ETH_HISTORY_DAYS);
  const todayOpen = ethDaily.find((d) => d.t === dayStart)?.o ?? price;
  const plan: EthPlan = planEthDay(completed, todayOpen);
  const btcToday = btcDaily.find((d) => d.t === dayStart);
  const btcPast = btcDaily.filter((d) => d.t < dayStart);
  const btcTrigger = btcToday && btcPast.length ? btcTriggerFor(btcPast, btcToday.o) : null;
  const btcBrokeOut = btcToday != null && btcTrigger != null && btcToday.h >= btcTrigger;

  const { data: planRows } = await db().from("eth_day_plans").select("*").eq("day", today).eq("mode", mode).limit(1);
  const row = planRows?.[0];
  let status: string = row?.status ?? (plan.eligible ? "waiting" : "no-uptrend");
  let score: number | null = row?.score ?? null;
  let leverage: number | null = row?.leverage ?? null;
  let clues = row?.clues ?? plan.clues;
  let note: string = status !== "waiting" && row?.note ? row.note : plan.reason;

  let pos: Position | undefined = (await openPositions(mode, "eth"))[0];
  let equity = await ethEquity(settings, pos, price);

  const closeTrade = async (p: Position, reason: string) => {
    let exitPrice = price * (1 - SLIPPAGE);
    let pnl: number;
    if (mode === "live") {
      const openedAt = Date.parse(p.opened_at);
      const live = await bybit.getFuturesPosition(ETH_SYMBOL);
      if (live.size > 0) {
        const rules = await bybit.getFuturesRules(ETH_SYMBOL);
        const orderId = await bybit.closeFuturesLong(ETH_SYMBOL, bybit.roundStep(live.size, rules.qtyStep));
        await new Promise((r) => setTimeout(r, 1000));
        const o = await bybit.getFuturesOrder(ETH_SYMBOL, orderId);
        if (o?.avgPrice) exitPrice = o.avgPrice;
      }
      await new Promise((r) => setTimeout(r, 1000));
      const closed = await bybit.getLastClosedPnl(ETH_SYMBOL, openedAt);
      if (closed) exitPrice = closed.exitPrice || exitPrice;
      pnl = closed?.pnl ?? p.qty * (exitPrice - p.entry_price) - FEE * p.qty * (p.entry_price + exitPrice);
    } else {
      const fundings = fundingCount(Date.parse(p.opened_at), now);
      pnl = p.qty * (exitPrice - p.entry_price) - FEE * p.qty * (p.entry_price + exitPrice) - fundings * FUNDING * p.cost;
    }
    await updatePosition(p.id, { status: "closed", closed_at: new Date().toISOString(), exit_price: exitPrice, proceeds: p.cost + pnl, pnl, exit_reason: reason });
    const margin = p.cost / (p.leverage ?? 1);
    await alert("trade", `SOLD at ${exitPrice.toFixed(2)} (${reason}). Result: ${pnl >= 0 ? "+" : ""}${usd(pnl)} (${((pnl / margin) * 100).toFixed(1)}% on the ${p.leverage}x trade).`);
    status = "done";
    note = `Trade closed: ${reason}`;
    pos = undefined;
    equity = await ethEquity(settings, undefined, price);
  };

  if (opts.flattenOnly) {
    if (pos) await closeTrade(pos, "safety shutdown");
    return { status: "ran", messages };
  }

  // 1. Manage the open trade.
  if (pos) {
    const p: Position = pos;
    const openedDay = Math.floor(Date.parse(p.opened_at) / DAY) * DAY;
    const closedOnExchange = mode === "live" && (await bybit.getFuturesPosition(ETH_SYMBOL)).size === 0;
    if (closedOnExchange) await closeTrade(p, "emergency stop (on Bybit)");
    else if (price <= p.stop_price) await closeTrade(p, "emergency stop");
    else if (openedDay < dayStart || minuteOfDay >= CLOSE_MINUTE) await closeTrade(p, "end of day");
    if (pos) note = `Holding ${pos.leverage}x until 23:57 UTC. Emergency stop at ${pos.stop_price.toFixed(2)}`;
  }

  // 2. Look for today's breakout.
  if (!pos && status === "waiting" && plan.eligible) {
    const distance = (plan.trigger / price - 1) * 100;
    note = `Watching: buys if ETH reaches ${plan.trigger.toFixed(2)} (${distance > 0 ? `${distance.toFixed(2)}% away` : "reached"})`;
    if (price >= plan.trigger && minuteOfDay < CLOSE_MINUTE - 10) {
      const scored = scoreEth(plan, hourNow, btcBrokeOut);
      score = scored.score;
      clues = scored.clues;
      leverage = ethLeverage(score);
      if (leverage === 0) {
        status = "skipped-low-score";
        note = `Breakout happened, but the score was only ${score}/4 - skipped (needs 2+)`;
        await alert("info", `broke out, but the setup scored ${score}/4, so the bot skipped it (it only trades 2+).`);
      } else {
        const rules = await bybit.getFuturesRules(ETH_SYMBOL);
        const qty = Math.floor((equity * leverage) / price / rules.qtyStep) * rules.qtyStep;
        if (qty < rules.minOrderQty || qty * price < rules.minNotional) {
          status = "skipped-too-small";
          note = `Breakout scored ${score}/4, but ${usd(equity)} x ${leverage} is below Bybit's minimum order (${rules.minOrderQty} ETH)`;
          await alert("warn", `skipped a ${score}/4 breakout: its money is too small for Bybit's minimum order (${rules.minOrderQty} ETH ≈ ${usd(rules.minOrderQty * price)}).`);
        } else {
          let entry = price * (1 + SLIPPAGE);
          const stopFor = (e: number) => e * (1 - ethStopDistance(plan.range, e));
          let stop = stopFor(entry);
          if (mode === "live") {
            const stopText = bybit.roundStep(stopFor(price), rules.tickSize);
            await bybit.setFuturesLeverage(ETH_SYMBOL, EXCHANGE_LEVERAGE);
            await bybit.openFuturesLong(ETH_SYMBOL, bybit.roundStep(qty, rules.qtyStep), stopText);
            await new Promise((r) => setTimeout(r, 1000));
            const live = await bybit.getFuturesPosition(ETH_SYMBOL);
            if (live.avgPrice) entry = live.avgPrice;
            stop = Number(stopText); // the stop that is actually on Bybit
          }
          await insertPosition({
            mode,
            symbol: ETH_SYMBOL,
            strategy: "eth",
            qty,
            entry_price: entry,
            cost: qty * entry,
            stop_price: stop,
            highest_price: entry,
            stop_order_id: null,
            leverage,
            score,
            entry_hour: hourNow,
            volume_checked: true,
            signal: { trigger: plan.trigger, range: plan.range, btcBrokeOut, clues },
          });
          pos = (await openPositions(mode, "eth"))[0];
          status = "entered";
          note = `Bought ${leverage}x at ${entry.toFixed(2)} (score ${score}/4)`;
          const met = scored.clues.filter((c) => c.met).map((c) => c.label.replace(/ \(.*\)/, "")).join(", ");
          await alert(
            "trade",
            `BOUGHT ${leverage}x at ${entry.toFixed(2)} - score ${score}/4 (${met || "no clues"}). Size ${usd(qty * entry)} on ${usd(equity)}. Emergency stop ${stop.toFixed(2)} (${((1 - stop / entry) * 100).toFixed(1)}% below); sells by 23:57 UTC.`,
          );
        }
      }
    }
  } else if (!plan.eligible && status === "no-uptrend") {
    note = "No uptrend today (yesterday closed below its 20-day average) - staying out";
  }

  // 3. Record today's plan for the dashboard.
  await db().from("eth_day_plans").upsert({
    day: today,
    mode,
    updated_at: new Date().toISOString(),
    status,
    eligible: plan.eligible,
    open: plan.open,
    trigger: plan.trigger,
    price,
    score,
    leverage,
    clues,
    note,
  });

  // 4. Its own safety net: pause the Ethereum trader if its money halves from its peak.
  const peak = Math.max(settings.eth_peak_equity ?? equity, equity);
  if (peak > 0 && (peak - equity) / peak >= MAX_DRAWDOWN) {
    if (pos) await closeTrade(pos, "safety pause");
    await updateSettings({ eth_mode: "off", eth_peak_equity: null });
    await alert("error", `SAFETY PAUSE: the Ethereum trader's money fell ${(((peak - equity) / peak) * 100).toFixed(0)}% from its peak. It closed its trade and switched itself off. Turn it back on in Settings when ready.`);
  } else if (peak !== settings.eth_peak_equity) {
    await updateSettings({ eth_peak_equity: peak });
  }

  const coin: CoinReport = { symbol: ETH_SYMBOL, price, regime: plan.eligible ? "uptrend" : "downtrend", combined: score ?? 0, threshold: 2, outcome: note };
  return { status: "ran", messages, coins: [coin] };
}

export async function ethStats(mode: string) {
  const trades = (await closedPositions(mode, 500, "eth")).reverse();
  let streak = 0;
  let longestLoss = 0;
  let current = 0;
  for (const t of trades) {
    if ((t.pnl ?? 0) > 0) {
      streak = 0;
      current = current > 0 ? current + 1 : 1;
    } else {
      longestLoss = Math.max(longestLoss, ++streak);
      current = current < 0 ? current - 1 : -1;
    }
  }
  const wins = trades.filter((t) => (t.pnl ?? 0) > 0).length;
  const pnl = trades.reduce((a, t) => a + (t.pnl ?? 0), 0);
  return { count: trades.length, wins, longestLoss, current, pnl };
}
