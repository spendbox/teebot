import numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from sklearn.metrics import roc_auc_score
from features import load_hourly, zigzag
from invent import invent
df = load_hourly("h1.csv"); c = df.close.values; f = invent(df); f.to_pickle("invent.pkl")
split = pd.Timestamp("2021-01-01", tz="UTC"); st = 800
tr = ((df.t < split) & (df.index >= st)).values; te = (df.t >= split).values
sc = np.load("scores.npy")
fwd = pd.Series(c).shift(-24).values / c - 1
rows = []
for pct in (0.03, 0.12):
    lab = zigzag(c, pct)
    for side, v, look in (("BUY", 1, sc[:, 0] >= 3), ("SELL", -1, sc[:, 1] >= 3)):
        pos = np.where(lab == v)[0]
        near = np.zeros(len(c), bool)
        for p in pos: near[max(0, p - 2): p + 3] = True
        for col in f.columns:
            x = f[col].values; ok = ~np.isnan(x) & ~np.isnan(fwd)
            def auc(m, y):
                m = m & ok
                return roc_auc_score(y[m], x[m]) if 5 < y[m].sum() < m.sum() - 5 else np.nan
            a_tr, a_te = auc(tr, lab == v), auc(te, lab == v)
            la_tr, la_te = auc(tr & look, near), auc(te & look, near)
            # forward 24h return in the indicator's 'right' extreme decile (direction learned on train)
            hi = a_tr > 0.5
            q = np.nanquantile(x[tr & ok], 0.9 if hi else 0.1)
            sig = (x >= q) if hi else (x <= q)
            f_tr = np.nanmean(fwd[tr & ok & sig]) - np.nanmean(fwd[tr & ok]); f_te = np.nanmean(fwd[te & ok & sig]) - np.nanmean(fwd[te & ok])
            rows.append(dict(wave=pct, side=side, ind=col, at_point_tr=a_tr, at_point_te=a_te, vs_lookalike_tr=la_tr, vs_lookalike_te=la_te,
                             fwd24_edge_tr=f_tr * 100 * (1 if v == 1 else -1), fwd24_edge_te=f_te * 100 * (1 if v == 1 else -1)))
t = pd.DataFrame(rows); t.to_pickle("invtest.pkl")
pd.set_option("display.width", 250); pd.set_option("display.max_rows", 400)
for (w, s), g in t.groupby(["wave", "side"], sort=False):
    g = g.copy()
    g["consistent_point"] = np.where(np.sign(g.at_point_tr - .5) == np.sign(g.at_point_te - .5), np.minimum(abs(g.at_point_tr - .5), abs(g.at_point_te - .5)), 0)
    print(f"\n######## {w:.0%} waves, perfect {s}")
    print(g.sort_values("consistent_point", ascending=False).drop(columns=["wave", "side"]).round(3).to_string(index=False))
