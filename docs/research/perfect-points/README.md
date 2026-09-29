# What perfect buys and perfect sells have in common

A **perfect buy** is the exact lowest hour before Bitcoin rises 3%+; a **perfect sell** is the exact
highest hour before it falls 3%+ (also checked with 2% and 5%). These are found with hindsight.
We then measured ~60 indicators *at that hour, using only what was known at that hour*,
and compared them with normal hours.

Data: Binance BTCUSDT hourly candles, Aug 2017 - Jan 2024 (55,861 hours; 818 perfect buys and
817 perfect sells at 3%), with volume, number of trades and taker-buy volume. Source: the
`gapless-crypto-data` PyPI package (`tests/fixtures/test_data_large/binance_spot_BTCUSDT-1h_...csv`);
save it as `h1.csv` next to these scripts. Needs `numpy pandas scikit-learn`.
Traits were learned on 2017-2020 and checked on 2021-2023.

"Score" below = how well the indicator separates perfect points from normal hours
(0.50 = no link, 1.00 or 0.00 = perfect). Shown as 2017-20 / 2021-23.

## Common to BOTH perfect buys and perfect sells (turning points happen when the market is busy)

| Trait | Normal hour | Perfect buy | Perfect sell | Score buy | Score sell |
|---|---|---|---|---|---|
| Volatility (ATR, % of price) | 0.9% | 2.0% | 1.7% | 0.80/0.76 | 0.76/0.71 |
| Volume vs weekly normal | 0.8x | 1.5x | 1.2x | 0.77/0.77 | 0.69/0.72 |
| Number of trades vs day normal | 0.9x | 1.2x | 1.1x | 0.71/0.73 | 0.62/0.69 |
| This hour's size vs normal | 0.8x | 1.3x | 1.0x | 0.74/0.75 | 0.63/0.69 |
| Trend strength (ADX) | 26 | 31 | 30 | 0.63/0.62 | 0.59/0.58 |
| Hours since the last 3% turn (invented) | 46 | 13 | 14 | 0.24/0.29 | 0.28/0.30 |
| Bigger-than-usual trades | 0.98x | 1.10x | 1.06x | 0.65/0.71 | 0.59/0.64 |

## Perfect buy: the hour a sharp fall ends (mirror image for a perfect sell)

| Trait | Normal | Perfect buy | Perfect sell |
|---|---|---|---|
| RSI(2) | 53 | **7** | **92** |
| Stochastic %K | 56 | 14 | 89 |
| Move in the last 4 hours | 0% | -2.6% | +2.0% |
| Distance from 24h high | -1.6% | -6.9% | -0.8% |
| Bollinger %B | 0.54 | 0.05 (at lower band) | 0.90 |
| Candle body (−1 = full red, +1 = full green) | 0.02 | −0.60 | +0.59 |
| Share of volume from aggressive buyers | 50.5% | 45.8% | 53.6% |
| RSI(14) | 51 | 34 | 63 |
| Money Flow Index | 51 | 35 | 62 |
| Capitulation (invented: red hour × volume ÷ volatility) | 0 | 1.0 | 0 |
| Exhaustion (invented: streak × volume) | −0.4 | +2.8 | −2.3 |

Surprise: at a perfect buy the hour usually closes **near its low** (small lower wick: 0.22 vs 0.28
normal). The "hammer candle" bottom is not typical; the bounce starts the *next* hour.

## Not common (no link at all, score 0.44-0.54)

Hour of day, day of week, distance to round $1,000 numbers (invented), RSI divergence at new
72h lows/highs (invented), slope of the 200-hour average, buyer/price divergence (invented).

## The catch: these signs appear far more often than perfect points

Buy checklist (8 signs: RSI(2)<10, fell 2%+ in 4h, 5%+ below 24h high, Stochastic<20, below lower
Bollinger band, volume 1.3x+ weekly, taker-buy share <47%, big red candle), 2021-23:

| Signs present | Hours | Really the exact low | Within ±2h of it | Avg price 24h later |
|---|---|---|---|---|
| 6+ of 8 | 781 | 17% | 31% | +0.39% |
| 7+ of 8 | 371 | 22% | 35% | +0.51% |
| any hour | 26,304 | 1.3% | | +0.10% |

The sell checklist is weaker: at 7+ of 8 sell signs only 14% are the exact high, and the price is
on average still **higher** 24 hours later (+0.18%). Rallies tend to keep going; sell-offs bounce.

## Can a model trained on all ~60 indicators find them in advance?

Gradient-boosted model, trained on 2017-2020, tested on 2021-2023 (never seen):
- It ranks hours very well (score 0.96-0.99), and its most confident 0.2% of hours are the exact
  low 26-53% of the time. Waiting 1-2 hours to confirm raises that to 77-100%, but by then the
  price has already bounced.
- Trading on it, year by year (each year trained only on earlier years), 2019-2023:
  all versions made money (x1.7 to x6.5 over 5 years) but **all did worse than just holding
  Bitcoin (x11.3)**. They lost less in 2022 (−2% to −60% vs −65%).
- Simple "buy on 7-8 signs, sell 6-48h later": small, unstable edge (+0.1% to +0.5% per trade after
  fees); neighbouring settings flip between profit and loss, so it is not reliable.

Conclusion: the signs of a perfect buy/sell are clear and consistent, but they also appear at
many hours that are not turning points. No combination found picks turning points "every time";
the only lasting edge is small (buying hard, high-volume sell-offs).
