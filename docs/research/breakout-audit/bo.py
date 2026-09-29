"""Python copy of src/lib/breakout/strategy.ts backtest, with every number adjustable."""
import numpy as np, pandas as pd
from features import load_hourly
DEFAULT = dict(K=0.7, trend=8.575, rangeRel=0.752, hour=12, volMult=1.5, stop=0.05, stopMode="fixed",
               lev={5: 2, 6: 4, 7: 5}, minScore=5, fee=0.00055, slip=0.0005, funding=0.0001, volMode="all", riskPct=None)
def load_days():
    df = load_hourly("h1.csv")
    df["d"] = df.t.dt.floor("D")
    g = df.groupby("d")
    full = g.size()[lambda s: s == 24].index
    H = {k: v for k, v in g if k in set(full)}
    days = sorted(H)
    O = np.array([H[d].open.iloc[0] for d in days]); C = np.array([H[d].close.iloc[-1] for d in days])
    Hi = np.array([H[d].high.max() for d in days]); Lo = np.array([H[d].low.min() for d in days]); V = np.array([H[d].volume.sum() for d in days])
    ho = np.stack([H[d].open.values for d in days]); hh = np.stack([H[d].high.values for d in days])
    hl = np.stack([H[d].low.values for d in days]); hc = np.stack([H[d].close.values for d in days]); hv = np.stack([H[d].volume.values for d in days])
    return dict(days=pd.DatetimeIndex(days), O=O, C=C, H=Hi, L=Lo, V=V, ho=ho, hh=hh, hl=hl, hc=hc, hv=hv)
def run(D, start="2018-01-01", end="2024-01-01", **kw):
    p = {**DEFAULT, **kw}
    days, O, C, Hh, Ll = D["days"], D["O"], D["C"], D["H"], D["L"]
    s0, e0 = pd.Timestamp(start, tz="UTC"), pd.Timestamp(end, tz="UTC")
    trades = []
    for i in range(106, len(days)):
        if days[i] < s0 or days[i] >= e0: continue
        c = C[i - 106:i]; n = 106; y = i - 1
        m20, m50, m50b, m100 = c[-20:].mean(), c[-50:].mean(), c[-55:-5].mean(), c[-100:].mean()
        if not C[y] > m20: continue
        rng = Hh[y] - Ll[y]
        avgRange = np.mean((Hh[i - 20:i] - Ll[i - 20:i]) / O[i - 20:i])
        trigger = O[i] + p["K"] * rng
        hh = D["hh"][i]; hit = np.where(hh >= trigger)[0]
        if not len(hit): continue
        j = int(hit[0])
        clues = [(C[y] / m20 - 1) * 100 >= p["trend"], C[y] > m100, m50 > m50b, C[y] > O[y],
                 days[i].weekday() < 5, rng / O[y] / avgRange < p["rangeRel"], j < p["hour"]]
        score = int(sum(clues))
        lev = p["lev"].get(score, 0) if score >= p["minScore"] else 0
        if callable(p["lev"]): lev = p["lev"](score)
        if lev <= 0: continue
        entry = max(trigger, D["ho"][i][j])
        if p["volMode"] == "all": avgHV = D["V"][i - 20:i].mean() / 24
        else: avgHV = D["hv"][i - 20:i, j].mean()  # same UTC hour, last 20 days
        stopDist = p["stop"] if p["stopMode"] == "fixed" else min(0.12, max(0.02, p["stop"] * avgRange))
        if p["riskPct"]: lev = min(5, p["riskPct"] / stopDist)
        exit, exitHour, reason = C[i], 23, "end of day"
        if D["hv"][i][j] < p["volMult"] * avgHV:
            exit, exitHour, reason = D["hc"][i][j], j, "weak volume"
        else:
            stop = entry * (1 - stopDist)
            for q in range(j + 1, 24):
                if D["hl"][i][q] <= stop:
                    exit, exitHour, reason = min(stop, D["ho"][i][q]), q, "stop"; break
        f = sum(1 for h in (8, 16) if j < h <= exitHour)
        r = exit / entry - 1 - 2 * (p["fee"] + p["slip"]) - f * p["funding"]
        trades.append(dict(day=days[i], score=score, lev=lev, r=r, ret=lev * r, reason=reason,
                           regime="bull" if C[y] > c[-100:].mean() * 1.0 and C[y] > np.mean(C[max(0, i - 200):i]) else "not bull"))
    return pd.DataFrame(trades)
def metrics(t, start="2018-01-01", end="2024-01-01"):
    idx = pd.date_range(pd.Timestamp(start, tz="UTC"), pd.Timestamp(end, tz="UTC") - pd.Timedelta(days=1), freq="D")
    dr = pd.Series(0.0, index=idx)
    if len(t): dr.loc[pd.DatetimeIndex(t.day)] = t.ret.values
    eq = (1 + dr).cumprod(); dd = (eq / eq.cummax() - 1).min()
    yrs = len(idx) / 365
    r = t.ret if len(t) else pd.Series(dtype=float)
    wins, losses = r[r > 0], r[r <= 0]
    streak = best = 0
    for x in r: streak = streak + 1 if x <= 0 else 0; best = max(best, streak)
    down = dr[dr < 0]
    return dict(end=100 * eq.iloc[-1], cagr=(eq.iloc[-1] ** (1 / yrs) - 1) * 100, maxdd=dd * 100, trades=len(r), per_yr=len(r) / yrs,
                win=(r > 0).mean() * 100 if len(r) else 0, avg_win=wins.mean() * 100 if len(wins) else 0, avg_loss=losses.mean() * 100 if len(losses) else 0,
                pf=wins.sum() / -losses.sum() if len(losses) and losses.sum() < 0 else np.inf, expectancy=r.mean() * 100 if len(r) else 0,
                max_losses=best, sharpe=dr.mean() / dr.std() * np.sqrt(365) if dr.std() > 0 else 0,
                sortino=dr.mean() / np.sqrt((np.minimum(dr, 0) ** 2).mean()) * np.sqrt(365) if (dr < 0).any() else 0)
