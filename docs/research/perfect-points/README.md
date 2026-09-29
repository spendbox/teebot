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

## Bigger waves (5% to 40%) — can they beat holding by a lot? (`big.py`, `big2.py`, `walkbig.py`)

Holding Bitcoin: Aug 2017-Jan 2024 x10.25 (worst dip 84%); 2018-2023 x3.27; 2021-2023 x1.52.

**Perfect timing** beats holding by absurd amounts at every size (e.g. 20% waves: x33.6 million
long-only over the whole period; 30% waves in 2021-23: x10.5). Only possible with hindsight.

**Real bot** (buys once the price is X% above its lowest point, sells once it is X% below its
highest point, fees included), long only:

| Wave | Whole period | 2018-2023 | 2021-2023 | Worst dip (whole) |
|---|---|---|---|---|
| holding | x10.25 | x3.27 | x1.52 | 84% |
| 5% | x0.35 | | x0.53 | 95% |
| 8% | x10.03 | x4.14 | x1.46 | 81% |
| 9% | x14.67 | x5.03 | x1.36 | 72% |
| **10%** | **x36.10** | **x11.02** | x1.68 | 63% |
| 11% | x14.01 | x4.73 | x1.14 | 68% |
| 12% | x11.24 | x4.28 | x1.17 | 68% |
| 15% | x13.76 | x3.83 | x0.90 | 67% |
| 20% | x5.61 | x3.01 | x0.67 | 74% |

- 10% is a lucky spike: 9% and 11% make less than half as much. The realistic range (9-17%)
  beats holding modestly over the whole period (about x13-15 vs x10) with smaller crashes,
  mostly by getting out during the 2018 and 2022 crashes.
- In 2021-2023 most sizes did **worse** than holding. In strong up-years (2019, 2020, 2023)
  it trails holding, because every exit and re-entry costs 2 x the wave size.
- Adding short selling made it worse in most cases.
- The prediction model aimed at 10-20% turns (trained only on earlier years, 2019-2023): x0.7 to
  x2.6 vs holding x11.3.

Conclusion: bigger waves make the real bot less bad, and a 9-15% "trend follower" can reduce the
damage of big crashes, but nothing found makes *significantly* more than holding reliably.
