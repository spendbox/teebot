import sys, numpy as np, pandas as pd
from features import load_hourly, zigzag, build
from sklearn.metrics import roc_auc_score
df = load_hourly("h1.csv")
f = build(df)
split = pd.Timestamp("2021-01-01", tz="UTC")
train = (df.t < split) & (df.index >= 200); test = df.t >= split
out = {}
for pct in (0.02, 0.03, 0.05):
    lab = zigzag(df.close.values, pct)
    print(f"\n### waves of {pct:.0%}: {int((lab==1).sum())} perfect buys, {int((lab==-1).sum())} perfect sells in {len(df)} hours")
    rows = []
    for col in f.columns:
        x = f[col]
        r = {"feature": col}
        for name, m in (("tr", train), ("te", test)):
            ok = m & x.notna()
            for side, v in (("buy", 1), ("sell", -1)):
                y = (lab[ok] == v).astype(int)
                r[f"{side}_{name}"] = roc_auc_score(y, x[ok]) if y.sum() > 5 else np.nan
        ok = train & x.notna()
        r["med_all"] = x[ok].median(); r["med_buy"] = x[ok & (lab == 1)].median(); r["med_sell"] = x[ok & (lab == -1)].median()
        rows.append(r)
    t = pd.DataFrame(rows)
    t["buy_strength"] = (t.buy_tr - 0.5).abs().where(np.sign(t.buy_tr - .5) == np.sign(t.buy_te - .5), 0).clip(upper=(t.buy_te - .5).abs())
    t["sell_strength"] = (t.sell_tr - 0.5).abs().where(np.sign(t.sell_tr - .5) == np.sign(t.sell_te - .5), 0).clip(upper=(t.sell_te - .5).abs())
    out[pct] = t
    pd.set_option("display.width", 250); pd.set_option("display.max_rows", 200)
    print(t.sort_values("buy_strength", ascending=False).round(3).to_string(index=False))
pd.to_pickle(out, "auc.pkl")
