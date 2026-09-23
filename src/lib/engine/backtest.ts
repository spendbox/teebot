import { WARMUP, analyze, precomputeSignals, type Analysis, type Signals } from "./analysis";
import { evaluate, sentimentAdjustment } from "./decide";
import { BREAKEVEN, canSplit, initialStop, nextStop, positionSize, takeProfitPrice, timeStopHit } from "./risk";
import type { Candle, RiskProfile, TradeParams, Tuning } from "./types";

export const FEE = 0.001; // Bybit spot taker fee, per side
export const SLIPPAGE = 0.0005;
const HOUR = 3600_000;

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  pnl: number;
  reason: string;
}

export interface SimResult {
  startBalance: number;
  endBalance: number;
  returnPct: number;
  maxDrawdownPct: number;
  trades: BacktestTrade[];
  winRate: number;
  equityCurve: { t: number; equity: number }[];
}

export interface BacktestResult extends SimResult {
  buyHoldPct: number;
  fixed: SimResult; // same period with the default settings, for comparison
  retunes: number;
  activeSharePct: number; // % of time the coin was considered tradable
}

interface SimOpts {
  candles: Candle[];
  a: Analysis;
  sig: Signals;
  profile: RiskProfile;
  from: number;
  to: number;
  settingsAt: (i: number) => { params: TradeParams; active: boolean };
  startBalance?: number;
  minOrderUsd?: number;
  fngByDay?: Map<string, number>;
  curve?: boolean;
}

// Replays candles one by one with exactly the live bot's rules: entries, stop
// first then take-profit within a candle (the pessimistic order), trailing stop,
// time stop, signal exit, cooldown and the losing-streak brake.
export function simulate(o: SimOpts): SimResult {
  const { candles, a, sig, profile } = o;
  const startBalance = o.startBalance ?? 20;
  const minOrderUsd = o.minOrderUsd ?? 5;
  let cash = startBalance;
  type Pos = { qty: number; entry: number; stop: number; initStop: number; tp: number; tpDone: boolean; highest: number; time: number; cost: number; realized: number; params: TradeParams };
  let pos: Pos | null = null;
  let peak = startBalance;
  let maxDd = 0;
  let pauseUntil = 0;
  let lossStreak = 0;
  const trades: BacktestTrade[] = [];
  const curve: { t: number; equity: number }[] = [];

  const sell = (qty: number, price: number) => qty * price * (1 - SLIPPAGE) * (1 - FEE);

  const close = (i: number, price: number, reason: string) => {
    if (!pos) return;
    const proceeds = pos.realized + sell(pos.qty, price);
    cash += sell(pos.qty, price);
    const pnl = proceeds - pos.cost;
    trades.push({ entryTime: pos.time, exitTime: candles[i].t, entry: pos.entry, exit: price, pnl, reason });
    lossStreak = pnl < 0 ? lossStreak + 1 : 0;
    const pauseHours = lossStreak >= 2 ? 24 : profile.cooldownHours;
    pauseUntil = candles[i].t + pauseHours * HOUR;
    pos = null;
  };

  for (let i = o.from; i < o.to; i++) {
    const k = candles[i];
    const atr = a.atr[i];

    if (pos) {
      if (k.l <= pos.stop) {
        close(i, Math.min(pos.stop, k.o), pos.tpDone ? "trailing stop" : "stop-loss");
      } else {
        if (!pos.tpDone && k.h >= pos.tp) {
          if (canSplit(pos.qty * pos.tp, minOrderUsd)) {
            const half = pos.qty / 2;
            pos.realized += sell(half, pos.tp);
            cash += sell(half, pos.tp);
            pos.qty -= half;
            pos.tpDone = true;
            pos.stop = Math.max(pos.stop, pos.entry * BREAKEVEN);
          } else {
            close(i, pos.tp, "take-profit");
          }
        }
        if (pos) {
          pos.highest = Math.max(pos.highest, k.h);
          pos.stop = nextStop({ entry: pos.entry, stop: pos.stop, highest: pos.highest, atr, params: pos.params, tpDone: pos.tpDone });
          const hoursOpen = (k.t - pos.time) / HOUR;
          if (timeStopHit({ hoursOpen, price: k.c, entry: pos.entry, initialStop: pos.initStop, params: pos.params, tpDone: pos.tpDone })) {
            close(i, k.c, "time stop");
          }
        }
      }
    }

    const { params, active } = o.settingsAt(i);
    const fng = o.fngByDay?.get(new Date(k.t).toISOString().slice(0, 10)) ?? null;
    const { action } = evaluate({
      regime: a.regime[i],
      combined: sig.combined[i],
      confirmations: sig.confirmations[i],
      anyWeight: sig.anyWeight[i],
      threshold: params.entryThreshold + sentimentAdjustment(fng),
      inPosition: pos !== null,
      profile,
    });

    if (pos && action === "exit") {
      close(i, k.c, "signal");
    } else if (!pos && action === "enter" && active && k.t >= pauseUntil) {
      const entry = k.c * (1 + SLIPPAGE);
      const stop = initialStop(entry, atr, params);
      const spend = positionSize({ equity: cash, cash, entry, stop, profile, minOrderUsd });
      if (spend > 0) {
        cash -= spend;
        pos = {
          qty: (spend * (1 - FEE)) / entry,
          entry,
          stop,
          initStop: stop,
          tp: takeProfitPrice(entry, stop, params),
          tpDone: false,
          highest: k.c,
          time: k.t,
          cost: spend,
          realized: 0,
          params,
        };
      }
    }

    const equity = cash + (pos ? pos.qty * k.c : 0);
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, (peak - equity) / peak);
    if (o.curve) curve.push({ t: k.t, equity });
  }
  if (pos) close(o.to - 1, candles[o.to - 1].c, "end of test");

  const wins = trades.filter((t) => t.pnl > 0).length;
  const step = Math.max(1, Math.floor(curve.length / 300));
  return {
    startBalance,
    endBalance: cash,
    returnPct: (cash / startBalance - 1) * 100,
    maxDrawdownPct: maxDd * 100,
    trades,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    equityCurve: curve.filter((_, j) => j % step === 0),
  };
}

// ---- Self-tuning ----

export const TUNE_WINDOW = 60 * 24; // tune on the last 60 days
export const RETUNE_EVERY = 24; // the live bot re-tunes each coin daily
const GRID = {
  entryThreshold: [0.3, 0.4, 0.5],
  stopAtr: [1.5, 2, 2.5],
  takeProfitR: [0.75, 1, 1.5],
};
const MIN_TRADES = 4;

// Tries 27 combinations of settings on the coin's last 60 days and keeps the one
// that did best. To avoid fooling itself, a combination must be profitable on the
// first 70% of the window AND not lose on the last 30% it wasn't picked for.
export function tuneOn(candles: Candle[], a: Analysis, sig: Signals, profile: RiskProfile, end: number, window = TUNE_WINDOW): Tuning {
  const start = Math.max(WARMUP, end - window);
  const split = start + Math.floor((end - start) * 0.7);
  const base = profile.defaults;
  let best: { score: number; params: TradeParams; full: SimResult; test: SimResult } | null = null;

  for (const entryThreshold of GRID.entryThreshold) {
    for (const stopAtr of GRID.stopAtr) {
      for (const takeProfitR of GRID.takeProfitR) {
        const params = { ...base, entryThreshold, stopAtr, takeProfitR };
        const run = (from: number, to: number) =>
          simulate({ candles, a, sig, profile, from, to, settingsAt: () => ({ params, active: true }), startBalance: 1000 });
        const train = run(start, split);
        const test = run(split, end);
        const full = run(start, end);
        if (full.trades.length < MIN_TRADES || train.returnPct <= 0 || test.returnPct < 0) continue;
        // Reward return and win rate, penalise deep dips.
        const score = (full.returnPct * (0.5 + full.winRate / 100)) / (1 + full.maxDrawdownPct);
        if (!best || score > best.score) best = { score, params, full, test };
      }
    }
  }

  if (!best) {
    return {
      params: base,
      active: false,
      reason: "No settings made money on this coin in the last 60 days - pausing it",
      stats: { trades: 0, winRate: 0, returnPct: 0, testReturnPct: 0, maxDrawdownPct: 0 },
    };
  }
  return {
    params: best.params,
    active: true,
    reason: `Best of 27 settings over 60 days: ${best.full.trades.length} trades, ${best.full.winRate.toFixed(0)}% won`,
    stats: {
      trades: best.full.trades.length,
      winRate: best.full.winRate,
      returnPct: best.full.returnPct,
      testReturnPct: best.test.returnPct,
      maxDrawdownPct: best.full.maxDrawdownPct,
    },
  };
}

export function tune(candles: Candle[], profile: RiskProfile): Tuning {
  const a = analyze(candles);
  const sig = precomputeSignals(a, Math.max(WARMUP, candles.length - TUNE_WINDOW));
  return tuneOn(candles, a, sig, profile, candles.length);
}

// ---- Backtest ----

// Walk-forward test of the adaptive bot: every day it re-tunes on the previous
// 60 days only, then trades the next day with those settings. This is the
// honest way to test a self-tuning system - it never sees the future.
export function backtest(
  candles: Candle[],
  profile: RiskProfile,
  opts: { startBalance?: number; minOrderUsd?: number; fngByDay?: Map<string, number>; tuneWindow?: number } = {},
): BacktestResult {
  const window = opts.tuneWindow ?? TUNE_WINDOW;
  const a = analyze(candles);
  const sig = precomputeSignals(a, WARMUP);
  const from = Math.min(candles.length, WARMUP + window);
  const to = candles.length;

  let current: Tuning | null = null;
  let tunedAt = -Infinity;
  let retunes = 0;
  let activeCandles = 0;
  const settingsAt = (i: number) => {
    if (i - tunedAt >= RETUNE_EVERY) {
      current = tuneOn(candles, a, sig, profile, i, window);
      tunedAt = i;
      retunes++;
    }
    if (current!.active) activeCandles++;
    return { params: current!.params, active: current!.active };
  };

  const common = { candles, a, sig, profile, from, to, startBalance: opts.startBalance, minOrderUsd: opts.minOrderUsd, fngByDay: opts.fngByDay, curve: true };
  const adaptive = simulate({ ...common, settingsAt });
  const fixed = simulate({ ...common, settingsAt: () => ({ params: profile.defaults, active: true }) });

  const first = candles[Math.min(from, to - 1)]?.c ?? 1;
  const last = candles[to - 1]?.c ?? 1;
  return {
    ...adaptive,
    buyHoldPct: (last / first - 1) * 100,
    fixed,
    retunes,
    activeSharePct: to > from ? (activeCandles / (to - from)) * 100 : 0,
  };
}
