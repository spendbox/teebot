import { describe, expect, it } from "vitest";
import { findPivots, liveTrades, perfectTrades, summarize, waveReport, type Tick } from "@/lib/wave/strategy";

const ticks = (ps: number[]): Tick[] => ps.map((p, i) => ({ t: i * 60_000, p }));

// Down to 100 000, up to 100 300, down to 100 100, up to 100 400, then a $30 wiggle.
const PATH = ticks([100_050, 100_000, 100_100, 100_300, 100_200, 100_100, 100_250, 100_400, 100_370, 100_340]);

describe("finding waves", () => {
  it("marks each low and high followed by a $50+ move", () => {
    expect(findPivots(PATH, 50).map((p) => [p.kind, p.p])).toEqual([
      ["high", 100_050],
      ["low", 100_000],
      ["high", 100_300],
      ["low", 100_100],
      ["high", 100_400], // confirmed: it has dropped $60 since
    ]);
    // With $100 waves the last top is not confirmed yet.
    expect(findPivots(PATH, 100).map((p) => p.p)).toEqual([100_000, 100_300, 100_100]);
  });

  it("ignores moves smaller than the wave size", () => {
    expect(findPivots(ticks([100, 130, 110, 140, 120]), 50)).toEqual([]);
  });
});

describe("perfect timing", () => {
  it("buys each exact low and sells each exact high", () => {
    const t = perfectTrades(findPivots(PATH, 50), false, 0);
    expect(t.map((x) => x.grossUsd)).toEqual([300, 300]); // 100 000 -> 100 300, 100 100 -> 100 400
    const both = perfectTrades(findPivots(PATH, 50), true, 0);
    expect(both.map((x) => x.grossUsd)).toEqual([50, 300, 200, 300]);
  });
});

describe("real-time bot", () => {
  it("buys $50 above the low and sells $50 below the high", () => {
    const t = liveTrades(PATH, 50, false, 0);
    expect(t.map((x) => [x.entry, x.exit])).toEqual([
      [100_100, 100_200], // low 100 000 confirmed at 100 100; high 100 300 confirmed at 100 200
      [100_250, 100_340], // low 100 100 confirmed at 100 250; high 100 400 confirmed at 100 340
    ]);
  });

  it("fees turn small waves into losses", () => {
    const noFees = summarize(liveTrades(PATH, 50, false, 0));
    const fees = summarize(liveTrades(PATH, 50, false, 0.00065));
    expect(noFees.grossUsd).toBe(190);
    expect(fees.netUsd).toBeLessThan(0); // ~$130 of fees per round trip at $100k
  });
});

describe("report", () => {
  it("compares wave sizes on the same prices", () => {
    const r = waveReport(PATH, [50, 100]);
    expect(r.rows.map((x) => x.step)).toEqual([50, 100]);
    expect(r.holdUsd).toBe(290);
    expect(r.recent.length).toBe(2);
  });
});
