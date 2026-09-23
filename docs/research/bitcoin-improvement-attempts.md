# Bitcoin bot: improvement attempts and the profit ceiling

The live Bitcoin breakout bot (7-clue score, 2-5x) remains the best version found.
Test method throughout: rules learned on 2017-2020, judged on 2021-2026, real fees,
slippage and funding. Baseline 2021-2026: **+38%/yr, worst dip 37%, ~21 trades/yr**.

## New pre-breakout clues (round 3)

Clues that looked useful in BOTH periods (extra profit per trade, 2017-20 / 2021-26):
busy trading before the breakout (+0.84 / +0.33), yesterday closed in the top third of
its range (+0.55 / +0.53), breakout is also a 5-day high (+0.63 / +0.42), 20-day high
(+0.97 / +0.24).

- Hand-picked "current 7 + those 3" score: about the same profit (+35-36%/yr) with the
  worst dip roughly halved (18-23%). **But** the 3 clues were chosen after seeing 2021-26,
  so this is not a fair result.
- Fair version (every clue that looked good on 2017-20 alone): +14%/yr. Worse.
- Self-learning score (re-picks clues every year from past years only): +19% to +36%/yr.
  Not better.

Conclusion: no reliable improvement; the extra clues are worth re-testing on live data later.

## Earlier rounds (all worse or only more risk)

Shorter averages, 1-4 hour trading, 2-3 trades/day, shorting downtrends, dip-buying,
holding overnight, trailing stops, take-profit, sell earlier, tighter/looser stops,
adaptive trigger, re-entry after weak volume (mixed), adding to winners (+more risk),
volatility sizing (mixed), other coins with Bitcoin's rules.

## The ceiling (why 500%/yr is not realistic)

Scaling all leverage up, 2021-2026 backtest, and one-year simulations:

| Setup | Backtest | Worst dip | Typical year if edge is only half as good | Chance of halving in a year (half edge) |
|---|---|---|---|---|
| BTC bot as live (2-5x) | +38%/yr | 37% | +12% | 1% |
| BTC bot x2 (4-10x) | +70%/yr | 64% | +14% | 28% |
| BTC bot x3 (6-15x) | +89%/yr | 83% | +5% | 57% |
| Best 4-strategy mix, 1x | +43%/yr | 23% | +12% | 0% |
| Best mix, 2x | +82%/yr | 42% | +14% | 16% |
| Best mix, 6x | +187%/yr | 84% | -27% | 99% |
| Rotation, 2x | +108%/yr | 84% | -8% | 87% |

The highest backtest found anywhere was about +187%/yr, with an 84% crash. 500%/yr needs
roughly 5x more profit per trade than any strategy found, or leverage that wipes out the
account in realistic conditions.
