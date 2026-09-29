import json, numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from statistics import NormalDist
from features import load_hourly
N01 = NormalDist()
df = load_hourly("h1.csv"); c = df.close.values; t = df.t
f = pd.read_pickle("longfeat.pkl"); ls = np.load("scores.npy")[:, 0]
COST = 0.00065; FUND_H = 0.0001 / 8  # perp funding per hour held (long pays, typical)
start = int(np.where(t >= pd.Timestamp("2018-01-01", tz="UTC"))[0][0])

def hourly_pos_trend(pct):
    """real 'wait for X% turn' bot, long only; position decided at close of hour i, applied from hour i+1 (next-bar fill)."""
    pos = np.zeros(len(c)); hi = lo = c[0]; d = 0
    for i, x in enumerate(c):
        if d == 0:
            hi = max(hi, x); lo = min(lo, x)
            if x >= lo * (1 + pct): d = 1; hi = x
            elif x <= hi * (1 - pct): d = -1; lo = x
        elif d == 1:
            hi = max(hi, x)
            if x <= hi * (1 - pct): d = -1; lo = x
        else:
            lo = min(lo, x)
            if x >= lo * (1 + pct): d = 1; hi = x
        pos[i] = 1 if d == 1 else 0
    return pos
def hourly_pos_signs(k=5, trail=0.12):
    pos = np.zeros(len(c)); p = 0; best = 0
    for i, x in enumerate(c):
        if p == 0 and ls[i] >= k: p = 1; best = x
        elif p == 1:
            best = max(best, x)
            if x <= best * (1 - trail): p = 0
        pos[i] = p
    return pos
def daily_returns(pos, funding):
    """the article's engine: position.shift(1), log returns, costs on turnover"""
    s = pd.Series(pos, index=t).shift(1).fillna(0)
    r = np.log(pd.Series(c, index=t) / pd.Series(c, index=t).shift(1)).fillna(0)
    net = s * r - s.diff().abs().fillna(0) * COST - (s * FUND_H if funding else 0)
    return net.iloc[start:].resample("1D").sum()
def breakout_daily():
    tr = json.load(open("breakout_trades.json"))
    idx = pd.date_range(pd.Timestamp("2018-01-01", tz="UTC"), t.iloc[-1].normalize(), freq="1D")
    s = pd.Series(0.0, index=idx)
    for day, ret in tr: s[pd.Timestamp(day, unit="ms", tz="UTC")] = np.log1p(ret)
    return s
def stats(r):
    sr = r.mean() / r.std(); T = len(r)
    eq = np.exp(r.cumsum()); dd = (eq / eq.cummax() - 1).min()
    return sr, T, r.skew(), r.kurt() + 3, np.exp(r.sum()), dd
def deflated(sr, T, skew, kurt, n):
    g = 0.5772156649
    emax = (1 - g) * N01.inv_cdf(1 - 1 / n) + g * N01.inv_cdf(1 - 1 / (n * np.e)) if n > 1 else 0
    sr0 = emax * np.sqrt(1 / T)  # expected best daily Sharpe from n pure-noise strategies
    z = (sr - sr0) * np.sqrt(T - 1) / np.sqrt(1 - skew * sr + (kurt - 1) / 4 * sr ** 2)
    return N01.cdf(z), sr0 * np.sqrt(365)
hold = pd.Series(np.log(c[1:] / c[:-1]), index=t[1:]).iloc[start - 1:].resample("1D").sum()
strats = {
 "Just holding Bitcoin": (hold, 1),
 "Live breakout bot (2-5x)": (breakout_daily(), 60),
 "Trend bot 10% (spot)": (daily_returns(hourly_pos_trend(0.10), False), 100),
 "Trend bot 12% (spot)": (daily_returns(hourly_pos_trend(0.12), False), 100),
 "Trend bot 10% (perps, funding)": (daily_returns(hourly_pos_trend(0.10), True), 100),
 "5/5 long signs + 12% trail (spot)": (daily_returns(hourly_pos_signs(), False), 150),
}
print("strategy | $100 became (2018-23) | worst dip | Sharpe/yr | trials | best-of-noise Sharpe | deflated Sharpe prob | verdict")
rows = {}
for name, (r, n) in strats.items():
    sr, T, sk, ku, g, dd = stats(r)
    p, noise = deflated(sr, T, sk, ku, n)
    rows[name] = r
    print(f"{name:36s} | ${100*g:8,.0f} | {dd:5.0%} | {sr*np.sqrt(365):5.2f} | {n:4d} | {noise:4.2f} | {p:.3f} | {'PASS' if p > 0.95 else 'REJECT'}")
print("\nWalk-forward style: result in each half-year (worst fold matters)")
for name, r in rows.items():
    h = r.groupby([r.index.year, (r.index.month - 1) // 6]).sum()
    folds = np.exp(h.values) - 1
    print(f"{name:36s} positive {int((folds > 0).sum())}/{len(folds)} | worst {folds.min():+.0%} | best {folds.max():+.0%}")
# excess over holding: does it beat holding, deflated?
print("\nBeating holding (daily return minus holding's):")
for name, r in rows.items():
    if name.startswith("Just"): continue
    ex = (r - hold.reindex(r.index).fillna(0)).dropna()
    sr, T, sk, ku, g, dd = stats(ex); p, _ = deflated(sr, T, sk, ku, strats[name][1])
    print(f"{name:36s} excess Sharpe {sr*np.sqrt(365):5.2f} | deflated prob {p:.3f} | {'PASS' if p > 0.95 else 'REJECT'}")
