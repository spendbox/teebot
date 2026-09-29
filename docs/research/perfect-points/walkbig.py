import numpy as np, pandas as pd
from features import load_hourly, zigzag, build
from sklearn.ensemble import HistGradientBoostingClassifier
df = load_hourly("h1.csv"); f = build(df); c = df.close.values
X = f.drop(columns=["hour_utc", "weekday"]).values; yr = df.t.dt.year.values
COST = 0.00065
def trade(pb, ps, idx, thb, ths):
    pos = False; g = 1.0; n = 0; e = 0
    for i in idx:
        if not pos and pb[i] >= thb: pos = True; e = c[i]; n += 1
        elif pos and ps[i] >= ths: g *= c[i] / e * (1 - 2 * COST); pos = False
    if pos: g *= c[idx[-1]] / e * (1 - 2 * COST)
    return g - 1, n
for pct, lag, q in ((0.10, 0, 0.99), (0.10, 0, 0.995), (0.10, 6, 0.99), (0.15, 0, 0.995), (0.20, 0, 0.995), (0.20, 12, 0.995)):
    lab = zigzag(c, pct); yb = np.roll(lab == 1, lag); ys = np.roll(lab == -1, lag)
    cells = []; tot = 1; hold = 1
    for Y in (2019, 2020, 2021, 2022, 2023):
        tr = (yr < Y) & (np.arange(len(c)) >= 200); te = yr == Y
        kw = dict(max_iter=300, learning_rate=0.05, max_leaf_nodes=31, l2_regularization=1.0, random_state=0)
        pb = HistGradientBoostingClassifier(**kw).fit(X[tr], yb[tr]).predict_proba(X)[:, 1]
        ps = HistGradientBoostingClassifier(**kw).fit(X[tr], ys[tr]).predict_proba(X)[:, 1]
        # threshold = same share of hours as chosen, measured on the previous year only (no peeking)
        prev = yr == Y - 1
        r, n = trade(pb, ps, np.where(te)[0], np.quantile(pb[prev], q), np.quantile(ps[prev], q))
        h = c[te][-1] / c[te][0] - 1
        cells.append(f"{Y}: {r:+.0%} ({n}) vs hold {h:+.0%}"); tot *= 1 + r; hold *= 1 + h
    print(f"{pct:.0%} waves, confirm {lag}h late, top {1-q:.0%}: " + " | ".join(cells) + f" || 5 yrs: bot x{tot:.2f}, hold x{hold:.2f}")
