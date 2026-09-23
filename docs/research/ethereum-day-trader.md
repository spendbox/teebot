# Ethereum day-trader (researched, not built yet)

Status: **parked**. Researched and backtested; ready to build alongside the Bitcoin
day-trader when wanted. Nothing here is running.

## The rules

Same idea as the Bitcoin bot (buy a strong same-day breakout in an uptrend, sell by
midnight UTC), but tuned to how Ethereum behaves.

1. **Uptrend day:** yesterday's ETH close is above its 20-day average. Otherwise no trade.
2. **Buy line:** today's open + **0.8 × yesterday's high-low range**. Buy when ETH reaches it.
3. **Score (0-4), one point each:**
   - Bitcoin has also broken out today (Bitcoin's own buy line: open + 0.7 × its range).
     If Bitcoin breaks out in the *same hour* as ETH, buy ETH only at the end of that
     hour (the bot can't know the order inside the hour).
   - The breakout happens before 12:00 UTC.
   - ETH is **below** its 100-day average (early in a recovery, not late in a rally).
   - The 50-day average is **not** rising (vs 5 days earlier), for the same reason.
4. **Size by score:** 0-1 skip, 2 → 1x, 3 → 2x, 4 → 3x.
5. **Emergency stop:** entry − 1 × yesterday's range, but never more than 8% below entry.
6. **No weak-volume exit** (unlike Bitcoin: on ETH it sold too many trades that recovered).
7. **Always flat by 23:57 UTC.** At most one trade a day.

Surprise vs Bitcoin: a very strong trend is a *bad* sign on ETH; its best breakouts
come early in a recovery.

## Results (Binance ETHUSDT hourly, fees 0.055% + slippage 0.05% per side, funding)

Learned on 2018-2021, judged on 2022-2026 (not used while building).

| Version | 2018-21 | 2022-26 | Worst dip 22-26 | Win rate | Longest losing streak |
|---|---|---|---|---|---|
| First version (after fixing a look-ahead bug) | +56%/yr | +17%/yr | 27% | 39% | 10 |
| + buy line 0.8, no volume exit | +68%/yr | +33%/yr | 20% | 53% | 7 |
| **+ range-based stop (final)** | +67%/yr | **+38%/yr** | **15%** | 50% | 7 |

Buying and holding ETH over 2022-2026 made about −6%/yr.

- All 21 neighbouring settings were profitable in both periods (robust).
- Walk-forward (settings chosen from past data only) gave about +13%/yr, so the realistic
  expectation for ETH alone is roughly **+15% to +35%/yr**.
- Worst single trade in the final version: about −25% of the ETH allocation (stop up to 8% × 3x).
- Losing streaks: typical year 3, bad year 5; 16% chance of 5+ in a row in a year.

## Why run it with Bitcoin

The two day-traders rarely lose together (daily return correlation about 0.2).
Bitcoin bot + ETH bot, money split 50/50, 2022-2026: **about +40%/yr, worst dip 16%,
no losing year** (Bitcoin alone: +36%/yr, worst dip 27%, 2025 −10%).

## Other research findings (so they aren't repeated)

- The same breakout idea **does not work** on SOL, XRP, ADA, DOGE, TRX, BNB; BCH is borderline.
- A **dynamic trend** rule (5 averages 10-160 days, Bitcoin-trend filter, position shrinks when a
  coin is volatile) made money on all 10 coins tested in 2022-2026 and 98% of 720 setting variants.
- **Weekly rotation** into the strongest 2-3 coins made the most (+47-70%/yr in 2022-26) but with
  50-70% dips; only safe as a small slice.
- Shorting, 1-4 hour trading, dip-buying, market-neutral long/short and 4-hour trend all failed
  after fees on unseen years.
- Best tested blend: 30% BTC day-trader, 30% ETH day-trader, 25% dynamic trend (2x), 15% rotation:
  +43%/yr, worst dip 23%, no losing year in 2022-2026.
