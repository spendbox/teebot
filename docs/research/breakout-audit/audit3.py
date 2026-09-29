import numpy as np, pandas as pd, pickle, itertools, warnings; warnings.filterwarnings("ignore")
from bo import run, metrics
D = pickle.load(open("days.pkl", "rb"))
print("=== B. FULL METRICS (live settings)")
for s, e in (("2018-01-01", "2021-01-01"), ("2021-01-01", "2024-01-01"), ("2018-01-01", "2024-01-01")):
    m = metrics(run(D, s, e), s, e)
    print(f"{s[:4]}-{int(e[:4])-1}: $100->${m['end']:.0f} | {m['cagr']:.0f}%/yr | trades {m['trades']} ({m['per_yr']:.0f}/yr) | win {m['win']:.0f}% | avg win +{m['avg_win']:.1f}% | avg loss {m['avg_loss']:.1f}% | profit factor {m['pf']:.2f} | expectancy {m['expectancy']:+.2f}%/trade | max losses in a row {m['max_losses']} | worst dip {m['maxdd']:.0f}% | Sharpe {m['sharpe']:.2f} | Sortino {m['sortino']:.2f}")
t = run(D, "2018-01-01", "2024-01-01")
C = D["C"]; days = D["days"]
print("\n-- by year (holding in brackets)")
for y, g in t.groupby(t.day.dt.year):
    yi = (days.year == y); hold = C[yi][-1] / D["O"][yi][0] - 1
    print(f"  {y}: {np.prod(1 + g.ret) - 1:+.0%} ({len(g)} trades, win {np.mean(g.ret > 0):.0%}) [hold {hold:+.0%}]")
print("-- by score (trade = the account's change)")
for s, g in t.groupby("score"):
    print(f"  score {s} ({g.lev.iloc[0]}x): {len(g)} trades | win {np.mean(g.r > 0):.0%} | avg Bitcoin move per trade {g.r.mean()*100:+.2f}% | profit factor {g.r[g.r>0].sum()/-g.r[g.r<=0].sum():.2f} | avg account change {g.ret.mean()*100:+.2f}%")
print("-- by market regime (price vs its 200-day average on the day before)")
reg = []
for d in t.day:
    i = days.get_loc(d); reg.append("above 200-day avg" if C[i-1] > C[max(0, i-201):i-1].mean() else "below 200-day avg")
t["reg200"] = reg
for s, g in t.groupby("reg200"):
    print(f"  {s}: {len(g)} trades | win {np.mean(g.r > 0):.0%} | avg account change {g.ret.mean()*100:+.2f}% | total {np.prod(1+g.ret)-1:+.0%}")
print("-- by exit reason")
for s, g in t.groupby("reason"):
    print(f"  {s}: {len(g)} trades | win {np.mean(g.r > 0):.0%} | avg account change {g.ret.mean()*100:+.2f}%")

print("\n=== E. MONTE CARLO (shuffle/resample the 2021-23 trades, 10,000 three-year runs of 64 trades)")
r = run(D, "2021-01-01", "2024-01-01").ret.values; rng = np.random.default_rng(0)
for name, rr in (("as tested", r), ("edge halved (profits cut, losses same)", np.where(r > 0, r * 0.6, r)), ("no edge (avg trade = 0)", r - r.mean())):
    ends, dds, streaks = [], [], []
    for _ in range(10000):
        x = rng.choice(rr, size=len(rr), replace=True); eq = np.cumprod(1 + x); pk = np.maximum.accumulate(np.r_[1, eq])[1:]
        ends.append(eq[-1]); dds.append((1 - eq / pk).max())
        s = b = 0
        for v in x: s = s + 1 if v <= 0 else 0; b = max(b, s)
        streaks.append(b)
    ends, dds = np.array(ends), np.array(dds)
    print(f"  {name:40s} median $100->${100*np.median(ends):.0f} | bad case (5%) ${100*np.quantile(ends,.05):.0f} | lose money {np.mean(ends<1):.0%} | dip>40% {np.mean(dds>.4):.0%} | dip>50% {np.mean(dds>.5):.0%} | 5+ losses in a row {np.mean(np.array(streaks)>=5):.0%}")

print("\n=== F. WALK-FORWARD (each year: pick K, trend % and stop using ONLY earlier years, then trade that year)")
grid = list(itertools.product([0.5, 0.6, 0.7, 0.8, 0.9], [6, 8.575, 12], [0.03, 0.05, 0.08]))
cache = {}
def yr_ret(y, K, tr, st):
    k = (y, K, tr, st)
    if k not in cache:
        g = run(D, f"{y}-01-01", f"{y+1}-01-01", K=K, trend=tr, stop=st); cache[k] = np.prod(1 + g.ret) if len(g) else 1.0
    return cache[k]
tot = live = hold = 1
for y in range(2019, 2024):
    best = max(grid, key=lambda p: np.prod([yr_ret(z, *p) for z in range(2018, y)]))
    a = yr_ret(y, *best); b = yr_ret(y, 0.7, 8.575, 0.05); yi = days.year == y; h = C[yi][-1] / D["O"][yi][0]
    tot *= a; live *= b; hold *= h
    print(f"  {y}: chose K={best[0]}, trend={best[1]}%, stop={best[2]:.0%} -> {a-1:+.0%} | live settings {b-1:+.0%} | holding {h-1:+.0%}")
print(f"  2019-2023: walk-forward $100->${100*tot:.0f} | live settings ${100*live:.0f} | holding ${100*hold:.0f}")
