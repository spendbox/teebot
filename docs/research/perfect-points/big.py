import numpy as np, pandas as pd
from features import load_hourly, zigzag
df = load_hourly("h1.csv"); c = df.close.values; yr = df.t.dt.year.values; COST = 0.00065
def perfect(idx, pct, shorts):
    lab = zigzag(c[idx], pct); piv = [(k, lab[k]) for k in np.where(lab != 0)[0]]
    g = 1.0; n = 0
    for (a, la), (b, lb) in zip(piv, piv[1:]):
        if la == 1: g *= c[idx][b] / c[idx][a] * (1 - 2 * COST); n += 1
        elif shorts: g *= (2 - c[idx][b] / c[idx][a]) * (1 - 2 * COST); n += 1
    return g, n
def real(idx, pct, shorts):
    p = c[idx]; hi = lo = p[0]; d = 0; pos = 0; e = 0; g = 1.0; n = 0; peak = 1; dd = 0
    for i, x in enumerate(p):
        flip = 0
        if d == 0:
            hi = max(hi, x); lo = min(lo, x)
            if x >= lo * (1 + pct): d = 1; hi = x; flip = 1
            elif x <= hi * (1 - pct): d = -1; lo = x; flip = -1
        elif d == 1:
            hi = max(hi, x)
            if x <= hi * (1 - pct): d = -1; lo = x; flip = -1
        else:
            lo = min(lo, x)
            if x >= lo * (1 + pct): d = 1; hi = x; flip = 1
        if flip:
            if pos == 1: g *= x / e * (1 - COST)
            if pos == -1: g *= (2 - x / e) * (1 - COST)
            pos = 1 if flip == 1 else (-1 if shorts else 0)
            if pos: e = x; g *= (1 - COST); n += 1
        eq = g * (x / e if pos == 1 else (2 - x / e) if pos == -1 else 1)
        peak = max(peak, eq); dd = max(dd, 1 - eq / peak)
    if pos == 1: g *= p[-1] / e * (1 - COST)
    if pos == -1: g *= (2 - p[-1] / e) * (1 - COST)
    return g, n, dd
def holddd(idx):
    p = c[idx]; return 1 - (p / np.maximum.accumulate(p)).min()
periods = [("Aug 2017-2023 (all)", np.arange(len(c))), ("2021-2023", np.where(yr >= 2021)[0])] + [(str(y), np.where(yr == y)[0]) for y in range(2018, 2024)]
for name, idx in periods:
    h = c[idx][-1] / c[idx][0]
    print(f"\n=== {name}: holding x{h:.2f} (worst dip {holddd(idx):.0%})")
    print("wave | perfect long-only | perfect long+short | REAL long-only (worst dip) | REAL long+short (worst dip)")
    for pct in (0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40):
        pl, npl = perfect(idx, pct, False); pb, _ = perfect(idx, pct, True)
        rl, nrl, ddl = real(idx, pct, False); rb, _, ddb = real(idx, pct, True)
        fmt = lambda g: f"x{g:,.2f}" if g < 1000 else f"x{g:,.0f}"
        print(f" {pct:.0%}: {fmt(pl)} ({npl} trades) | {fmt(pb)} | {fmt(rl)} ({nrl}, {ddl:.0%}) | {fmt(rb)} ({ddb:.0%})")
