import numpy as np, pandas as pd, pickle, warnings; warnings.filterwarnings("ignore")
from features import rsi
out = pickle.load(open("tf.pkl", "rb")); b, f, lab, t = out["DAILY"]; bw, fw, _, _ = out["WEEKLY"]
wr = rsi(bw.close, 14).reindex(b.index, method="ffill")
c = b.close
cols = {"RSI(14) daily": f["RSI(14)"], "RSI(14) weekly": wr, "vs 200-day avg %": f["vs 200-bar average %"], "30-day move %": f["30-bar move %"],
        "below 90-day high %": f["below 90-bar high %"], "below all-time high %": f["INV below all-time high %"], "days since halving": f["INV days since halving"],
        "volume vs 20-day": f["volume vs 20-bar avg"]}
trades = [("2017-09-15","2017-12-17"),("2018-02-06","2018-02-20"),("2019-01-29","2019-06-26"),("2020-03-13","2020-12-31"),("2021-01-01","2021-11-10"),("2022-01-24","2022-03-28"),("2023-01-01","2023-12-08")]
rows = []
for bd, sd in trades:
    for kind, d in (("BUY", bd), ("SELL", sd)):
        ts = pd.Timestamp(d, tz="UTC"); r = {"": f"{kind} {d}", "price": f"${c[ts]:,.0f}"}
        for k, s in cols.items(): r[k] = round(float(s[ts]), 1)
        rows.append(r)
T = pd.DataFrame(rows).set_index(""); pd.set_option("display.width", 250); print(T.to_string())
print("\nnormal day medians:", {k: round(float(np.nanmedian(s[s.index >= pd.Timestamp('2018-03-01', tz='UTC')])), 1) for k, s in cols.items()})
