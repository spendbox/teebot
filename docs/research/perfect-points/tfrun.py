import numpy as np, pandas as pd, warnings, pickle; warnings.filterwarnings("ignore")
from tf import bars, dp_points, feats
out = {}
for name, rule in (("DAILY", "1D"), ("WEEKLY", "1W")):
    b = bars(rule); b = b[b.index >= pd.Timestamp("2017-08-17", tz="UTC")]
    p = b.close.values; buys, sells = dp_points(p); f = feats(b, rule)
    lab = np.zeros(len(b), int); lab[buys] = 1; lab[sells] = -1
    ok = np.arange(len(b)) >= (200 if rule == "1D" else 30)
    early = (b.index < pd.Timestamp("2021-01-01", tz="UTC"))
    print(f"\n===== {name} perfect bot: {len(buys)} buys, {len(sells)} sells over {len(b)} bars (avg hold {np.mean(sells[:len(buys)]-buys[:len(sells)]) if len(sells) else 0:.1f} bars)")
    rows = []
    for col in f.columns:
        x = f[col].values
        def med(m): v = x[m & ok & ~np.isnan(x)]; return np.median(v) if len(v) else np.nan
        rows.append(dict(indicator=col, normal=med(np.ones(len(b), bool)), at_buy=med(lab == 1), at_sell=med(lab == -1),
                         buy_early=med((lab == 1) & early), buy_late=med((lab == 1) & ~early), sell_early=med((lab == -1) & early), sell_late=med((lab == -1) & ~early)))
    t = pd.DataFrame(rows).set_index("indicator"); out[name] = (b, f, lab, t)
    pd.set_option("display.width", 250); pd.set_option("display.max_rows", 100)
    print(t.round(2).to_string())
pickle.dump(out, open("tf.pkl", "wb"))
