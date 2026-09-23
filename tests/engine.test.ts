import { describe, expect, it } from "vitest";
import { WARMUP, adaptiveWeights, analyze } from "@/lib/engine/analysis";
import { backtest } from "@/lib/engine/backtest";
import { decide } from "@/lib/engine/decide";
import { atr, ema, rsi, sma } from "@/lib/engine/indicators";
import { PROFILES } from "@/lib/engine/profiles";
import { initialStop, nextStop, positionSize } from "@/lib/engine/risk";
import type { Candle } from "@/lib/engine/types";
import { roundStep, sign } from "@/lib/bybit";

const cautious = PROFILES.cautious;

// Deterministic pseudo-random market: drift per hour and volatility per phase.
function market(phases: { hours: number; drift: number; vol: number }[], seed = 7): Candle[] {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
  const out: Candle[] = [];
  let price = 100;
  let t = Date.UTC(2025, 0, 1);
  for (const p of phases) {
    for (let k = 0; k < p.hours; k++) {
      const o = price;
      const c = o * (1 + p.drift + rand() * p.vol);
      const h = Math.max(o, c) * (1 + Math.abs(rand()) * p.vol * 0.5);
      const l = Math.min(o, c) * (1 - Math.abs(rand()) * p.vol * 0.5);
      out.push({ t, o, h, l, c, v: 1000 * (1 + Math.abs(rand())) });
      price = c;
      t += 3600_000;
    }
  }
  return out;
}

describe("indicators", () => {
  it("computes simple averages", () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([NaN, 1.5, 2.5, 3.5]);
    expect(ema([1, 2, 3], 3)[2]).toBe(2);
  });

  it("RSI is 100 for a market that only rises", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(rsi(up)[29]).toBe(100);
  });

  it("ATR matches the constant range of identical candles", () => {
    const h = Array(30).fill(11);
    const l = Array(30).fill(9);
    const c = Array(30).fill(10);
    expect(atr(h, l, c, 14)[29]).toBeCloseTo(2);
  });
});

describe("risk", () => {
  it("risks about 1% of the balance per trade", () => {
    const stop = initialStop(100, 1.5, cautious.defaults); // 3% below
    const spend = positionSize({ equity: 1000, cash: 1000, entry: 100, stop, profile: cautious, minOrderUsd: 5 });
    expect(spend * ((100 - stop) / 100)).toBeCloseTo(10);
  });

  it("never puts more than 35% of the balance into one coin", () => {
    const stop = initialStop(100, 0.1, cautious.defaults); // 1% floor
    const spend = positionSize({ equity: 1000, cash: 1000, entry: 100, stop, profile: cautious, minOrderUsd: 5 });
    expect(spend).toBeCloseTo(350);
  });

  it("works with a $20 account and the exchange minimum", () => {
    const stop = initialStop(100, 1.5, cautious.defaults);
    const spend = positionSize({ equity: 20, cash: 20, entry: 100, stop, profile: cautious, minOrderUsd: 5 });
    expect(spend).toBeGreaterThanOrEqual(5);
    expect(spend * 0.03).toBeLessThanOrEqual(20 * 0.01 * 1.5);
  });

  it("skips trades when the minimum order would risk too much", () => {
    const stop = initialStop(100, 4, cautious.defaults); // 8% cap
    expect(positionSize({ equity: 20, cash: 20, entry: 100, stop, profile: cautious, minOrderUsd: 10 })).toBe(0);
  });

  it("only moves the stop up, and only after profit has been taken", () => {
    const p = cautious.defaults;
    expect(nextStop({ entry: 100, stop: 97, highest: 110, atr: 2, params: p, tpDone: false })).toBe(97);
    const moved = nextStop({ entry: 100, stop: 97, highest: 110, atr: 2, params: p, tpDone: true });
    expect(moved).toBeCloseTo(105);
    expect(nextStop({ entry: 100, stop: moved, highest: 104, atr: 2, params: p, tpDone: true })).toBe(moved);
  });
});

describe("decisions", () => {
  it("stays in cash during a downtrend", () => {
    const candles = market([{ hours: 600, drift: -0.002, vol: 0.01 }]);
    const a = analyze(candles);
    const i = candles.length - 1;
    expect(a.regime[i]).toBe("downtrend");
    expect(decide(a, i, cautious, { inPosition: false, fng: 50 }).action).not.toBe("enter");
  });

  it("gives weight only to strategies that have been working", () => {
    const candles = market([{ hours: 600, drift: 0.002, vol: 0.01 }]);
    const a = analyze(candles);
    const w = adaptiveWeights(a, candles.length - 1);
    const total = w.trend + w.meanReversion + w.breakout;
    expect(total).toBeCloseTo(1);
    expect(w.trend).toBeGreaterThan(w.meanReversion);
  });

  it("demands a stronger signal when the market is greedy", () => {
    const candles = market([{ hours: 400, drift: 0.001, vol: 0.01 }]);
    const a = analyze(candles);
    const i = candles.length - 1;
    const calm = decide(a, i, cautious, { inPosition: false, fng: 50 });
    const greedy = decide(a, i, cautious, { inPosition: false, fng: 90 });
    expect(greedy.threshold).toBeGreaterThan(calm.threshold);
  });

  it("never looks at future candles", () => {
    const candles = market([{ hours: 500, drift: 0.001, vol: 0.02 }]);
    const cut = 400;
    const full = analyze(candles);
    const past = analyze(candles.slice(0, cut + 1));
    const a = decide(full, cut, cautious, { inPosition: false, fng: null });
    const b = decide(past, cut, cautious, { inPosition: false, fng: null });
    expect(a.combined).toBeCloseTo(b.combined, 10);
    expect(a.action).toBe(b.action);
  });
});

describe("backtest", () => {
  const candles = market([
    { hours: 400, drift: 0.0005, vol: 0.01 },
    { hours: 500, drift: 0.0015, vol: 0.012 },
    { hours: 300, drift: 0, vol: 0.015 },
    { hours: 600, drift: -0.0015, vol: 0.015 },
    { hours: 400, drift: 0.001, vol: 0.01 },
  ]);
  const r = backtest(candles, cautious, { startBalance: 20, tuneWindow: 300 });

  it("trades and stays within the drawdown limit", () => {
    expect(candles.length).toBeGreaterThan(WARMUP);
    expect(r.trades.length).toBeGreaterThan(0);
    expect(r.endBalance).toBeGreaterThan(0);
    expect(r.maxDrawdownPct).toBeLessThan(cautious.maxDrawdown * 100);
  });

  it("each losing trade loses roughly 1-2% of the balance at most", () => {
    for (const t of r.trades) expect(t.pnl).toBeGreaterThan(-20 * 0.03);
  });

  it("loses far less than buy-and-hold in a crash", () => {
    const crash = market([
      { hours: 400, drift: 0.0005, vol: 0.01 },
      { hours: 800, drift: -0.002, vol: 0.02 },
    ]);
    const c = backtest(crash, cautious, { startBalance: 20, tuneWindow: 300 });
    expect(c.buyHoldPct).toBeLessThan(-50);
    expect(c.returnPct).toBeGreaterThan(-15);
  });
});

describe("bybit helpers", () => {
  it("rounds down to exchange steps without float noise", () => {
    expect(roundStep(0.1234567, 0.000001)).toBe("0.123456");
    expect(roundStep(7.999, 0.01)).toBe("7.99");
    expect(roundStep(12, 1)).toBe("12");
  });

  it("signs requests the way Bybit expects", () => {
    // HMAC-SHA256(timestamp + apiKey + recvWindow + payload)
    const sig = sign("secret", "1700000000000", "key", "category=spot");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(sig).toBe(sign("secret", "1700000000000", "key", "category=spot"));
    expect(sig).not.toBe(sign("secret", "1700000000001", "key", "category=spot"));
  });
});
