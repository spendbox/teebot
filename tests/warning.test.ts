import { describe, expect, it } from "vitest";
import { checkWarning, warningLimit } from "../src/lib/breakout/warning";

const MONTH = 30 * 86_400_000;
const start = Date.UTC(2026, 0, 1);

describe("early warning", () => {
  it("uses 15% for the first 2 months, 20% until month 4, then 30%", () => {
    expect(warningLimit(0).limitPct).toBe(15);
    expect(warningLimit(1.99).limitPct).toBe(15);
    expect(warningLimit(2).limitPct).toBe(20);
    expect(warningLimit(3.9).limitPct).toBe(20);
    expect(warningLimit(4).limitPct).toBe(30);
    expect(warningLimit(24).limitPct).toBe(30);
  });

  it("triggers only when the drop reaches the current limit", () => {
    expect(checkWarning(100, 86, start, start + MONTH).triggered).toBe(false);
    expect(checkWarning(100, 85, start, start + MONTH).triggered).toBe(true);
    expect(checkWarning(100, 82, start, start + 3 * MONTH).triggered).toBe(false);
    expect(checkWarning(100, 80, start, start + 3 * MONTH).triggered).toBe(true);
    expect(checkWarning(100, 75, start, start + 5 * MONTH).triggered).toBe(false);
    expect(checkWarning(100, 70, start, start + 5 * MONTH).triggered).toBe(true);
  });

  it("never triggers when the balance is up", () => {
    const c = checkWarning(100, 140, start, start + MONTH);
    expect(c.dropPct).toBe(0);
    expect(c.triggered).toBe(false);
  });

  it("says when the limit next loosens", () => {
    expect(checkWarning(100, 100, start, start + MONTH).limitChangesAt).toBe(start + 2 * MONTH);
    expect(checkWarning(100, 100, start, start + 10 * MONTH).limitChangesAt).toBeNull();
  });
});
