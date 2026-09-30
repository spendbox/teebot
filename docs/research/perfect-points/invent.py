"""~30 invented indicators, each using only data up to the current hour."""
import numpy as np, pandas as pd
def invent(df):
    c, o, h, l, v, n, tb = df.close, df.open, df.high, df.low, df.volume, df.trades, df.tbv
    r = c.pct_change(); f = pd.DataFrame(index=df.index); rng = (h - l).replace(0, np.nan)
    atr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1).ewm(alpha=1/14, adjust=False).mean()
    vavg = v.rolling(168).mean(); navg = n.rolling(168).mean()
    ts = tb / v  # share of volume from aggressive buyers
    # 1 Absorption (Wyckoff "effort vs result"): heavy volume but small price move
    f["absorption"] = (v / vavg) / ((c - o).abs() / atr + 0.1)
    # 2 Stopping volume: heavy volume on a red hour that closes in its top half
    f["stopping_volume"] = (v / vavg) * ((c - l) / rng) * (c < o)
    # 3 Buying climax (mirror): heavy volume on a green hour closing in its bottom half
    f["buying_climax"] = (v / vavg) * ((h - c) / rng) * (c > o)
    # 4 Liquidation cascade: sharp 1h drop with volume AND trade count surging
    f["liquidation_cascade"] = (-r).clip(lower=0) / (atr / c) * (v / vavg) * (n / navg)
    # 5 Short squeeze: mirror
    f["short_squeeze"] = r.clip(lower=0) / (atr / c) * (v / vavg) * (n / navg)
    # 6 Retail panic: many more trades than usual relative to volume (small panicked orders)
    f["retail_panic"] = (n / navg) / (v / vavg) * (r < 0)
    # 7 Whale footprint: average trade size vs normal
    f["whale_size"] = (v / n) / (v / n).rolling(168).mean()
    # 8 Seller exhaustion: price falling over 12h but buyer share rising
    f["seller_exhaustion"] = -c.pct_change(12) * (ts.rolling(3).mean() - ts.rolling(24).mean()) * 100
    # 9 Buyer exhaustion: mirror
    f["buyer_exhaustion"] = c.pct_change(12) * (ts.rolling(24).mean() - ts.rolling(3).mean()) * 100
    # 10 Fall deceleration: last 4h fall much smaller than the previous 4h fall
    f["fall_deceleration"] = (c.pct_change(4).shift(4) - c.pct_change(4)) * (c.pct_change(8) < 0)
    # 11 Rise deceleration
    f["rise_deceleration"] = (c.pct_change(4).shift(4) - c.pct_change(4)).mul(-1) * (c.pct_change(8) > 0)
    # 12 Volatility squeeze: Bollinger width vs its 30-day percentile (low = coiled spring)
    bw = c.rolling(20).std() / c.rolling(20).mean(); f["squeeze_pct"] = bw.rolling(720).rank(pct=True)
    # 13 Efficiency ratio (Kaufman): straight-line move / total path, 24h
    f["efficiency_24h"] = (c - c.shift(24)).abs() / c.diff().abs().rolling(24).sum()
    # 14 Variance ratio (trend vs mean-reversion): var(4h) / (4 var(1h))
    f["variance_ratio"] = c.pct_change(4).rolling(168).var() / (4 * r.rolling(168).var())
    # 15 Return autocorrelation, last 48h
    f["autocorr_48h"] = r.rolling(48).corr(r.shift())
    # 16 Up/down volume ratio 24h
    f["updown_volume_24h"] = (v * (r > 0)).rolling(24).sum() / (v * (r < 0)).rolling(24).sum().replace(0, np.nan)
    # 17 Double bottom: within 1.5% of the previous 7-day low (set >24h ago) and RSI higher than then
    d = r.clip(lower=0).ewm(alpha=1/14).mean() / (-r.clip(upper=0)).ewm(alpha=1/14).mean(); rsi = 100 - 100 / (1 + d)
    prior_low = l.shift(24).rolling(144).min(); f["double_bottom"] = ((c / prior_low - 1).abs() < 0.015) * (rsi - rsi.shift(24).rolling(144).min())
    # 18 Double top
    prior_high = h.shift(24).rolling(144).max(); f["double_top"] = ((c / prior_high - 1).abs() < 0.015) * (rsi.shift(24).rolling(144).max() - rsi)
    # 19 Anchored VWAP gap: distance from the volume-weighted price since the 7-day high
    tp = (h + l + c) / 3
    idx_hi = h.rolling(168).apply(lambda x: len(x) - 1 - np.argmax(x), raw=True)
    cumpv, cumv = (tp * v).cumsum(), v.cumsum()
    k = (np.arange(len(c)) - idx_hi.fillna(0).values).astype(int).clip(0)
    avwap = (cumpv.values - np.r_[0, cumpv.values][k]) / (cumv.values - np.r_[0, cumv.values][k] + 1e-9)
    f["anchored_vwap_gap"] = c / avwap - 1
    # 20 Session: return of the Asian session (00-08 UTC) so far vs US session
    f["hour_utc"] = df.t.dt.hour
    # 21 Weekend flag
    f["weekend"] = (df.t.dt.weekday >= 5).astype(int)
    # 22 Return kurtosis (fat-tail stress) over 72h
    f["kurtosis_72h"] = r.rolling(72).kurt()
    # 23 Downside volatility share
    f["downside_vol_share"] = (r.clip(upper=0) ** 2).rolling(48).sum() / (r ** 2).rolling(48).sum()
    # 24 Time since last volume spike (>3x) in hours
    spike = (v > 3 * vavg).astype(int); grp = spike.cumsum(); f["hours_since_spike"] = spike.groupby(grp).cumcount()
    # 25 Candle sequence: 3+ red hours then a green hour
    red = (c < o).astype(int); f["red3_then_green"] = ((red.shift(1) + red.shift(2) + red.shift(3)) == 3) & (c > o)
    f["green3_then_red"] = (((1 - red).shift(1) + (1 - red).shift(2) + (1 - red).shift(3)) == 3) & (c < o)
    # 26 Acceleration of price (second difference over 6h, in ATR)
    f["acceleration"] = (c - 2 * c.shift(6) + c.shift(12)) / atr
    # 27 Trades-vs-volume growth gap (retail vs whales), 24h
    f["retail_vs_whale_24h"] = n.rolling(24).sum() / navg / 24 - v.rolling(24).sum() / vavg / 24
    # 28 Buyer persistence: hours in a row with buyer share > 50%
    b = (ts > 0.5).astype(int); f["buyer_streak"] = b.groupby((b != b.shift()).cumsum()).cumsum() * b
    s = (ts < 0.5).astype(int); f["seller_streak"] = s.groupby((s != s.shift()).cumsum()).cumsum() * s
    # 29 Range position within 30-day range vs 7-day range (multi-timeframe stretch)
    f["mtf_stretch"] = (c - l.rolling(720).min()) / (h.rolling(720).max() - l.rolling(720).min()) - (c - l.rolling(168).min()) / (h.rolling(168).max() - l.rolling(168).min())
    # 30 Composite "panic score": fall size x volume x trades x seller share, all vs normal
    f["panic_score"] = (-c.pct_change(4)).clip(lower=0) / (atr / c) * (v.rolling(4).mean() / vavg) * (n.rolling(4).mean() / navg) * (1 - ts.rolling(4).mean()) * 2
    f["euphoria_score"] = c.pct_change(4).clip(lower=0) / (atr / c) * (v.rolling(4).mean() / vavg) * (n.rolling(4).mean() / navg) * ts.rolling(4).mean() * 2
    return f.astype(float)
