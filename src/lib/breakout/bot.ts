import * as bybit from "../bybit";
import { closedPositions, db, insertPosition, logEvent, openPositions, updatePosition, updateSettings, type Position, type Settings } from "../db";
import { sendTelegram } from "../telegram";
import type { CoinReport, TickReport } from "../bot";
import {
  EMERGENCY_STOP,
  FEE,
  FUNDING,
  HISTORY_DAYS,
  SLIPPAGE,
  leverageFor,
  planDay,
  scoreSetup,
  volumeConfirmed,
  type Bar,
  type DayPlan,
} from "./strategy";

export const SYMBOL = "BTCUSDT";
const DAY = 86_400_000;
const HOUR = 3_600_000;
const EXCHANGE_LEVERAGE = 10; // margin setting only; real exposure is set by order size (max 5x)
const CLOSE_MINUTE = 23 * 60 + 57; // flat by 23:57 UTC, before the midnight funding payment
const MAX_DRAWDOWN = 0.5; // safety shutdown; the backtest's worst dip was 37%

const usd = (n: number) => `$${n.toFixed(2)}`;

interface Signal {
  trigger: number;
  avgHourVolume: number;
  clues: { label: string; met: boolean }[];
}

async function account(settings: Settings, pos: Position | undefined, price: number): Promise<number> {
  if (settings.mode === "live") return (await bybit.getWallet()).totalEquity;
  const { data } = await db().from("positions").select("pnl").eq("mode", "paper").eq("strategy", "breakout").eq("status", "closed");
  const realized = (data ?? []).reduce((s, r) => s + (r.pnl ?? 0), 0);
  const unrealized = pos ? pos.qty * (price - pos.entry_price) : 0;
  return settings.paper_start_balance + realized + unrealized;
}

function fundingCount(openedAt: number, closedAt: number): number {
  let n = 0;
  for (let t = Math.ceil(openedAt / (8 * HOUR)) * 8 * HOUR; t <= closedAt; t += 8 * HOUR) n++;
  return n;
}

export async function runBreakoutTick(settings: Settings, opts: { manual?: boolean } = {}): Promise<TickReport> {
  const messages: string[] = [];
  const alert = async (level: "trade" | "warn" | "error" | "info", text: string, notify = true) => {
    messages.push(text);
    await logEvent(level, text);
    if (notify) await sendTelegram(settings.telegram_chat_id, `${settings.mode === "paper" ? "[PRACTICE] " : ""}${text}`);
  };

  const now = Date.now();
  const dayStart = Math.floor(now / DAY) * DAY;
  const minuteOfDay = Math.floor((now - dayStart) / 60_000);
  const hourNow = Math.floor(minuteOfDay / 60);
  const today = new Date(dayStart).toISOString().slice(0, 10);

  const [dailyAll, hourlyAll, price] = await Promise.all([
    bybit.getKlines(SYMBOL, "D", HISTORY_DAYS + 3, undefined, "linear"),
    bybit.getKlines(SYMBOL, "60", 50, undefined, "linear"),
    bybit.getFuturesPrice(SYMBOL),
  ]);
  const completed: Bar[] = dailyAll.filter((d) => d.t < dayStart).slice(-HISTORY_DAYS);
  const todayOpen = dailyAll.find((d) => d.t === dayStart)?.o ?? price;
  const plan: DayPlan = planDay(completed, todayOpen, dayStart);

  const { data: planRows } = await db().from("day_plans").select("*").eq("day", today).eq("mode", settings.mode).limit(1);
  let status: string = planRows?.[0]?.status ?? (plan.eligible ? "waiting" : "no-uptrend");
  let score: number | null = planRows?.[0]?.score ?? null;
  let leverage: number | null = planRows?.[0]?.leverage ?? null;
  let clues = planRows?.[0]?.clues ?? plan.clues;
  let note: string = status !== "waiting" && planRows?.[0]?.note ? planRows[0].note : plan.reason;

  let pos: Position | undefined = (await openPositions(settings.mode, "breakout"))[0];
  let equity = await account(settings, pos, price);

  const closeTrade = async (p: Position, reason: string, knownExit?: number) => {
    let exitPrice = knownExit ?? price * (1 - SLIPPAGE);
    let pnl: number;
    if (settings.mode === "live") {
      const openedAt = Date.parse(p.opened_at);
      if (knownExit === undefined) {
        const pos = await bybit.getFuturesPosition(SYMBOL);
        if (pos.size > 0) {
          const rules = await bybit.getFuturesRules(SYMBOL);
          const orderId = await bybit.closeFuturesLong(SYMBOL, bybit.roundStep(pos.size, rules.qtyStep));
          await new Promise((r) => setTimeout(r, 1000));
          const o = await bybit.getFuturesOrder(SYMBOL, orderId);
          if (o?.avgPrice) exitPrice = o.avgPrice;
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
      const closed = await bybit.getLastClosedPnl(SYMBOL, openedAt);
      if (closed) exitPrice = closed.exitPrice || exitPrice;
      pnl = closed?.pnl ?? p.qty * (exitPrice - p.entry_price) - FEE * p.qty * (p.entry_price + exitPrice);
    } else {
      const fundings = fundingCount(Date.parse(p.opened_at), now);
      pnl = p.qty * (exitPrice - p.entry_price) - FEE * p.qty * (p.entry_price + exitPrice) - fundings * FUNDING * p.cost;
    }
    await updatePosition(p.id, {
      status: "closed",
      closed_at: new Date().toISOString(),
      exit_price: exitPrice,
      proceeds: p.cost + pnl,
      pnl,
      exit_reason: reason,
    });
    const marginUsed = p.cost / (p.leverage ?? 1);
    await alert(
      "trade",
      `SOLD BTC at ${exitPrice.toFixed(1)} (${reason}). Result: ${pnl >= 0 ? "+" : ""}${usd(pnl)} (${((pnl / marginUsed) * 100).toFixed(1)}% on the ${p.leverage}x trade).`,
    );
    status = "done";
    note = `Trade closed: ${reason}`;
    pos = undefined;
    equity = await account(settings, undefined, price);
  };

  // 1. Manage the open trade.
  if (pos) {
    const p: Position = pos;
    const sig = (p.signal ?? {}) as Signal;
    const openedDay = Math.floor(Date.parse(p.opened_at) / DAY) * DAY;
    let closedOnExchange = false;
    if (settings.mode === "live") {
      const live = await bybit.getFuturesPosition(SYMBOL);
      closedOnExchange = live.size === 0;
    }
    if (closedOnExchange) {
      await closeTrade(p, "emergency stop (on Bybit)", undefined);
    } else if (price <= p.stop_price) {
      await closeTrade(p, "emergency stop");
    } else if (openedDay < dayStart || minuteOfDay >= CLOSE_MINUTE) {
      await closeTrade(p, "end of day");
    } else if (!p.volume_checked && p.entry_hour != null && hourNow > p.entry_hour) {
      const hourBar = hourlyAll.find((h) => h.t === openedDay + p.entry_hour! * HOUR);
      if (hourBar) {
        if (!volumeConfirmed(hourBar.v, { avgHourVolume: sig.avgHourVolume } as DayPlan)) {
          await closeTrade(p, "weak volume after the breakout");
        } else {
          await updatePosition(p.id, { volume_checked: true });
          pos = { ...p, volume_checked: true };
          await alert("info", `Volume confirmed the BTC breakout (${(hourBar.v / sig.avgHourVolume).toFixed(1)}x a normal hour). Holding until the end of the day.`);
        }
      }
    }
    if (pos) {
      note = pos.volume_checked
        ? `Holding ${pos.leverage}x until 23:57 UTC. Emergency stop at ${pos.stop_price.toFixed(1)}`
        : `Holding ${pos.leverage}x. Checking the breakout hour's volume when it ends`;
    }
  }

  // 2. Look for today's breakout.
  if (!pos && status === "waiting" && plan.eligible) {
    const distance = (plan.trigger / price - 1) * 100;
    note = `Watching: buys if BTC reaches ${plan.trigger.toFixed(1)} (${distance > 0 ? `${distance.toFixed(2)}% away` : "reached"})`;
    if (price >= plan.trigger && minuteOfDay < CLOSE_MINUTE - 10) {
      const scored = scoreSetup(plan, hourNow);
      score = scored.score;
      clues = scored.clues;
      leverage = leverageFor(score, settings.breakout_profile ?? "balanced");
      if (leverage === 0) {
        status = "skipped-low-score";
        note = `Breakout happened, but the score was only ${score}/7 - skipped (needs 5+)`;
        await alert("info", `BTC broke out, but the setup scored ${score}/7, so the bot skipped it (it only trades 5+).`);
      } else {
        const rules = await bybit.getFuturesRules(SYMBOL);
        const notional = equity * leverage;
        const qty = Math.floor(notional / price / rules.qtyStep) * rules.qtyStep;
        if (qty < rules.minOrderQty || qty * price < rules.minNotional) {
          status = "skipped-too-small";
          note = `Breakout scored ${score}/7, but ${usd(equity)} x ${leverage} is below Bybit's minimum order (${rules.minOrderQty} BTC)`;
          await alert("warn", `Skipped a ${score}/7 BTC breakout: the account is too small for Bybit's minimum order (${rules.minOrderQty} BTC ≈ ${usd(rules.minOrderQty * price)}).`);
        } else {
          let entry = price * (1 + SLIPPAGE);
          const stop = () => entry * (1 - EMERGENCY_STOP);
          if (settings.mode === "live") {
            await bybit.setFuturesLeverage(SYMBOL, EXCHANGE_LEVERAGE);
            const qtyText = bybit.roundStep(qty, rules.qtyStep);
            await bybit.openFuturesLong(SYMBOL, qtyText, bybit.roundStep(price * (1 - EMERGENCY_STOP), rules.tickSize));
            await new Promise((r) => setTimeout(r, 1000));
            const live = await bybit.getFuturesPosition(SYMBOL);
            if (live.avgPrice) entry = live.avgPrice;
          }
          await insertPosition({
            mode: settings.mode,
            symbol: SYMBOL,
            strategy: "breakout",
            qty,
            entry_price: entry,
            cost: qty * entry,
            stop_price: stop(),
            highest_price: entry,
            stop_order_id: null,
            leverage,
            score,
            entry_hour: hourNow,
            volume_checked: false,
            signal: { trigger: plan.trigger, avgHourVolume: plan.avgHourVolume, clues } satisfies Signal,
          });
          status = "entered";
          note = `Bought ${leverage}x at ${entry.toFixed(1)} (score ${score}/7)`;
          const met = scored.clues.filter((c) => c.met).map((c) => c.label.replace(/ \(.*\)/, "")).join(", ");
          await alert(
            "trade",
            `BOUGHT BTC ${leverage}x at ${entry.toFixed(1)} - score ${score}/7 (${met}). Size ${usd(qty * entry)} on a ${usd(equity)} account. Emergency stop ${stop().toFixed(1)}; sells by 23:57 UTC, or at the end of this hour if volume is weak.`,
          );
        }
      }
    }
  } else if (!plan.eligible && status === "no-uptrend") {
    note = "No uptrend today (yesterday closed below its 20-day average) - staying out";
  }

  // 3. Record today's plan for the dashboard.
  await db().from("day_plans").upsert({
    day: today,
    mode: settings.mode,
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

  // 4. Balance tracking and safety shutdown.
  const peak = Math.max(settings.peak_equity ?? equity, equity);
  const tradedThisTick = messages.length > 0;
  if (tradedThisTick || minuteOfDay % 15 === 0 || opts.manual) {
    await db().from("equity_snapshots").insert({ mode: settings.mode, equity });
  }
  if (peak > 0 && (peak - equity) / peak >= MAX_DRAWDOWN) {
    if (pos) await closeTrade(pos, "safety shutdown");
    await updateSettings({ kill_switch: true, enabled: false, kill_reason: `Balance fell ${(((peak - equity) / peak) * 100).toFixed(0)}% from its peak` });
    await alert("error", "SAFETY SHUTDOWN: balance fell 50% from its peak. The bot closed everything and stopped.");
  }
  await updateSettings({ peak_equity: Math.max(peak, equity), last_tick_at: new Date().toISOString(), last_error: null });

  const coin: CoinReport = {
    symbol: SYMBOL,
    price,
    regime: plan.eligible ? "uptrend" : "downtrend",
    combined: score ?? 0,
    threshold: 5,
    outcome: note,
  };
  return { status: "ran", messages, coins: [coin] };
}

// Stats for the dashboard: streaks and distance from the high.
export async function breakoutStats(mode: string) {
  const trades = (await closedPositions(mode, 500, "breakout")).reverse(); // oldest first
  let streak = 0;
  let longestLoss = 0;
  let current = 0; // + wins in a row, - losses in a row
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
  return { trades, count: trades.length, wins, longestLoss, current };
}
