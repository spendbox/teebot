import { readFileSync } from "node:fs";
import { backtestBreakout, type Bar } from "../../../src/lib/breakout/strategy.ts";
const bars: Bar[] = readFileSync("h1_2017_2024.csv", "utf8").split("\n").filter((l) => /^\d/.test(l)).map((l) => {
  const x = l.split(","); return { t: Date.parse(x[0].replace(" ", "T") + "Z"), o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] };
});
for (const [profile, label] of [["balanced", "Live settings (2x/4x/5x)"], ["safer", "Safer (2x/3x/3x)"]] as const) {
  const r = backtestBreakout(bars, { profile, startBalance: 100, from: Date.parse("2024-01-01") });
  console.log(`${label}: 2024 $100 -> $${r.endBalance.toFixed(0)} | worst dip ${r.maxDrawdownPct.toFixed(0)}% | ${r.trades.length} trades | won ${r.winRatePct.toFixed(0)}% | holding ${r.buyHoldPct.toFixed(0)}%`);
  const byScore: Record<number, number[]> = {}; r.trades.forEach((t) => (byScore[t.score] ??= []).push(t.ret));
  console.log("   by score: " + Object.entries(byScore).map(([s, v]) => `${s}: ${v.length} trades, avg ${(100 * v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}%`).join(" | "));
  const months = new Map<string, number>(); r.trades.forEach((t) => { const m = new Date(t.day).toISOString().slice(0, 7); months.set(m, (months.get(m) ?? 1) * (1 + t.ret)); });
  console.log("   by month: " + [...months].map(([m, g]) => `${m.slice(5)}:${g >= 1 ? "+" : ""}${((g - 1) * 100).toFixed(0)}%`).join(" "));
}
