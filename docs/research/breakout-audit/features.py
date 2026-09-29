import numpy as np, pandas as pd

def load_hourly(path):
    df = pd.read_csv(path, comment="#")
    df["t"] = pd.to_datetime(df["date"], utc=True)
    df = df.rename(columns={"taker_buy_base_asset_volume": "tbv", "number_of_trades": "trades"})
    return df[["t", "open", "high", "low", "close", "volume", "trades", "tbv"]].reset_index(drop=True)

def zigzag(close, pct):
    """Perfect turning points: each low/high followed by a move of at least pct (hindsight)."""
    n = len(close); lab = np.zeros(n, dtype=int)  # +1 perfect buy (low), -1 perfect sell (high)
    hi = lo = 0; d = 0
    for i in range(n):
        p = close[i]
        if d == 0:
            if p > close[hi]: hi = i
            if p < close[lo]: lo = i
            if p >= close[lo] * (1 + pct): lab[lo] = 1; d = 1; hi = i
            elif p <= close[hi] * (1 - pct): lab[hi] = -1; d = -1; lo = i
        elif d == 1:
            if p > close[hi]: hi = i
            elif p <= close[hi] * (1 - pct): lab[hi] = -1; d = -1; lo = i
        else:
            if p < close[lo]: lo = i
            elif p >= close[lo] * (1 + pct): lab[lo] = 1; d = 1; hi = i
    return lab

def online_leg(close, pct):
    """What a bot can know at each bar: direction of the current confirmed leg, % move of the
    leg so far, hours since the leg's starting extreme, and distance from the running extreme."""
    n = len(close); d = 0; hi = lo = 0
    leg_dir = np.zeros(n); leg_move = np.zeros(n); leg_age = np.zeros(n); from_ext = np.zeros(n)
    start = 0
    for i in range(n):
        p = close[i]
        if d == 0:
            if p > close[hi]: hi = i
            if p < close[lo]: lo = i
            if p >= close[lo] * (1 + pct): d = 1; start = lo; hi = i
            elif p <= close[hi] * (1 - pct): d = -1; start = hi; lo = i
        elif d == 1:
            if p > close[hi]: hi = i
            elif p <= close[hi] * (1 - pct): d = -1; start = hi; lo = i
        else:
            if p < close[lo]: lo = i
            elif p >= close[lo] * (1 + pct): d = 1; start = lo; hi = i
        leg_dir[i] = d
        leg_move[i] = p / close[start] - 1
        leg_age[i] = i - start
        from_ext[i] = p / close[hi] - 1 if d == 1 else (p / close[lo] - 1 if d == -1 else 0)
    return leg_dir, leg_move, leg_age, from_ext

def rsi(c, n):
    d = c.diff(); up = d.clip(lower=0).ewm(alpha=1/n, adjust=False).mean(); dn = (-d.clip(upper=0)).ewm(alpha=1/n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))

def build(df, leg_pct=0.03):
    c, h, l, o, v = df.close, df.high, df.low, df.open, df.volume
    f = pd.DataFrame(index=df.index)
    # --- Trend ---
    for n in (20, 50, 200):
        f[f"dist_sma{n}"] = c / c.rolling(n).mean() - 1
    f["sma50_slope_24h"] = c.rolling(50).mean().pct_change(24)
    f["sma200_slope_72h"] = c.rolling(200).mean().pct_change(72)
    ema12, ema26 = c.ewm(span=12, adjust=False).mean(), c.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26; sig = macd.ewm(span=9, adjust=False).mean()
    f["macd_pct"] = macd / c; f["macd_hist_pct"] = (macd - sig) / c
    f["macd_hist_change"] = f["macd_hist_pct"].diff()
    # ADX (14)
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1/14, adjust=False).mean()
    upm, dnm = h.diff(), -l.diff()
    pdm = np.where((upm > dnm) & (upm > 0), upm, 0.0); ndm = np.where((dnm > upm) & (dnm > 0), dnm, 0.0)
    pdi = 100 * pd.Series(pdm).ewm(alpha=1/14, adjust=False).mean() / atr
    ndi = 100 * pd.Series(ndm).ewm(alpha=1/14, adjust=False).mean() / atr
    dx = 100 * (pdi - ndi).abs() / (pdi + ndi); f["adx"] = dx.ewm(alpha=1/14, adjust=False).mean(); f["di_diff"] = pdi - ndi
    # --- Momentum ---
    f["rsi14"] = rsi(c, 14); f["rsi2"] = rsi(c, 2); f["rsi14_4h"] = rsi(c.iloc[::1].rolling(4).mean(), 14)
    lo14, hi14 = l.rolling(14).min(), h.rolling(14).max()
    f["stoch_k"] = 100 * (c - lo14) / (hi14 - lo14)
    tp = (h + l + c) / 3
    f["cci20"] = (tp - tp.rolling(20).mean()) / (0.015 * tp.rolling(20).apply(lambda x: np.abs(x - x.mean()).mean(), raw=True))
    for n in (1, 4, 12, 24, 72, 168):
        f[f"ret_{n}h"] = c.pct_change(n)
    # --- Volatility / bands ---
    m, s = c.rolling(20).mean(), c.rolling(20).std()
    f["boll_pctb"] = (c - (m - 2 * s)) / (4 * s); f["boll_width"] = 4 * s / m
    f["atr_pct"] = atr / c
    r1 = c.pct_change()
    f["vol_24h"] = r1.rolling(24).std(); f["vol_ratio_24_168"] = f["vol_24h"] / r1.rolling(168).std()
    kel_mid = c.ewm(span=20, adjust=False).mean(); f["keltner_pos"] = (c - kel_mid) / (2 * atr)
    # --- Where in the recent range ---
    for n in (24, 72, 168):
        f[f"from_high_{n}h"] = c / h.rolling(n).max() - 1
        f[f"from_low_{n}h"] = c / l.rolling(n).min() - 1
        f[f"range_pos_{n}h"] = (c - l.rolling(n).min()) / (h.rolling(n).max() - l.rolling(n).min())
    # --- Streaks ---
    up = (c > c.shift()).astype(int); dn = (c < c.shift()).astype(int)
    f["down_streak"] = dn.groupby((dn != dn.shift()).cumsum()).cumsum() * dn
    f["up_streak"] = up.groupby((up != up.shift()).cumsum()).cumsum() * up
    # --- Candle shape ---
    rng = (h - l).replace(0, np.nan)
    f["body"] = (c - o) / rng; f["lower_wick"] = (np.minimum(o, c) - l) / rng; f["upper_wick"] = (h - np.maximum(o, c)) / rng
    f["candle_range_vs_atr"] = (h - l) / atr
    # --- Volume & order flow ---
    f["vol_vs_24h"] = v / v.rolling(24).mean(); f["vol_vs_168h"] = v / v.rolling(168).mean()
    f["trades_vs_24h"] = df.trades / df.trades.rolling(24).mean()
    f["avg_trade_size_vs_168h"] = (v / df.trades) / (v / df.trades).rolling(168).mean()
    tb = df.tbv / v
    f["taker_buy_share"] = tb; f["taker_buy_share_4h"] = (df.tbv.rolling(4).sum() / v.rolling(4).sum())
    f["taker_buy_share_change"] = f["taker_buy_share_4h"] - df.tbv.rolling(48).sum() / v.rolling(48).sum()
    mf = tp * v; pos = mf.where(tp > tp.shift(), 0).rolling(14).sum(); neg = mf.where(tp < tp.shift(), 0).rolling(14).sum()
    f["mfi14"] = 100 - 100 / (1 + pos / neg.replace(0, np.nan))
    obv = (np.sign(c.diff()).fillna(0) * v).cumsum(); f["obv_slope_24h"] = (obv - obv.shift(24)) / v.rolling(168).mean() / 24
    vwap24 = (tp * v).rolling(24).sum() / v.rolling(24).sum(); f["dist_vwap24"] = c / vwap24 - 1
    # --- Time ---
    f["hour_utc"] = df.t.dt.hour; f["weekday"] = df.t.dt.weekday
    # --- Invented ---
    f["INV_capitulation"] = (-f["ret_1h"]).clip(lower=0) * f["vol_vs_168h"] / f["atr_pct"]          # big red hour on heavy volume
    f["INV_euphoria"] = f["ret_1h"].clip(lower=0) * f["vol_vs_168h"] / f["atr_pct"]                  # big green hour on heavy volume
    f["INV_stretch_4h"] = f["ret_4h"] / (f["atr_pct"] * 2)                                           # 4h move measured in ATRs
    f["INV_exhaustion"] = (f["down_streak"] - f["up_streak"]) * f["vol_vs_24h"]                       # long streak on rising volume
    f["INV_flow_divergence"] = np.sign(f["ret_24h"]) * -f["taker_buy_share_change"]                   # price one way, buyers/sellers the other
    low72 = c.rolling(72).min(); rsi_at = f["rsi14"].rolling(72).min()
    f["INV_rsi_divergence_low"] = np.where(c <= low72 * 1.002, f["rsi14"] - rsi_at, np.nan)          # new low but RSI not new low
    high72 = c.rolling(72).max(); rsi_hi = f["rsi14"].rolling(72).max()
    f["INV_rsi_divergence_high"] = np.where(c >= high72 * 0.998, rsi_hi - f["rsi14"], np.nan)
    f["INV_round_number_dist"] = (c / 1000 - (c / 1000).round()).abs() * 1000 / c                     # % from nearest $1,000
    f["INV_wick_volume"] = (f["lower_wick"] - f["upper_wick"]) * f["vol_vs_24h"]                       # rejection wick with volume
    ld, lm, la, fe = online_leg(c.values, leg_pct)
    f["INV_leg_dir"] = ld; f["INV_leg_move"] = lm; f["INV_leg_hours"] = la; f["INV_from_leg_extreme"] = fe
    return f
