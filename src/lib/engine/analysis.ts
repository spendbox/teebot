import { adx, atr, clamp, ema, priorHigh, priorLow, rollingMedian, rsi, sma, stdev } from "./indicators";
import type { Candle, Regime, StrategyName } from "./types";

export const STRATEGIES: StrategyName[] = ["trend", "meanReversion", "breakout", "pullback"];

// Enough history for the 200-candle trend line plus the adaptive window.
export const WARMUP = 250;

export interface Analysis {
  candles: Candle[];
  atr: number[];
  regime: Regime[];
  scores: Record<StrategyName, number[]>;
}

// Every value at index i uses only candles 0..i, so the same analysis is safe
// to reuse candle-by-candle in a backtest without peeking into the future.
export function analyze(candles: Candle[]): Analysis {
  const c = candles.map((k) => k.c);
  const h = candles.map((k) => k.h);
  const l = candles.map((k) => k.l);
  const v = candles.map((k) => k.v);

  const ema20 = ema(c, 20);
  const ema50 = ema(c, 50);
  const ema200 = ema(c, 200);
  const atr14 = atr(h, l, c, 14);
  const adx14 = adx(h, l, c, 14);
  const rsi14 = rsi(c, 14);
  const sma20 = sma(c, 20);
  const sd20 = stdev(c, 20);
  const hi20 = priorHigh(h, 20);
  const lo10 = priorLow(l, 10);
  const vol20 = sma(v, 20);
  const atrPct = atr14.map((a, i) => a / c[i]);
  const atrPctMedian = rollingMedian(atrPct, 100);

  const n = candles.length;
  const trend = new Array<number>(n).fill(0);
  const meanReversion = new Array<number>(n).fill(0);
  const breakout = new Array<number>(n).fill(0);
  const pullback = new Array<number>(n).fill(0);
  const regime = new Array<Regime>(n).fill("range");

  for (let i = 0; i < n; i++) {
    const a = atr14[i];
    if (Number.isNaN(ema200[i]) || Number.isNaN(a) || a === 0) continue;

    // Trend follower: fast average above slow average, strongest above the 200 line.
    let t = clamp((ema20[i] - ema50[i]) / a, -1, 1);
    if (t > 0 && c[i] < ema200[i]) t *= 0.3;
    trend[i] = t;

    // Range trader: buy when stretched far below the average and oversold.
    const z = sd20[i] > 0 ? (c[i] - sma20[i]) / sd20[i] : 0;
    let m = clamp(-z / 2, -1, 1);
    if (m > 0 && rsi14[i] > 40) m *= 0.3;
    meanReversion[i] = m;

    // Breakout catcher: close above the last 20 candles' high, better with volume.
    if (c[i] > hi20[i]) {
      breakout[i] = v[i] > 1.5 * vol20[i] ? 1 : 0.6;
    } else if (c[i] < lo10[i]) {
      breakout[i] = -1;
    } else {
      const mid = (hi20[i] + lo10[i]) / 2;
      const half = (hi20[i] - lo10[i]) / 2;
      breakout[i] = half > 0 ? clamp(((c[i] - mid) / half) * 0.3, -0.3, 0.3) : 0;
    }

    // Pullback buyer: in an uptrend, buy the dip back to the 20/50 averages once
    // a candle closes green again. This setup fires often and wins often.
    const upTrend = ema50[i] > ema200[i] && c[i] > ema200[i];
    if (upTrend && i >= 3) {
      const recentLow = Math.min(l[i], l[i - 1], l[i - 2]);
      const touched = recentLow <= ema20[i] + 0.3 * a && recentLow >= ema50[i] - 1.0 * a;
      const turningUp = c[i] > candles[i].o && c[i] > c[i - 1];
      if (touched && turningUp && rsi14[i] >= 35 && rsi14[i] <= 60) pullback[i] = 0.9;
      else if (touched && rsi14[i] < 45) pullback[i] = 0.4;
    } else if (c[i] < ema50[i] - a) {
      pullback[i] = -0.5;
    }

    // Market type.
    if (!Number.isNaN(atrPctMedian[i]) && atrPct[i] > 2 * atrPctMedian[i]) {
      regime[i] = "chaotic";
    } else if (adx14[i] > 20 && ema50[i] > ema200[i] && c[i] > ema200[i]) {
      regime[i] = "uptrend";
    } else if (adx14[i] > 20 && ema50[i] < ema200[i] && c[i] < ema200[i]) {
      regime[i] = "downtrend";
    } else {
      regime[i] = "range";
    }
  }

  return { candles, atr: atr14, regime, scores: { trend, meanReversion, breakout, pullback } };
}

const ADAPT_WINDOW = 300; // ~12 days of hourly candles
const HORIZON = 6; // judge each buy signal by the next 6 hours
const COST = 0.002; // fees + slippage for a round trip
const MIN_SAMPLES = 5;

// Score each strategy by whether its recent buy signals were actually followed
// by gains (after costs), weighted by signal strength and adjusted for
// consistency. Only outcomes already known at candle i are used. Strategies
// that have been losing get zero weight; if none are working, the bot sits out.
export function adaptiveWeights(a: Analysis, i: number): Record<StrategyName, number> {
  const c = a.candles;
  const start = Math.max(0, i - ADAPT_WINDOW);
  const perf: Record<StrategyName, number> = { trend: 0, meanReversion: 0, breakout: 0, pullback: 0 };

  for (const s of STRATEGIES) {
    const sc = a.scores[s];
    let n = 0;
    let sum = 0;
    let sumSq = 0;
    for (let j = start; j + HORIZON <= i; j++) {
      if (sc[j] <= 0.2) continue;
      const r = sc[j] * (c[j + HORIZON].c / c[j].c - 1 - COST);
      n++;
      sum += r;
      sumSq += r * r;
    }
    if (n < MIN_SAMPLES) continue;
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    perf[s] = sd > 0 ? (mean / sd) * Math.sqrt(n) : 0;
  }

  const positive = STRATEGIES.map((s) => Math.max(0, perf[s]));
  const total = positive.reduce((x, y) => x + y, 0);
  const weights: Record<StrategyName, number> = { trend: 0, meanReversion: 0, breakout: 0, pullback: 0 };
  if (total > 0) STRATEGIES.forEach((s, k) => (weights[s] = positive[k] / total));
  return weights;
}

export interface Signals {
  combined: number[];
  confirmations: number[];
  anyWeight: boolean[];
}

// Combined signal for every candle from `from` onwards. It depends only on past
// candles, so a backtest or the tuner can compute it once and replay many settings.
export function precomputeSignals(a: Analysis, from = WARMUP): Signals {
  const n = a.candles.length;
  const combined = new Array<number>(n).fill(0);
  const confirmations = new Array<number>(n).fill(0);
  const anyWeight = new Array<boolean>(n).fill(false);
  for (let i = Math.max(from, 1); i < n; i++) {
    const w = adaptiveWeights(a, i);
    let sum = 0;
    let conf = 0;
    let any = false;
    for (const s of STRATEGIES) {
      sum += w[s] * a.scores[s][i];
      if (a.scores[s][i] > 0.2) conf++;
      if (w[s] > 0) any = true;
    }
    combined[i] = sum;
    confirmations[i] = conf;
    anyWeight[i] = any;
  }
  return { combined, confirmations, anyWeight };
}
