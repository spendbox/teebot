import numpy as np, pandas as pd
from features import load_hourly, zigzag, build
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
df = load_hourly("h1.csv"); f = build(df)
c = df.close.values
split = pd.Timestamp("2021-01-01", tz="UTC")
tr = ((df.t < split) & (df.index >= 200)).values; te = (df.t >= split).values
COST = 0.00065
X = f.drop(columns=["hour_utc", "weekday"]).values
res = {}
for pct in (0.02, 0.03, 0.05):
    lab = zigzag(c, pct)
    nb = (lab[te] == 1).sum()
    print(f"\n######## {pct:.0%} waves — test period 2021-2023 has {nb} perfect buys in {te.sum()} hours (1 in {te.sum()//nb})")
    for lag in (0, 1, 2):
        # lag 0: "is THIS hour the exact low?"   lag k: "was the hour k hours ago the exact low?" (bot confirms k hours late)
        yb = np.roll(lab == 1, lag); ys = np.roll(lab == -1, lag)
        mb = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=31, l2_regularization=1.0, random_state=0).fit(X[tr], yb[tr])
        ms = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=31, l2_regularization=1.0, random_state=0).fit(X[tr], ys[tr])
        pb, ps = mb.predict_proba(X)[:, 1], ms.predict_proba(X)[:, 1]
        auc_b, auc_s = roc_auc_score(yb[te], pb[te]), roc_auc_score(ys[te], ps[te])
        # precision among the most confident 1% / 0.2% of test hours
        line = f"  confirm {lag}h late: AUC buy {auc_b:.3f} sell {auc_s:.3f} |"
        for top in (0.01, 0.002):
            th = np.quantile(pb[te], 1 - top)
            sel = te & (pb >= th)
            near = np.array([lab[max(0, i - lag - 2): i - lag + 3].__contains__(1) for i in np.where(sel)[0]])
            line += f" top {top:.1%}: exact {yb[sel].mean():.0%}, within ±2h {near.mean():.0%} |"
        print(line)
        # trading: buy when buy-prob is high, sell when sell-prob is high. Thresholds picked on TRAIN.
        best = None
        for q in (0.9, 0.95, 0.98, 0.99, 0.995):
            thb = np.quantile(pb[tr], q); ths = np.quantile(ps[tr], q)
            for per, m in (("train", tr), ("test", te)):
                idx = np.where(m)[0]; pos = False; g = 1.0; n = 0; e = 0
                for i in idx:
                    if not pos and pb[i] >= thb: pos = True; e = c[i]; n += 1
                    elif pos and ps[i] >= ths: g *= (c[i] / e) * (1 - 2 * COST) ; pos = False
                if pos: g *= c[idx[-1]] / e * (1 - 2 * COST)
                yrs = len(idx) / 8760
                if per == "train": trg = g ** (1 / yrs) - 1
                else: teg, ten = g ** (1 / yrs) - 1, n / yrs
            if best is None or trg > best[1]: best = (q, trg, teg, ten)
        hold = (c[te][-1] / c[te][0]) ** (8760 / te.sum()) - 1
        print(f"     trading (threshold top {1-best[0]:.1%} chosen on 2017-20): train {best[1]:+.0%}/yr -> TEST {best[2]:+.0%}/yr, {best[3]:.0f} trades/yr   (holding: {hold:+.0%}/yr)")
