import numpy as np, pandas as pd, pickle, warnings; warnings.filterwarnings("ignore")
from sklearn.metrics import roc_auc_score
from sklearn.ensemble import HistGradientBoostingClassifier
from features import load_hourly, zigzag
res = []
# ---- daily & weekly: among bars that LOOK like buys (red bar, RSI2<=35), which were perfect buys?
out = pickle.load(open("tf.pkl", "rb"))
for name, (b, f, lab, t) in out.items():
    ok = np.arange(len(b)) >= (200 if name == "DAILY" else 30)
    early = b.index < pd.Timestamp("2021-01-01", tz="UTC")
    for side, v, cond in (("buy", 1, (f["RSI(2)"] <= 35) & (f["candle body (-1 red..+1 green)"] < 0)),
                          ("sell", -1, (f["RSI(2)"] >= 65) & (f["candle body (-1 red..+1 green)"] > 0))):
        m = ok & cond.values
        y = lab[m] == v; F = f[m]; E = early[m]
        print(f"\n=== {name} {side}: {m.sum()} look-alike bars, {y.sum()} were perfect ({y.mean():.0%}), {(~y).sum()} were not")
        rows = []
        for col in f.columns:
            x = F[col].values; good = ~np.isnan(x)
            if good.sum() < 30: continue
            a1 = roc_auc_score(y[good & E], x[good & E]) if (y[good & E].sum() > 3 and (~y[good & E]).sum() > 3) else np.nan
            a2 = roc_auc_score(y[good & ~E], x[good & ~E]) if (y[good & ~E].sum() > 3 and (~y[good & ~E]).sum() > 3) else np.nan
            rows.append((col, a1, a2, np.nanmedian(x[y & good]), np.nanmedian(x[~y & good])))
        rows.sort(key=lambda r: -min(abs(r[1] - .5), abs(r[2] - .5)) if np.sign(r[1] - .5) == np.sign(r[2] - .5) else 0)
        print("   indicator | separation 2017-20 / 2021-23 (0.50 = none) | median: perfect vs look-alike")
        for r in rows[:6]: print(f"   {r[0]:40s} {r[1]:.2f} / {r[2]:.2f} | {r[3]:.2f} vs {r[4]:.2f}")
        # can all indicators together tell them apart? train 2017-20, test 2021-23
        X = F.drop(columns=["INV month (1-12)", "INV weekday (0=Mon)", "INV round-number distance %"]).values
        if E.sum() > 50 and (~E).sum() > 30:
          try:
            mdl = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_depth=3, random_state=0).fit(X[E], y[E])
            p = mdl.predict_proba(X[~E])[:, 1]
            top = p >= np.quantile(p, 0.7)
            print(f"   ALL indicators together, trained 2017-20, tested 2021-23: separation {roc_auc_score(y[~E], p):.2f}; "
                  f"top 30% most confident were perfect {y[~E][top].mean():.0%} vs {y[~E].mean():.0%} overall")
          except ValueError: print("   (too few examples for the combined model)")
# ---- hourly 12% turns: among hours with 4+ of the 5 long signs, which were within 24h of a perfect bottom?
df = load_hourly("h1.csv"); c = df.close.values; F = pd.read_pickle("longfeat.pkl"); sc = np.load("scores.npy")
lab = zigzag(c, 0.12); st = 200 * 24
split = (df.t < pd.Timestamp("2021-01-01", tz="UTC")).values
pb = np.where(lab == 1)[0]; ps = np.where(lab == -1)[0]
for side, k, pos in (("buy", 0, pb), ("sell", 1, ps)):
    m = (np.arange(len(c)) >= st) & (sc[:, k] >= 4)
    idx = np.where(m)[0]; y = np.array([np.any(np.abs(pos - i) <= 24) for i in idx]); E = split[idx]
    print(f"\n=== HOURLY 12% {side}: {len(idx)} look-alike hours (4+ of 5 signs), {y.mean():.0%} were within a day of a real big {'bottom' if side=='buy' else 'top'}")
    rows = []
    for col in F.columns:
        x = F[col].values[idx]; good = ~np.isnan(x)
        try:
            a1 = roc_auc_score(y[good & E], x[good & E]); a2 = roc_auc_score(y[good & ~E], x[good & ~E])
        except Exception: continue
        rows.append((col, a1, a2, np.nanmedian(x[y & good]), np.nanmedian(x[~y & good])))
    rows.sort(key=lambda r: -min(abs(r[1] - .5), abs(r[2] - .5)) if np.sign(r[1] - .5) == np.sign(r[2] - .5) else 0)
    for r in rows[:8]: print(f"   {r[0]:28s} {r[1]:.2f} / {r[2]:.2f} | {r[3]:.4g} vs {r[4]:.4g}")
    X = F.drop(columns=["hour_utc", "weekday"]).values[idx]
    keep = [j for j in range(X.shape[1]) if len(np.unique(X[E][:, j][~np.isnan(X[E][:, j])])) > 2]
    X = X[:, keep]
    mdl = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_depth=3, random_state=0).fit(X[E], y[E])
    p = mdl.predict_proba(X[~E])[:, 1]; top = p >= np.quantile(p, 0.7)
    print(f"   ALL indicators together (train 2017-20, test 2021-23): separation {roc_auc_score(y[~E], p):.2f}; top 30% were real {y[~E][top].mean():.0%} vs {y[~E].mean():.0%} overall")
