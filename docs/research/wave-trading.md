# Wave trading: buy every $50 low, sell every $50 high

A "wave" is a move of at least $50 before Bitcoin turns and moves at least $50 back.
Code: `src/lib/wave/strategy.ts` (also on the Backtest page, using Bybit 1-minute prices).

- **Perfect:** buy the exact bottom, sell the exact top of every wave (hindsight only).
- **Real bot:** checks every minute. It can only know a bottom was the bottom once the
  price is already $50 above it, so it buys $50 above each bottom and sells $50 below each top.
- Fees: 0.055% taker + 0.01% slippage per side (about $27 per side per BTC at $42k).

Data: real Binance BTCUSDT prices bundled in the `gapless-crypto-data` Python package
(1-minute futures for 15 Jan 2024; 5-minute spot for 20-28 Mar 2023; hourly spot 2017-2024).
The exchanges' own sites were blocked from the research session.

## 1-minute prices, 15 Jan 2024 (one day, per 1 BTC at ~$42k)

| Wave at least | Waves | Perfect, no fees | Perfect, after fees | Real bot, no fees | Real bot, after fees |
|---|---|---|---|---|---|
| $50 | 64 | +$8,829 | +$5,283 | +$392 | **−$3,154** |
| $100 | 26 | +$6,242 | +$4,802 | +$166 | −$1,274 |
| $200 | 7 | +$3,792 | +$3,404 | +$756 | +$368 |
| $500 | 2 | +$2,375 | +$2,264 | +$277 | +$166 |

Real bot, $50 rule: won 20% of its 64 trades; $100 became $93 in one day.

## 5-minute prices, 20-28 Mar 2023 (9 days)

| Wave at least | Waves | Perfect, after fees | Real bot, after fees |
|---|---|---|---|
| $50 | 204 | +$24,236 | **−$7,908** ($100 → $75) |
| $200 | 32 | +$14,625 | −$280 |
| $1000 | 4 | +$5,507 | −$2,929 |

## Hourly prices, 2017-2024

Perfect timing on $50 waves: at least +$7.6 million per 1 BTC after fees over 6.4 years
(a lower bound: hourly candles hide the smaller waves). Every size of real bot, from $50 to
$2,000, lost money in every year tested (inside each hour the order of the high and low is
guessed, so treat the real-bot hourly numbers as rough).

## Conclusion

Perfect timing makes enormous money, but nobody can know a bottom until the price has
already left it. That delay costs 2 × $50 of every wave, and most $50 waves are smaller than
$100 + fees, so the real bot loses. Bigger waves ($200-$500) are closer to break-even but
were not reliably profitable. Not added to the live bot.
