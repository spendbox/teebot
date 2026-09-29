import numpy as np, pandas as pd
from features import load_hourly, zigzag, build, rsi
D = 24
def build_long(df):
    f = build(df, leg_pct=0.12)
    c, h, l, v = df.close, df.high, df.low, df.volume
    for n in (7, 20, 50, 100, 200):
        f[f"D_dist_sma{n}d"] = c / c.rolling(n * D).mean() - 1
    f["D_sma50d_slope_7d"] = c.rolling(50 * D).mean().pct_change(7 * D)
    f["D_sma200d_slope_30d"] = c.rolling(200 * D).mean().pct_change(30 * D)
    f["D_golden_cross"] = c.rolling(50 * D).mean() / c.rolling(200 * D).mean() - 1
    daily = c.iloc[D - 1::D]
    f["D_rsi14_daily"] = rsi(daily, 14).reindex(c.index).ffill()
    f["D_rsi14_weekly"] = rsi(c.iloc[7 * D - 1::7 * D], 14).reindex(c.index).ffill()
    for n in (3, 7, 14, 30, 90):
        f[f"D_ret_{n}d"] = c.pct_change(n * D)
    for n in (7, 30, 90):
        f[f"D_from_high_{n}d"] = c / h.rolling(n * D).max() - 1
        f[f"D_from_low_{n}d"] = c / l.rolling(n * D).min() - 1
    f["D_from_all_time_high"] = c / h.cummax() - 1
    f["D_days_since_30d_high"] = h.rolling(30 * D).apply(lambda x: len(x) - 1 - x.argmax(), raw=True) / D
    f["D_days_since_30d_low"] = l.rolling(30 * D).apply(lambda x: len(x) - 1 - x.argmin(), raw=True) / D
    r = c.pct_change()
    f["D_vol_7d"] = r.rolling(7 * D).std() * np.sqrt(D); f["D_vol_30d"] = r.rolling(30 * D).std() * np.sqrt(D)
    f["D_vol_ratio_7_90"] = r.rolling(7 * D).std() / r.rolling(90 * D).std()
    f["D_volume_7d_vs_90d"] = v.rolling(7 * D).mean() / v.rolling(90 * D).mean()
    f["D_volume_1d_vs_30d"] = v.rolling(D).mean() / v.rolling(30 * D).mean()
    f["D_taker_buy_7d"] = df.tbv.rolling(7 * D).sum() / v.rolling(7 * D).sum()
    f["D_taker_buy_1d"] = df.tbv.rolling(D).sum() / v.rolling(D).sum()
    m, s = c.rolling(20 * D).mean(), c.rolling(20 * D).std(); f["D_boll_pctb_20d"] = (c - (m - 2 * s)) / (4 * s)
    ema12, ema26 = c.ewm(span=12 * D, adjust=False).mean(), c.ewm(span=26 * D, adjust=False).mean()
    mac = ema12 - ema26; f["D_macd_daily_hist"] = (mac - mac.ewm(span=9 * D, adjust=False).mean()) / c
    obv = (np.sign(c.diff()).fillna(0) * v).cumsum(); f["D_obv_trend_7d"] = (obv - obv.shift(7 * D)) / v.rolling(30 * D).sum()
    # invented, long scale
    f["INV_D_crash_speed"] = f["D_from_high_30d"] / f["D_days_since_30d_high"].clip(lower=0.5)       # how fast it fell from the 30d high
    f["INV_D_panic_volume"] = (-f["D_ret_3d"]).clip(lower=0) * f["D_volume_1d_vs_30d"]                 # 3-day fall on heavy volume
    f["INV_D_fomo"] = f["D_ret_3d"].clip(lower=0) * f["D_volume_1d_vs_30d"]                            # 3-day rise on heavy volume
    f["INV_D_calm_before"] = f["D_vol_7d"] / f["D_vol_30d"]                                            # quiet week vs month
    f["INV_D_stretch_50d"] = f["D_dist_sma50d"] / f["D_vol_30d"]                                       # distance from 50d avg in 'normal days'
    f["INV_D_buyer_shift"] = f["D_taker_buy_1d"] - f["D_taker_buy_7d"]                                 # buyers taking over today vs week
    return f
