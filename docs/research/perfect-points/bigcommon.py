import numpy as np, pandas as pd
from longfeat import build_long, load_hourly, zigzag
from sklearn.metrics import roc_auc_score
df = load_hourly("h1.csv"); f = build_long(df); c = df.close.values
f.to_pickle("longfeat.pkl")
split = pd.Timestamp("2021-01-01", tz="UTC")
start = 200 * 24  # need 200 days of history
tr = ((df.t < split) & (df.index >= start)).values; te = (df.t >= split).values
rows = []
labs = {p: zigzag(c, p) for p in (0.09, 0.12, 0.15)}
for p, lab in labs.items():
    print(f"{p:.0%}: perfect buys train {int((lab[tr]==1).sum())}, test {int((lab[te]==1).sum())}; sells {int((lab[tr]==-1).sum())}/{int((lab[te]==-1).sum())}")
for col in f.columns:
    x = f[col].values; r = {"feature": col}
    for side, v in (("buy", 1), ("sell", -1)):
        for nm, m in (("tr", tr), ("te", te)):
            ys, xs = [], []
            for lab in labs.values():
                ok = m & ~np.isnan(x); ys.append(lab[ok] == v); xs.append(x[ok])
            y = np.concatenate(ys); xx = np.concatenate(xs)
            r[f"{side}_{nm}"] = roc_auc_score(y, xx) if y.sum() > 5 and np.nanstd(xx) > 0 else np.nan
    lab = labs[0.12]; ok = ~np.isnan(x) & (tr | te)
    r["normal"] = np.nanmedian(x[ok]); r["at_buy"] = np.nanmedian(x[ok & (lab == 1)]); r["at_sell"] = np.nanmedian(x[ok & (lab == -1)])
    rows.append(r)
t = pd.DataFrame(rows)
def strength(a, b): return np.where(np.sign(a - .5) == np.sign(b - .5), np.minimum(abs(a - .5), abs(b - .5)), 0)
t["buy_str"] = strength(t.buy_tr, t.buy_te); t["sell_str"] = strength(t.sell_tr, t.sell_te)
t["both_str"] = np.where(np.sign(t.buy_tr-.5)==np.sign(t.sell_tr-.5), np.minimum(t.buy_str, t.sell_str), 0)
t.to_pickle("bigcommon.pkl")
pd.set_option("display.width", 250); pd.set_option("display.max_rows", 300)
for k in ("buy_str", "sell_str", "both_str"):
    print(f"\n#### sorted by {k}")
    print(t.sort_values(k, ascending=False).head(25).round(3).to_string(index=False))
print("\n#### weakest (no link)")
print(t.assign(m=np.maximum(t.buy_str, t.sell_str)).sort_values("m").head(15).round(3).to_string(index=False))
