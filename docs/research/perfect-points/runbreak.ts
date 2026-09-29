import { readFileSync, writeFileSync } from "node:fs";
import { backtestBreakout, type Bar } from "../../../src/lib/breakout/strategy.ts";
const bars: Bar[] = readFileSync("h1.csv", "utf8").split("\n").filter((l) => /^\d/.test(l)).map((l) => {
  const x = l.split(","); return { t: Date.parse(x[0] + "Z"), o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5] };
});
for (const [name, from, to] of [["2018-2020 (rules were learned on 2017-20 Bitstamp data)", "2018-01-01", "2021-01-01"], ["2021-2023 (unseen)", "2021-01-01", "2024-01-02"]] as const) {
  const sub = bars.filter((b) => b.t < Date.parse(to));
  const r = backtestBreakout(sub, { profile: "balanced", startBalance: 100, from: Date.parse(from) });
  console.log(`${name}: $100 -> $${r.endBalance.toFixed(0)} | ${r.cagrPct.toFixed(0)}%/yr | worst dip ${r.maxDrawdownPct.toFixed(0)}% | ${r.tradesPerYear.toFixed(0)} trades/yr | won ${r.winRatePct.toFixed(0)}% | hold ${r.buyHoldPct.toFixed(0)}%`);
  console.log("   by year: " + r.yearly.map((y) => `${y.year}: ${y.returnPct >= 0 ? "+" : ""}${y.returnPct.toFixed(0)}% (${y.trades})`).join(" | "));
}
const all = backtestBreakout(bars, { profile: "balanced", startBalance: 100, from: Date.parse("2018-01-01") });
const daily = new Map<number, number>(); for (const t of all.trades) daily.set(t.day, t.ret);
writeFileSync("breakout_trades.json", JSON.stringify(all.trades.map((t) => [t.day, t.ret])));
