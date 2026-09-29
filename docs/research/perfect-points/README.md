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

## What big (9-15%) turns have in common (`longfeat.py`, `bigcommon.py`, `bigcheck.py`)

About 30 longer-term indicators added (days/weeks: 7-200 day averages, daily/weekly RSI, 3-90 day
moves, distance from all-time high, days since the 30-day high/low, 7-30 day volatility and
volume, daily MACD, 6 new invented ones). Perfect turns pooled from 9%, 12% and 15% waves
(12%: 31 buys in 2017-20, 35 in 2021-23). Values are medians at 12% turns.

**Common to both big buys and big sells:** heavy volume (2.1x weekly normal at buys, 1.5x at sells,
vs 0.8x), more trades, wide Bollinger bands, choppy prices (hourly ATR 1.8% / 1.2% vs 0.8%),
choppy last 7-30 days, bigger trades, and they come about a week after the previous turn.

**Big buy:** RSI(14) 27 (normal 51), Stochastic 10, fell 7.4% in 24h and 10.8% in 3 days, 17% below
the 7-day high, 6% below the 50-hour average, ADX 39 (a strong, fast fall). Mirror for big sells:
RSI 71, Stochastic 92, +5.5% in 24h, at the top of the week's range.

**Short-term (hours) indicators separate big turns better than long-term ones.** No link: weekly
RSI, 200-day average and its slope, golden cross, distance from all-time high, hour, weekday,
round numbers, RSI divergence.

**How often the signs are right (8-sign checklists):**
- Buy, 7+ signs: the day is within ±1 day of a big bottom 33% (2017-20) / 49% (2021-23) of the
  time, vs 6% for any day. But the price 7 days later: -1.6% / +1.3% (any hour: +1.0%). So the
  signs point at the right area, yet buying on them was not reliably profitable.
- Sell, 7+ signs: within ±1 day of a big top only ~20% of the time, and the price 7 days later was
  +3.2% / +3.4%, **higher** than a normal week. Big tops look like ordinary strong rallies, and
  those usually keep going. Selling on "top signs" loses money.

## Long vs short, and what is present at 70-90% of perfect points (`coverage.py`, `longshort.py`, `robust.py`)

For every indicator, the level that was true at 70/80/90% of perfect points in 2017-20, then
checked on 2021-23, with how often it is also true at any hour ("false alarm").

3% turns, 80% level: long = 4h move <= -1.1%, 1.4%+ below 20h avg, RSI(2) <= 13, Stochastic <= 23
(each true at 76-86% of perfect longs, but also at 13-16% of all hours). Short = RSI(2) >= 85,
1.2%+ above 20h avg, Stochastic >= 81, 4h move >= +0.7% (77-85% of perfect shorts, 16-19% of hours).

12% turns (the five signs per side used below):

| Long sign | At perfect longs 17-20 / 21-23 | Any hour |
|---|---|---|
| bottom 8% of 3-day range | 81% / 71% | 3% |
| Keltner position <= -0.95 | 77% / 80% | 6% |
| 3.9%+ below 50h average | 84% / 86% | 6% |
| RSI(14) <= 32 | 81% / 80% | 7% |
| 2.3%+ below 24h VWAP | 77% / 86% | 7% |
| 3+ of 5 | 84% / 91% | 4.8% |

| Short sign | At perfect shorts 17-20 / 21-23 | Any hour |
|---|---|---|
| top 8% of 3-day range | 80% / 74% | 6% |
| top 12% of 1-day range | 73% / 83% | 9% |
| RSI(14) >= 67 | 80% / 69% | 9% |
| Keltner position >= 0.79 | 80% / 77% | 10% |
| 1.9%+ above 24h VWAP | 80% / 77% | 10% |
| 3+ of 5 | 80% / 80% | 8.2% |

Present at 70-90% of BOTH longs and shorts: volume at least 0.8-0.9x the weekly normal (91-97%,
but true at 43-53% of all hours) and hourly ATR above ~0.9-1.1% (77-86%, true at 31-48% of hours).

Trading them (fees included; holding $100 -> $256 in 2017-20, $152 in 2021-23):
- Long on all 5 signs, sell 12% below the best price: $243 / $240. With 10%: $634 / $106;
  15%: $357 / $136. Year by year 2018-23: x3.73 vs holding x3.10, but same ~70% worst dip, and
  neighbouring settings range x1.4-x3.7. Not a dependable edge.
- Every short version lost most of the money ($4-$41 from $100): after short signs Bitcoin
  usually keeps rising.

Interactive chart of these signs vs the perfect points: published as the "Long and Short Signs"
artifact.

## "Critic" review (checklist from the @x_insider4 article) (`critic.py`, `runbreak.ts`)

Everything re-run with the article's engine: position = signal shifted one bar (act on the next
hour), log returns, costs on every change of position, daily returns 2018-2023. Deflated Sharpe
(Bailey & Lopez de Prado) computed per day with the expected best Sharpe of N pure-noise trials
(the article's snippet mixes a yearly Sharpe with a daily count, which is too lenient).

| Strategy | $100 became | Worst dip | Sharpe/yr | Trials assumed | Deflated | Half-years positive | Worst half-year |
|---|---|---|---|---|---|---|---|
| Holding Bitcoin | $322 | 81% | 0.27 | 1 | 0.75 | 8/13 | -57% |
| Live breakout bot (2-5x) | $1,700 | 42% | 1.08 | 60 | 0.63 | 10/13 | -27% |
| Trend bot 10% (spot) | $1,173 | 57% | 0.76 | 100 | 0.25 | 8/13 | -26% |
| Trend bot 10% (perps, with funding) | $785 | 57% | 0.64 | 100 | 0.17 | 8/13 | -29% |
| Trend bot 12% (spot) | $455 | 67% | 0.48 | 100 | 0.09 | 7/13 | -41% |
| 5/5 long signs + 12% trail | $455 | 84% | 0.40 | 150 | 0.05 | 8/13 | -76% |

A strategy passes at 0.95. Nothing passes once the number of ideas tried is counted.

Live breakout bot on Binance data (independent of the Bitstamp data it was built on):
2018-20 $100 -> $532 (worst dip 42%); 2021-23 $100 -> $320 vs holding $153 (worst dip 27%).
Its deflated Sharpe: 0.998 if it were the only idea tried, 0.94 at 5 ideas, 0.88 at 10, 0.63 at
60. On 2021-23 alone (one test): 0.98. Promising and consistent, but not proven.

Checklist on the live bot's backtest (`src/lib/breakout/strategy.ts`): look-ahead absent (plans use
completed days only); no repainting indicators; fees + slippage + funding applied; fills at the
trigger price (fine for a stop order; the live bot checks every minute so real fills can be a bit
worse); a 5% stop hit inside the entry hour is not checked (small optimistic bias); ~10 parameters
learned on 2017-20; 2021-23 test has bull and bear; UTC days, incomplete days dropped.

## Perfect bots on yearly, weekly and daily timeframes (`perfect.py`, `tf*.py`, `yearly.py`)

Perfect long-only trades found with dynamic programming on daily and weekly closes (fees
included): daily 599 buys/sells (avg hold 3 days), weekly 83. Best-trade-per-year: 7 trades.
$100 (Aug 2017-Jan 2024): one perfect trade $2,348; best trade per year $367,033; every weekly
move $70 million; every daily move ~10^15; every hourly move ~10^54 (holding: $1,025).

**Daily and weekly perfect buys** come right after a red bar: RSI(2) ~25 (normal 52), price 1-4%
below its 7-bar average, a down move on the bar (-1.5% day / -4.8% week), close near the bar's
low. Sells mirror it (RSI(2) ~75-78, green bar). Volume, ATR, time of year, weekday and round
numbers: no difference. Each ~80% sign is also true on 33-55% of all bars, so a bar with the
buy sign is a perfect buy only 25-28% of the time (vs 12% for any bar). Trading "buy on RSI(2)
low + red bar, sell on RSI(2) high + green bar": $61-$130 (2017-20) and $56-$115 (2021-23) vs
holding $253 / $134-151.

**Best trade of each year (genuine lows/highs, not the 1 January artifacts):**
buys (Feb 2018, Jan 2019, Mar 2020, Jan 2022): daily RSI(14) 26-37, weekly RSI 35-48, 25-61%
below the 90-day high, 24-40% below the 200-day average (when available), volume 1.0-4.5x.
Sells (Dec 2017, Jun 2019, Dec 2020, Nov 2021, Dec 2023): daily RSI 59-88, weekly RSI 67-92,
within 1-6% of the 90-day high, 30-day move +13% to +145%, 42-152% above the 200-day average.
Invented "days since halving": the two cycle tops came 526 and 548 days after a halving, but
two examples cannot be tested.
