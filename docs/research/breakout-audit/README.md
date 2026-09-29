# Breakout bot audit (answering an outside review)

Data: Binance BTCUSDT hourly, 2018-2023 (independent of the Bitstamp data the rules were learned
on, 2017-2020). `bo.py` is a Python copy of `src/lib/breakout/strategy.ts` with every number
adjustable; it reproduces the TypeScript backtest exactly ($100 -> $532 in 2018-20, $320 in
2021-23). Save the data as `h1.csv` (see ../perfect-points/README.md), then run audit1-3.
Holding Bitcoin: $100 -> $211 (2018-20), $153 (2021-23).

## Full metrics (live settings, fees 0.055% + slippage 0.05% per side + funding)
| | 2018-20 | 2021-23 |
|---|---|---|
| $100 became | $532 | $320 |
| Trades (per year) | 68 (23) | 64 (21) |
| Win rate | 59% | 53% |
| Avg win / avg loss (account) | +8.6% / -5.0% | +7.4% / -3.7% |
| Profit factor | 2.44 | 2.25 |
| Expectancy per trade | +2.98% | +2.19% |
| Max losses in a row | 3 | 3 |
| Worst dip | 42% | 27% |
| Sharpe / Sortino | 1.36 / 2.67 | 1.11 / 2.99 |

By year: 2018 +39% (hold -73%), 2019 +153% (+94%), 2020 +51% (+302%), 2021 +83% (+60%),
2022 +1% (-64%), 2023 +72% (+156%).

## Parameter sensitivity (2018-20 | 2021-23)
- K: 0.5 $465|$314, 0.6 $673|$289, **0.7 $532|$320**, 0.8 $254|$302, 0.9 $251|$221, 1.0 $163|$192.
  0.5-0.8 all beat holding in both periods; weaker above 0.9.
- Trend %: 4 $987|$300, 6 $791|$295, **8.6 $532|$320**, 10 $509|$283, 12 $505|$291, 15 $343|$169.
- Calm ratio: 0.6 $457|$184, 0.7 $491|$268, **0.75 $532|$320**, 0.85 $568|$283, 1.0 $593|$326.
- Volume multiple: 0 (off) $665|$318, 1.0 $646|$305, 1.25 $530|$293, **1.5 $532|$320**, 1.75 $704|$271, 2.0 $519|$278.
- Early-hour cutoff: 8 $381|$317, 10 $404|$308, **12 $532|$320**, 14 $689|$401, 16 $660|$304.
- Stop: 3% $277|$332, 4% $302|$301, **5% $532|$320**, 6% $450|$306, 8% $391|$348, 10% $344|$348.
No cliff edges: nearby values give similar results. 0.7 and 8.6% are not uniquely good.

## Variants
- Volume vs the same UTC hour: $637|$317 (no real difference).
- Range-based stop (1.0x / 1.5x average daily range): $315|$292, $389|$348 (no better than 5%).
- Fixed leverage on all score-5+ trades: 1x $242|$152 (dips 10%/12%), 2x $537|$217 (20%/23%),
  3x $1,099|$293 (29%/33%). Safer profile (2x/3x/3x): $573|$268 (30%/25%).
- Risk-based sizing with a fixed 5% stop is the same as fixed leverage (10% risk = 2x, 15% = 3x).
- Slippage 0.1% per side: $441|$271; 0.2% per side: $303|$195 (still above holding).

## Leverage by score does not hold up
| Score | Leverage | Trades | Win | Avg Bitcoin move | Avg account change |
|---|---|---|---|---|---|
| 5 | 2x | 88 | 60% | +1.12% | +2.25% |
| 6 | 4x | 40 | 52% | +1.26% | +5.03% |
| 7 | 5x | 4 | 0% | -2.81% | -14.06% |
Score 6 is not meaningfully better per trade than score 5, and score 7 happened only 4 times
(all losses). The extra leverage adds risk, not edge. Recommendation: cap leverage at 3x
(the existing Safer profile).

## Monte Carlo (10,000 resampled 3-year runs of the 2021-23 trades)
- As tested: median $316, bad case (5%) $113, loses money 3%, dip >50% 2%.
- Edge 40% smaller on wins: median $129, bad case $61, loses money 29%, dip >50% 8%.
- No edge: median $78, loses money 65%.

## Walk-forward (each year's K, trend % and stop chosen from earlier years only)
2019 +146%, 2020 +36%, 2021 +38%, 2022 -3%, 2023 +105% -> $100 -> $923 over 2019-23
(live settings $1,220, holding $1,144, with holding's -64% year in 2022).

## Exit reasons
End of day: 105 trades, 68% won, +4.25% avg. Weak-volume exit: 21 trades, 14% won, -0.70% avg
(cuts bad trades early). 5% stop: 6 trades, -14.8% avg.
