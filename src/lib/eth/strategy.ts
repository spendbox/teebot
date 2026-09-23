// Ethereum breakout day-trader.
//
// Research summary (Binance ETH/USDT + BTC/USDT hourly data, 2018-2026, fees + slippage +
// funding included; rules chosen on 2018-2021, judged on 2022-2026):
//   - Trade only when yesterday's ETH close is above its 20-day average (uptrend).
//   - Buy when ETH rises above today's open + 0.8 x yesterday's high-low range.
//   - Score out of 4: Bitcoin has also broken out today, breakout before 12:00 UTC,
//     ETH below its 100-day average, 50-day average not rising (early in a recovery).
//   - Size by score: 2 -> 1x, 3 -> 2x, 4 -> 3x; 0-1 skip.
//   - Emergency stop 1 x yesterday's range below entry, kept between 3% and 8%.
//   - No weak-volume exit (it hurt on ETH). Always flat by the end of the UTC day.
// See docs/research/ethereum-day-trader.md. Shared by the live bot and the backtester.

import { FEE, FUNDING, SLIPPAGE, toDays, type Bar, type BreakoutBacktest, type BreakoutTrade } from "../breakout/strategy";

export const ETH_SYMBOL = "ETHUSDT";
export const ETH_K = 0.8; // breakout distance, as a fraction of yesterday's range
export const BTC_K = 0.7; // Bitcoin's own breakout line (same as the Bitcoin bot)
export const ETH_TREND_DAYS = 20;
export const ETH_EARLY_HOUR = 12;
export const STOP_MIN = 0.03;
export const STOP_MAX = 0.08;
export const ETH_HISTORY_DAYS = 106; // 100-day average + 5-day slope of the 50-day

export function ethLeverage(score: number): number {
  return score >= 4 ? 3 : score === 3 ? 2 : score === 2 ? 1 : 0;
}

// Emergency-stop distance as a fraction of the entry price.
export function ethStopDistance(range: number, entry: number): number {
  return Math.min(STOP_MAX, Math.max(STOP_MIN, range / entry));
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export interface EthClue {
  key: string;
  label: string;
  met: boolean;
}

export interface EthPlan {
  eligible: boolean;
  reason: string;
  open: number;
  trigger: number;
  range: number;
  clues: EthClue[]; // the 2 clues known at the start of the day
}

// `days` are completed UTC days (oldest first).
export function planEthDay(days: Bar[], todayOpen: number): EthPlan {
  const n = days.length;
  if (n < ETH_HISTORY_DAYS) return { eligible: false, reason: "Not enough price history", open: todayOpen, trigger: 0, range: 0, clues: [] };
  const closes = days.map((d) => d.c);
  const sma = (len: number, end = n) => mean(closes.slice(end - len, end));
  const y = days[n - 1];
  const range = y.h - y.l;
  const eligible = y.c > sma(ETH_TREND_DAYS);
  const m100 = sma(100);
  return {
    eligible,
    reason: eligible ? "Uptrend - watching for a breakout" : "No uptrend today - staying out",
    open: todayOpen,
    trigger: todayOpen + ETH_K * range,
    range,
    clues: [
      { key: "below100", label: `Below its 100-day average (early in a recovery)`, met: y.c <= m100 },
      { key: "fresh", label: "50-day average not rising yet (a fresh move)", met: !(sma(50) > sma(50, n - 5)) },
    ],
  };
}

export function btcTriggerFor(btcDays: Bar[], btcTodayOpen: number): number {
  const y = btcDays[btcDays.length - 1];
  return btcTodayOpen + BTC_K * (y.h - y.l);
}

export function scoreEth(plan: EthPlan, breakoutHour: number, btcBrokeOut: boolean): { score: number; clues: EthClue[] } {
  const clues: EthClue[] = [
    { key: "btc", label: "Bitcoin is breaking out too", met: btcBrokeOut },
    { key: "early", label: `Breakout before ${ETH_EARLY_HOUR}:00 UTC`, met: breakoutHour < ETH_EARLY_HOUR },
    ...plan.clues,
  ];
  return { score: clues.filter((c) => c.met).length, clues };
}

// ---- Backtest (same rules, replayed on hourly bars) ----
// If Bitcoin breaks out in the same hour as ETH, the order inside the hour is unknown,
// so the backtest buys ETH at the end of that hour instead (worse price, no look-ahead).

export function backtestEth(
  ethHourly: Bar[],
  btcHourly: Bar[],
  opts: { startBalance?: number; minNotional?: number; from?: number } = {},
): BreakoutBacktest {
  const startBalance = opts.startBalance ?? 100;
  const minNotional = opts.minNotional ?? 0;
  const btcMap = new Map(toDays(btcHourly).map((d) => [d.day.t, d]));
  const all = toDays(ethHourly);
  const days = all.filter((d) => btcMap.has(d.day.t) && btcMap.has(d.day.t - 86_400_000));
  let equity = startBalance;
  let peak = equity;
  let maxDd = 0;
  let streak = 0;
  let longest = 0;
  const trades: BreakoutTrade[] = [];
  const curve: { t: number; equity: number }[] = [];
  const monthly = new Map<string, number>();
  const yearly = new Map<number, { r: number; n: number }>();
  let first = -1;

  for (let i = ETH_HISTORY_DAYS; i < days.length; i++) {
    const { day, hours } = days[i];
    if (opts.from && day.t < opts.from) continue;
    if (days[i - 1].day.t !== day.t - 86_400_000) continue;
    if (first < 0) first = i;
    const year = new Date(day.t).getUTCFullYear();
    const y = yearly.get(year) ?? { r: 1, n: 0 };
    yearly.set(year, y);
    const plan = planEthDay(days.slice(i - ETH_HISTORY_DAYS, i).map((d) => d.day), day.o);
    let dayRet = 0;
    if (plan.eligible) {
      const j = hours.findIndex((b) => b.h >= plan.trigger);
      if (j >= 0 && j <= 22) {
        const btcToday = btcMap.get(day.t)!;
        const btcYesterday = btcMap.get(day.t - 86_400_000)!;
        const bTrig = btcToday.day.o + BTC_K * (btcYesterday.day.h - btcYesterday.day.l);
        const bHour = btcToday.hours.findIndex((b) => b.h >= bTrig);
        const { score } = scoreEth(plan, j, bHour >= 0 && bHour <= j);
        const lev = ethLeverage(score);
        if (lev > 0 && equity * lev >= minNotional) {
          let entry = Math.max(plan.trigger, hours[j].o);
          if (bHour === j) entry = Math.max(entry, hours[j].c);
          const stop = entry * (1 - ethStopDistance(plan.range, entry));
          let exit = day.c;
          let exitHour = 23;
          let reason: BreakoutTrade["reason"] = "end of day";
          for (let q = j + 1; q < 24; q++) {
            if (hours[q].l <= stop) {
              exit = Math.min(stop, hours[q].o);
              exitHour = q;
              reason = "emergency stop";
              break;
            }
          }
          const fundings = [8, 16].filter((h) => h > j && h <= exitHour).length;
          dayRet = lev * (exit / entry - 1 - 2 * (FEE + SLIPPAGE) - fundings * FUNDING);
          trades.push({ day: day.t, hour: j, score, leverage: lev, entry, exit, reason, ret: dayRet });
          y.n++;
          if (dayRet > 0) streak = 0;
          else longest = Math.max(longest, ++streak);
        }
      }
    }
    equity *= 1 + dayRet;
    y.r *= 1 + dayRet;
    const m = new Date(day.t).toISOString().slice(0, 7);
    monthly.set(m, (monthly.get(m) ?? 1) * (1 + dayRet));
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, 1 - equity / peak);
    curve.push({ t: day.t, equity });
  }

  const years = Math.max(1, curve.length) / 365;
  const yearlyList = [...yearly.entries()].map(([year, v]) => ({ year, returnPct: (v.r - 1) * 100, trades: v.n }));
  const firstPrice = first >= 0 ? days[first].day.o : 1;
  const lastPrice = days[days.length - 1]?.day.c ?? 1;
  const step = Math.max(1, Math.floor(curve.length / 300));
  return {
    startBalance,
    endBalance: equity,
    cagrPct: (Math.pow(equity / startBalance, 1 / years) - 1) * 100,
    maxDrawdownPct: maxDd * 100,
    tradesPerYear: trades.length / years,
    winRatePct: trades.length ? (trades.filter((t) => t.ret > 0).length / trades.length) * 100 : 0,
    longestLosingStreak: longest,
    worstMonthPct: Math.min(0, ...[...monthly.values()].map((v) => (v - 1) * 100)),
    profitableYears: `${yearlyList.filter((v) => v.returnPct > 0).length}/${yearlyList.length}`,
    yearly: yearlyList,
    trades,
    equityCurve: curve.filter((_, k) => k % step === 0),
    buyHoldPct: (lastPrice / firstPrice - 1) * 100,
  };
}
