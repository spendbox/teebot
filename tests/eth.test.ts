import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/breakout/strategy";
import { ETH_HISTORY_DAYS, backtestEth, btcTriggerFor, ethLeverage, ethStopDistance, planEthDay, scoreEth } from "@/lib/eth/strategy";

const DAY = 86_400_000;
const START = Date.UTC(2024, 0, 1);

function days(n: number, drift = 0.01, range = 0.04): Bar[] {
  const out: Bar[] = [];
  let p = 1000;
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = p * (1 + drift);
    out.push({ t: START + i * DAY, o, c, h: Math.max(o, c) * (1 + range / 2), l: Math.min(o, c) * (1 - range / 2), v: 1000 });
    p = c;
  }
  return out;
}

// Hourly bars: flat until `breakHour`, then a jump to `jump` x open and a drift to the close.
function hoursFor(day: Bar, breakHour: number | null, jump = 1.06, close = 1.08): Bar[] {
  return Array.from({ length: 24 }, (_, h) => {
    const base = breakHour != null && h >= breakHour ? day.o * (jump + ((close - jump) * (h - breakHour)) / (23 - breakHour || 1)) : day.o;
    return { t: day.t + h * 3_600_000, o: base, h: base * 1.002, l: base * 0.998, c: base, v: 40 };
  });
}

describe("Ethereum leverage and stop", () => {
  it("maps score 0-1 to skip and 2/3/4 to 1x/2x/3x", () => {
    expect([0, 1, 2, 3, 4].map(ethLeverage)).toEqual([0, 0, 1, 2, 3]);
  });
  it("keeps the stop between 3% and 8% of the entry", () => {
    expect(ethStopDistance(10, 1000)).toBe(0.03); // 1% range -> 3% minimum
    expect(ethStopDistance(50, 1000)).toBeCloseTo(0.05); // 5% range -> 5%
    expect(ethStopDistance(200, 1000)).toBe(0.08); // 20% range -> 8% cap
  });
});

describe("Ethereum daily plan and score", () => {
  it("sets the trigger at today's open + 0.8 x yesterday's range in an uptrend", () => {
    const hist = days(ETH_HISTORY_DAYS);
    const y = hist[hist.length - 1];
    const plan = planEthDay(hist, 2000);
    expect(plan.eligible).toBe(true);
    expect(plan.trigger).toBeCloseTo(2000 + 0.8 * (y.h - y.l));
  });
  it("stays out when yesterday closed below its 20-day average", () => {
    expect(planEthDay(days(ETH_HISTORY_DAYS, -0.01), 500).eligible).toBe(false);
  });
  it("needs enough history", () => {
    expect(planEthDay(days(50), 1000).eligible).toBe(false);
  });
  it("in a long rally the 'early recovery' clues are not met", () => {
    const plan = planEthDay(days(ETH_HISTORY_DAYS), 2000);
    expect(plan.clues.map((c) => c.met)).toEqual([false, false]);
    const s = scoreEth(plan, 9, true);
    expect(s.score).toBe(2); // Bitcoin + early
    expect(scoreEth(plan, 15, false).score).toBe(0);
  });
  it("uses Bitcoin's own 0.7 x range line for the Bitcoin clue", () => {
    const btc = days(5);
    const y = btc[btc.length - 1];
    expect(btcTriggerFor(btc, 50_000)).toBeCloseTo(50_000 + 0.7 * (y.h - y.l));
  });
});

describe("Ethereum backtest", () => {
  it("trades a breakout backed by Bitcoin and closes it by the end of the day", () => {
    const n = ETH_HISTORY_DAYS + 8;
    const ethDays = days(n, 0.01);
    const btcDays = days(n, 0.01);
    // breakouts on every other day after the warm-up, so each breakout follows a quiet day
    const toHourly = (ds: Bar[], breakHour: number | null) => ds.flatMap((d, i) => hoursFor(d, i > ETH_HISTORY_DAYS && i % 2 === 0 ? breakHour : null));
    const r = backtestEth(toHourly(ethDays, 9), toHourly(btcDays, 8), { startBalance: 100 });
    expect(r.trades.length).toBeGreaterThan(0);
    for (const t of r.trades) {
      expect(t.leverage).toBeGreaterThanOrEqual(1);
      expect(t.reason).toBe("end of day");
      expect(t.ret).toBeGreaterThan(0);
    }
    expect(r.endBalance).toBeGreaterThan(100);
  });
  it("skips breakouts that score below 2 (late, no Bitcoin breakout, mature rally)", () => {
    const n = ETH_HISTORY_DAYS + 8;
    const toHourly = (ds: Bar[], breakHour: number | null) => ds.flatMap((d, i) => hoursFor(d, i > ETH_HISTORY_DAYS && i % 2 === 0 ? breakHour : null));
    const r = backtestEth(toHourly(days(n), 15), toHourly(days(n), null), { startBalance: 100 });
    expect(r.trades.length).toBe(0);
  });
});
