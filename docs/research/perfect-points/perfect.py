import numpy as np, pandas as pd
from features import load_hourly
df = load_hourly("h1.csv"); COST = 0.00065
def dp(p, shorts):
    """Best possible final wealth (log) trading at these prices with perfect hindsight, fees per buy/sell."""
    lc = np.log(1 - COST); cash, long, short = 0.0, lc, (lc if shorts else -np.inf)
    n_trades = 0
    for i in range(1, len(p)):
        r = np.log(p[i] / p[i - 1]); rs = np.log(max(1e-12, 2 - p[i] / p[i - 1]))
        long, short = long + r, short + rs
        cash, long, short = max(cash, long + lc, short + lc), max(long, cash + lc, short + 2 * lc), (max(short, cash + lc, long + 2 * lc) if shorts else -np.inf)
    return np.exp(max(cash, long + lc, short + lc))
def count_trades(p):
    lab = []; lc = np.log(1 - COST)
    return None
def fmt(x):
    if x < 1e6: return f"${100*x:,.0f}"
    e = int(np.floor(np.log10(100 * x))); return f"about $1 followed by {e} zeros (10^{e})"
periods = {"2023 only": ("2023-01-01", "2024-01-01"), "2021-2023": ("2021-01-01", "2024-01-01"), "Aug 2017 - Jan 2024 (all)": ("2017-01-01", "2024-02-01")}
for name, (a, b) in periods.items():
    d = df[(df.t >= pd.Timestamp(a, tz="UTC")) & (df.t < pd.Timestamp(b, tz="UTC"))]
    p = d.close.values; t = d.t
    hold = p[-1] / p[0]
    lo = np.argmin(p); hi = lo + np.argmax(p[lo:]); one = p[hi] / p[lo] * (1 - COST) ** 2
    # best single trade per calendar year
    yrs = 1.0; picks = []
    for y, g in d.groupby(d.t.dt.year):
        q = g.close.values; best = (1, 0, 0)
        mins = np.minimum.accumulate(q); k = np.argmax(q / mins); j = np.argmin(q[:k + 1])
        f = q[k] / q[j] * (1 - COST) ** 2
        if f > 1: yrs *= f; picks.append(f"{y}: buy {g.t.iloc[j]:%d %b} ${q[j]:,.0f} -> sell {g.t.iloc[k]:%d %b} ${q[k]:,.0f} (x{f:.1f})")
    daily = d.set_index("t").close.resample("1D").last().dropna().values
    weekly = d.set_index("t").close.resample("1W").last().dropna().values
    print(f"\n=== {name}   (holding: $100 -> ${100*hold:,.0f})")
    print(f"  One perfect trade (buy the lowest, sell the highest after it): {fmt(one)}  [{t.iloc[lo]:%d %b %Y} ${p[lo]:,.0f} -> {t.iloc[hi]:%d %b %Y} ${p[hi]:,.0f}]")
    print(f"  Best single trade each calendar year: {fmt(yrs)}")
    for s in picks: print("      " + s)
    for lbl, q in (("weekly", weekly), ("daily", daily), ("hourly", p)):
        print(f"  Perfect timing on every {lbl} move: long only {fmt(dp(q, False))} | long + short {fmt(dp(q, True))}")
