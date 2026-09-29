// Wave trader: buy the lows, sell the highs, ignoring moves smaller than a set
// dollar amount (for example $50).
//
// A "wave" is a move of at least `step` dollars in one direction before the
// price turns and moves at least `step` dollars back the other way.
//
// Two ways to measure it, on the same waves:
//   - Perfect: buys at the exact bottom and sells at the exact top of every
//     wave. Only possible with hindsight; this is the ceiling.
//   - Live bot: can only know a bottom was the bottom once the price has
//     already risen `step` dollars from it (and the same for tops). So it buys
//     `step` above each bottom and sells `step` below each top, which costs
//     2 x step of every wave before fees.
// Prices are 1-minute closes: the live bot checks once a minute.

export interface Tick {
  t: number; // ms UTC
  p: number; // price
}

export interface Pivot {
  t: number;
  p: number;
  kind: "low" | "high";
}

export const FEE = 0.00055; // Bybit perpetual taker fee per side (market orders)
export const SLIPPAGE = 0.0001; // per side; Bitcoin futures are very liquid
export const STEPS = [50, 100, 200, 300, 500, 1000, 2000]; // dollar sizes compared

// Turning points: each low and high that was followed by a move of at least `step`.
// The last, still-unconfirmed extreme is not included.
export function findPivots(ticks: Tick[], step: number): Pivot[] {
  const pivots: Pivot[] = [];
  if (ticks.length === 0) return pivots;
  let hi = ticks[0];
  let lo = ticks[0];
  let dir: "up" | "down" | null = null; // direction of the wave in progress
  for (const k of ticks) {
    if (dir === null) {
      if (k.p > hi.p) hi = k;
      if (k.p < lo.p) lo = k;
      if (k.p - lo.p >= step) {
        pivots.push({ t: lo.t, p: lo.p, kind: "low" });
        dir = "up";
        hi = k;
      } else if (hi.p - k.p >= step) {
        pivots.push({ t: hi.t, p: hi.p, kind: "high" });
        dir = "down";
        lo = k;
      }
    } else if (dir === "up") {
      if (k.p > hi.p) hi = k;
      else if (hi.p - k.p >= step) {
        pivots.push({ t: hi.t, p: hi.p, kind: "high" });
        dir = "down";
        lo = k;
      }
    } else {
      if (k.p < lo.p) lo = k;
      else if (k.p - lo.p >= step) {
        pivots.push({ t: lo.t, p: lo.p, kind: "low" });
        dir = "up";
        hi = k;
      }
    }
  }
  return pivots;
}

export interface WaveTrade {
  side: "long" | "short";
  entryT: number;
  entry: number;
  exitT: number;
  exit: number;
  grossUsd: number; // per 1 BTC, before fees
  netUsd: number; // per 1 BTC, after fees and slippage
  netPct: number; // % of the money in the trade (1x)
}

export interface WaveSummary {
  trades: number;
  won: number;
  grossUsd: number; // per 1 BTC
  netUsd: number; // per 1 BTC
  netPct: number; // sum of trade returns at 1x (no compounding)
  compoundPct: number; // $100 reinvested every trade, at 1x
}

function trade(side: "long" | "short", entryT: number, entry: number, exitT: number, exit: number, cost: number): WaveTrade {
  const grossUsd = side === "long" ? exit - entry : entry - exit;
  const costUsd = (entry + exit) * cost;
  const netUsd = grossUsd - costUsd;
  return { side, entryT, entry, exitT, exit, grossUsd, netUsd, netPct: (netUsd / entry) * 100 };
}

export function summarize(trades: WaveTrade[]): WaveSummary {
  let grossUsd = 0;
  let netUsd = 0;
  let netPct = 0;
  let growth = 1;
  let won = 0;
  for (const t of trades) {
    grossUsd += t.grossUsd;
    netUsd += t.netUsd;
    netPct += t.netPct;
    growth *= Math.max(0, 1 + t.netPct / 100);
    if (t.netUsd > 0) won++;
  }
  return { trades: trades.length, won, grossUsd, netUsd, netPct, compoundPct: (growth - 1) * 100 };
}

// Hindsight: buy every low and sell every high at the exact turning price.
// With `shorts`, it also sells short at every high and buys back at the next low.
export function perfectTrades(pivots: Pivot[], shorts: boolean, cost = FEE + SLIPPAGE): WaveTrade[] {
  const out: WaveTrade[] = [];
  for (let i = 1; i < pivots.length; i++) {
    const a = pivots[i - 1];
    const b = pivots[i];
    if (a.kind === "low") out.push(trade("long", a.t, a.p, b.t, b.p, cost));
    else if (shorts) out.push(trade("short", a.t, a.p, b.t, b.p, cost));
  }
  return out;
}

// What a bot checking once a minute could actually do: buy as soon as the price
// is `step` above the lowest point since the last top (the low is now confirmed),
// sell as soon as it is `step` below the highest point since that buy.
export function liveTrades(ticks: Tick[], step: number, shorts: boolean, cost = FEE + SLIPPAGE): WaveTrade[] {
  const out: WaveTrade[] = [];
  if (ticks.length === 0) return out;
  let hi = ticks[0].p;
  let lo = ticks[0].p;
  let dir: "up" | "down" | null = null;
  let entry: Tick | null = null;
  for (const k of ticks) {
    if (dir === null) {
      hi = Math.max(hi, k.p);
      lo = Math.min(lo, k.p);
      if (k.p - lo >= step) {
        dir = "up";
        hi = k.p;
        entry = k;
      } else if (hi - k.p >= step) {
        dir = "down";
        lo = k.p;
        if (shorts) entry = k;
      }
    } else if (dir === "up") {
      hi = Math.max(hi, k.p);
      if (hi - k.p >= step) {
        if (entry) out.push(trade("long", entry.t, entry.p, k.t, k.p, cost));
        dir = "down";
        lo = k.p;
        entry = shorts ? k : null;
      }
    } else {
      lo = Math.min(lo, k.p);
      if (k.p - lo >= step) {
        if (entry) out.push(trade("short", entry.t, entry.p, k.t, k.p, cost));
        dir = "up";
        hi = k.p;
        entry = k;
      }
    }
  }
  return out;
}

export interface WaveRow {
  step: number;
  waves: number; // completed up-waves (low -> high)
  avgWaveUsd: number; // average size of an up-wave
  perfect: WaveSummary; // buy every low, sell every high (long only)
  perfectBoth: WaveSummary; // also short every high back down to the low
  live: WaveSummary; // realistic long-only bot
  liveBoth: WaveSummary; // realistic bot that also shorts
}

export interface WaveReport {
  from: number;
  to: number;
  startPrice: number;
  endPrice: number;
  holdUsd: number; // just holding 1 BTC
  holdPct: number;
  feePerSidePct: number;
  rows: WaveRow[];
  recent: WaveTrade[]; // latest realistic long trades at the first step size
}

export function waveReport(ticks: Tick[], steps = STEPS, cost = FEE + SLIPPAGE): WaveReport {
  if (ticks.length < 2) throw new Error("Not enough prices to test.");
  const first = ticks[0];
  const last = ticks[ticks.length - 1];
  const rows = steps.map((step) => {
    const pivots = findPivots(ticks, step);
    const perfect = perfectTrades(pivots, false, cost);
    return {
      step,
      waves: perfect.length,
      avgWaveUsd: perfect.length ? perfect.reduce((s, t) => s + t.grossUsd, 0) / perfect.length : 0,
      perfect: summarize(perfect),
      perfectBoth: summarize(perfectTrades(pivots, true, cost)),
      live: summarize(liveTrades(ticks, step, false, cost)),
      liveBoth: summarize(liveTrades(ticks, step, true, cost)),
    };
  });
  return {
    from: first.t,
    to: last.t,
    startPrice: first.p,
    endPrice: last.p,
    holdUsd: last.p - first.p,
    holdPct: (last.p / first.p - 1) * 100,
    feePerSidePct: cost * 100,
    rows,
    recent: liveTrades(ticks, steps[0], false, cost).slice(-20).reverse(),
  };
}
