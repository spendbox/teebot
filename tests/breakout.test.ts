import { describe, expect, it } from "vitest";
import {
  HISTORY_DAYS,
  THRESHOLDS,
  backtestBreakout,
  leverageFor,
  planDay,
  scoreSetup,
  toDays,
  volumeConfirmed,
  type Bar,
} from "@/lib/breakout/strategy";

const DAY = 86_400_000;
const START = Date.UTC(2024, 0, 1); // a Monday

// Daily bars rising `drift` per day with a fixed range.
function days(n: number, drift = 0.01, range = 0.03, volume = 2400): Bar[] {
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = p * (1 + drift);
    out.push({ t: START + i * DAY, o, c, h: Math.max(o, c) * (1 + range / 2), l: Math.min(o, c) * (1 - range / 2), v: volume });
    p = c;
  }
  return out;
}

describe("leverage by score", () => {
  it("skips scores of 4 or less and maps 5/6/7 to 2x/4x/5x", () => {
    expect([3, 4, 5, 6, 7].map((s) => leverageFor(s, "balanced"))).toEqual([0, 0, 2, 4, 5]);
  });
  it("safer profile never goes above 3x", () => {
    expect([4, 5, 6, 7].map((s) => leverageFor(s, "safer"))).toEqual([0, 2, 3, 3]);
  });
});

describe("daily plan", () => {
  it("sets the trigger at today's open + 0.7 x yesterday's range", () => {
    const d = days(HISTORY_DAYS);
    const y = d[d.length - 1];
    const plan = planDay(d, 200, START + HISTORY_DAYS * DAY);
    expect(plan.trigger).toBeCloseTo(200 + 0.7 * (y.h - y.l));
    expect(plan.avgHourVolume).toBeCloseTo(100);
  });

  it("only trades in an uptrend", () => {
    expect(planDay(days(HISTORY_DAYS, 0.01), 1, 0).eligible).toBe(true);
    expect(planDay(days(HISTORY_DAYS, -0.01), 1, 0).eligible).toBe(false);
  });

  it("needs enough history", () => {
    expect(planDay(days(50), 1, 0).eligible).toBe(false);
  });

  it("scores the breakout hour as the 7th clue", () => {
    const plan = planDay(days(HISTORY_DAYS), 200, START + HISTORY_DAYS * DAY);
    const early = scoreSetup(plan, THRESHOLDS.hour - 1);
    const late = scoreSetup(plan, THRESHOLDS.hour);
    expect(early.clues).toHaveLength(7);
    expect(early.score).toBe(late.score + 1);
  });

  it("confirms volume at 1.5x a normal hour", () => {
    const plan = planDay(days(HISTORY_DAYS), 200, 0);
    expect(volumeConfirmed(149, plan)).toBe(false);
    expect(volumeConfirmed(150, plan)).toBe(true);
  });

  it("never looks at today's or future prices", () => {
    const d = days(HISTORY_DAYS + 5);
    const past = d.slice(0, HISTORY_DAYS);
    const a = planDay(past, 150, d[HISTORY_DAYS].t);
    const changedFuture = d.map((x, i) => (i >= HISTORY_DAYS ? { ...x, c: x.c * 3, h: x.h * 3 } : x));
    const b = planDay(changedFuture.slice(0, HISTORY_DAYS), 150, d[HISTORY_DAYS].t);
    expect(b).toEqual(a);
  });
});

describe("backtest", () => {
  // Hourly bars: a steady uptrend where every day breaks out early on high volume, then drifts up.
  function hourly(nDays: number, crashDay = -1): Bar[] {
    const out: Bar[] = [];
    let p = 100;
    for (let d = 0; d < nDays; d++) {
      for (let h = 0; h < 24; h++) {
        const o = p;
        let c = p * (1 + (h === 3 ? 0.02 : 0.0004));
        if (d === crashDay && h === 5) c = p * 0.9;
        out.push({ t: START + d * DAY + h * 3600_000, o, c, h: Math.max(o, c) * 1.001, l: Math.min(o, c) * 0.999, v: h === 3 ? 400 : 100 });
        p = c;
      }
    }
    return out;
  }

  it("groups hours into UTC days", () => {
    const d = toDays(hourly(3));
    expect(d).toHaveLength(3);
    expect(d[0].hours).toHaveLength(24);
  });

  it("trades breakouts, is flat overnight and reports stats", () => {
    const r = backtestBreakout(hourly(HISTORY_DAYS + 40), { startBalance: 50 });
    expect(r.trades.length).toBeGreaterThan(0);
    for (const t of r.trades) expect(t.hour).toBe(3);
    expect(r.endBalance).toBeGreaterThan(50);
    expect(r.tradesPerYear).toBeGreaterThan(0);
  });

  it("the emergency stop caps a crash day", () => {
    const r = backtestBreakout(hourly(HISTORY_DAYS + 40, HISTORY_DAYS + 20), { startBalance: 50 });
    const crash = r.trades.find((t) => t.reason === "emergency stop");
    expect(crash).toBeDefined();
    // 5% stop plus costs, times leverage (max 5x): never worse than about -27% of the account
    expect(crash!.ret).toBeGreaterThan(-0.27);
  });

  it("skips trades the account is too small for", () => {
    const r = backtestBreakout(hourly(HISTORY_DAYS + 40), { startBalance: 10, minNotional: 1000 });
    expect(r.trades).toHaveLength(0);
  });
});
