// Confidence breakout day-trader for Bitcoin perpetual futures.
//
// Research summary (Bitstamp BTC/USD hourly data, 2017-2026, fees + slippage +
// funding included; thresholds learned on 2017-2020 only):
//   - Trade only when yesterday closed above its 20-day average (uptrend).
//   - Buy when price rises above today's open + 0.7 x yesterday's high-low range.
//   - Score the setup out of 7 clues; skip scores of 4 or less.
//   - Leverage by score (balanced: 5 -> 2x, 6 -> 4x, 7 -> 5x).
//   - If the breakout hour's volume turns out weak, exit when that hour ends.
//   - 5% emergency stop; always flat by the end of the UTC day.
// This file is shared by the live bot and the backtester so they can't drift apart.

export interface Bar {
  t: number; // open time, ms UTC
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export const K = 0.7; // breakout distance, as a fraction of yesterday's range
export const VOLUME_MULT = 1.5; // breakout hour must trade 1.5x a normal hour
export const EMERGENCY_STOP = 0.05; // sell if a trade falls 5%
export const HISTORY_DAYS = 106; // completed days needed (100-day average + 5-day slope)

// Learned from 2017-2020 breakouts only (medians), then tested on 2021-2026.
export const THRESHOLDS = { trendPct: 8.575, rangeRel: 0.752, hour: 12 };

export type Profile = "balanced" | "safer";

export function leverageFor(score: number, profile: Profile): number {
  if (score <= 4) return 0;
  if (profile === "safer") return score === 5 ? 2 : 3;
  return score >= 7 ? 5 : score === 6 ? 4 : 2;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export interface Clue {
  key: string;
  label: string;
  met: boolean;
}

export interface DayPlan {
  eligible: boolean; // uptrend: yesterday closed above its 20-day average
  reason: string;
  open: number;
  trigger: number;
  avgHourVolume: number;
  clues: Clue[]; // the 6 clues known at the start of the day
}

// `days` are completed UTC days, oldest first. `todayOpen` is today's opening price.
export function planDay(days: Bar[], todayOpen: number, todayStart: number): DayPlan {
  const n = days.length;
  if (n < HISTORY_DAYS) {
    return { eligible: false, reason: "Not enough price history", open: todayOpen, trigger: 0, avgHourVolume: 0, clues: [] };
  }
  const closes = days.map((d) => d.c);
  const sma = (len: number, end = n) => mean(closes.slice(end - len, end));
  const y = days[n - 1];
  const m20 = sma(20);
  const m50 = sma(50);
  const m50Before = sma(50, n - 5);
  const m100 = sma(100);
  const last20 = days.slice(n - 20);
  const avgRange = mean(last20.map((d) => (d.h - d.l) / d.o));
  const range = y.h - y.l;
  const weekday = ![0, 6].includes(new Date(todayStart).getUTCDay());

  const clues: Clue[] = [
    { key: "trend", label: `Strong uptrend (${((y.c / m20 - 1) * 100).toFixed(1)}% above 20-day average, needs ${THRESHOLDS.trendPct.toFixed(1)}%)`, met: (y.c / m20 - 1) * 100 >= THRESHOLDS.trendPct },
    { key: "long", label: "Above the 100-day average (long-term uptrend)", met: y.c > m100 },
    { key: "rising", label: "50-day average is rising", met: m50 > m50Before },
    { key: "up", label: "Yesterday was an up day", met: y.c > y.o },
    { key: "weekday", label: "It's a weekday", met: weekday },
    { key: "calm", label: "Yesterday's range was smaller than usual", met: range / y.o / avgRange < THRESHOLDS.rangeRel },
  ];

  const eligible = y.c > m20;
  return {
    eligible,
    reason: eligible ? "Uptrend - watching for a breakout" : "No uptrend today - staying out",
    open: todayOpen,
    trigger: todayOpen + K * range,
    avgHourVolume: mean(last20.map((d) => d.v)) / 24,
    clues,
  };
}

// The 7th clue depends on when the breakout happens.
export function scoreSetup(plan: DayPlan, breakoutHour: number): { score: number; clues: Clue[] } {
  const clues = [...plan.clues, { key: "early", label: `Breakout before ${THRESHOLDS.hour}:00 UTC`, met: breakoutHour < THRESHOLDS.hour }];
  return { score: clues.filter((c) => c.met).length, clues };
}

export function volumeConfirmed(hourVolume: number, plan: DayPlan): boolean {
  return hourVolume >= VOLUME_MULT * plan.avgHourVolume;
}

// ---- Backtest (same rules, replayed on hourly bars) ----

export const FEE = 0.00055; // Bybit perpetual taker fee per side
export const SLIPPAGE = 0.0005; // per side, market orders
export const FUNDING = 0.0001; // per 8-hour funding time held through

export interface BreakoutTrade {
  day: number;
  hour: number;
  score: number;
  leverage: number;
  entry: number;
  exit: number;
  reason: "end of day" | "weak volume" | "emergency stop";
  ret: number; // return on the account
}

export interface BreakoutBacktest {
  startBalance: number;
  endBalance: number;
  cagrPct: number;
  maxDrawdownPct: number;
  tradesPerYear: number;
  winRatePct: number;
  longestLosingStreak: number;
  worstMonthPct: number;
  profitableYears: string;
  yearly: { year: number; returnPct: number; trades: number }[];
  trades: BreakoutTrade[];
  equityCurve: { t: number; equity: number }[];
  buyHoldPct: number;
}

export function toDays(hourly: Bar[]): { day: Bar; hours: Bar[] }[] {
  const map = new Map<number, Bar[]>();
  for (const b of hourly) {
    const d = Math.floor(b.t / 86_400_000) * 86_400_000;
    let list = map.get(d);
    if (!list) map.set(d, (list = []));
    list.push(b);
  }
  return [...map.entries()]
    .filter(([, hs]) => hs.length === 24)
    .sort((a, b) => a[0] - b[0])
    .map(([t, hs]) => ({
      day: { t, o: hs[0].o, c: hs[23].c, h: Math.max(...hs.map((x) => x.h)), l: Math.min(...hs.map((x) => x.l)), v: hs.reduce((s, x) => s + x.v, 0) },
      hours: hs,
    }));
}

export function backtestBreakout(
  hourly: Bar[],
  opts: { profile?: Profile; startBalance?: number; minNotional?: number; from?: number } = {},
): BreakoutBacktest {
  const profile = opts.profile ?? "balanced";
  const startBalance = opts.startBalance ?? 50;
  const minNotional = opts.minNotional ?? 0;
  const days = toDays(hourly);
  let equity = startBalance;
  let peak = equity;
  let maxDd = 0;
  let streak = 0;
  let longest = 0;
  const trades: BreakoutTrade[] = [];
  const curve: { t: number; equity: number }[] = [];
  const monthly = new Map<string, number>();
  const yearly = new Map<number, { r: number; n: number }>();
  let firstDay = -1;

  for (let i = HISTORY_DAYS; i < days.length; i++) {
    const { day, hours } = days[i];
    if (opts.from && day.t < opts.from) continue;
    if (firstDay < 0) firstDay = i;
    const year = new Date(day.t).getUTCFullYear();
    const y = yearly.get(year) ?? { r: 1, n: 0 };
    yearly.set(year, y);
    const plan = planDay(days.slice(i - HISTORY_DAYS, i).map((d) => d.day), day.o, day.t);
    let dayRet = 0;
    if (plan.eligible) {
      const j = hours.findIndex((b) => b.h >= plan.trigger);
      if (j >= 0) {
        const { score } = scoreSetup(plan, j);
        const lev = leverageFor(score, profile);
        if (lev > 0 && equity * lev >= minNotional) {
          const entry = Math.max(plan.trigger, hours[j].o);
          let exit = day.c;
          let exitHour = 23;
          let reason: BreakoutTrade["reason"] = "end of day";
          if (!volumeConfirmed(hours[j].v, plan)) {
            exit = hours[j].c;
            exitHour = j;
            reason = "weak volume";
          } else {
            const stop = entry * (1 - EMERGENCY_STOP);
            for (let q = j + 1; q < 24; q++) {
              if (hours[q].l <= stop) {
                exit = Math.min(stop, hours[q].o);
                exitHour = q;
                reason = "emergency stop";
                break;
              }
            }
          }
          const fundings = [8, 16].filter((h) => h > j && h <= exitHour).length;
          const r = exit / entry - 1 - 2 * (FEE + SLIPPAGE) - fundings * FUNDING;
          dayRet = lev * r;
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

  const nDays = Math.max(1, curve.length);
  const years = nDays / 365;
  const yearlyList = [...yearly.entries()].map(([year, v]) => ({ year, returnPct: (v.r - 1) * 100, trades: v.n }));
  const first = firstDay >= 0 ? days[firstDay].day.o : 1;
  const last = days[days.length - 1]?.day.c ?? 1;
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
    buyHoldPct: (last / first - 1) * 100,
  };
}
