import numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from features import load_hourly, rsi
COST = 0.00065
df = load_hourly("h1.csv").set_index("t")
def bars(rule):
    b = df.resample(rule).agg({"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum", "trades": "sum", "tbv": "sum"}).dropna()
    return b
def dp_points(p):
    """Long-only perfect trades with fees; returns arrays of buy and sell bar indexes."""
    n = len(p); lc = np.log(1 - COST)
    cash = np.zeros(n); long = np.zeros(n); fc = np.zeros(n, int); fl = np.zeros(n, int)  # 0 stay, 1 switch
    cash[0], long[0] = 0.0, lc
    for i in range(1, n):
        r = np.log(p[i] / p[i - 1])
        lstay, lbuy = long[i - 1] + r, cash[i - 1] + lc
        long[i], fl[i] = (lstay, 0) if lstay >= lbuy else (lbuy, 1)
        cstay, csell = cash[i - 1], long[i - 1] + r + lc
        cash[i], fc[i] = (cstay, 0) if cstay >= csell else (csell, 1)
    state = 0 if cash[-1] >= long[-1] + lc else 1
    buys, sells = [], []
    for i in range(n - 1, 0, -1):
        if state == 1:
            if fl[i]: buys.append(i - 1); state = 0   # bought at close of bar i-1
        else:
            if fc[i]: sells.append(i); state = 1      # sold at close of bar i (held through bar i)
    return np.array(sorted(buys)), np.array(sorted(sells))
HALVINGS = pd.to_datetime(["2012-11-28", "2016-07-09", "2020-05-11", "2024-04-20"], utc=True)
def feats(b, per):  # per = bars per week-ish scale label
    c, h, l, o, v = b.close, b.high, b.low, b.open, b.volume
    f = pd.DataFrame(index=b.index)
    f["RSI(14)"] = rsi(c, 14); f["RSI(2)"] = rsi(c, 2)
    lo14, hi14 = l.rolling(14).min(), h.rolling(14).max(); f["Stochastic(14)"] = 100 * (c - lo14) / (hi14 - lo14)
    for n in (7, 20, 50, 200): f[f"vs {n}-bar average %"] = (c / c.rolling(n).mean() - 1) * 100
    for n in (1, 3, 7, 30): f[f"{n}-bar move %"] = c.pct_change(n) * 100
    for n in (30, 90): f[f"below {n}-bar high %"] = (c / h.rolling(n).max() - 1) * 100; f[f"above {n}-bar low %"] = (c / l.rolling(n).min() - 1) * 100
    m, s = c.rolling(20).mean(), c.rolling(20).std(); f["Bollinger %B"] = (c - (m - 2 * s)) / (4 * s)
    f["volume vs 20-bar avg"] = v / v.rolling(20).mean()
    f["buyer share of volume %"] = b.tbv / v * 100
    rng = (h - l).replace(0, np.nan); f["candle body (-1 red..+1 green)"] = (c - o) / rng
    f["lower wick share"] = (np.minimum(o, c) - l) / rng; f["upper wick share"] = (h - np.maximum(o, c)) / rng
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1 / 14, adjust=False).mean(); f["ATR % of price"] = atr / c * 100
    e12, e26 = c.ewm(span=12, adjust=False).mean(), c.ewm(span=26, adjust=False).mean(); mac = e12 - e26
    f["MACD histogram %"] = (mac - mac.ewm(span=9, adjust=False).mean()) / c * 100
    dn = (c < c.shift()).astype(int); up = (c > c.shift()).astype(int)
    f["red bars in a row"] = dn.groupby((dn != dn.shift()).cumsum()).cumsum() * dn
    f["green bars in a row"] = up.groupby((up != up.shift()).cumsum()).cumsum() * up
    # invented
    f["INV capitulation (red x volume / ATR)"] = (-(c.pct_change())).clip(lower=0) * 100 * f["volume vs 20-bar avg"] / f["ATR % of price"]
    f["INV euphoria (green x volume / ATR)"] = (c.pct_change()).clip(lower=0) * 100 * f["volume vs 20-bar avg"] / f["ATR % of price"]
    f["INV stretch (7-bar move in ATRs)"] = f["7-bar move %"] / f["ATR % of price"]
    f["INV below all-time high %"] = (c / h.cummax() - 1) * 100
    last_h = np.array([HALVINGS[HALVINGS <= t].max() for t in b.index])
    f["INV days since halving"] = (b.index - pd.DatetimeIndex(last_h)).days
    f["INV month (1-12)"] = b.index.month; f["INV weekday (0=Mon)"] = b.index.weekday
    f["INV round-number distance %"] = ((c / 1000 - (c / 1000).round()).abs() * 1000 / c) * 100
    return f
