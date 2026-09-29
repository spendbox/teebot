import numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from features import load_hourly, zigzag
df = load_hourly("h1.csv"); f = pd.read_pickle("longfeat.pkl"); c = df.close.values
split = pd.Timestamp("2021-01-01", tz="UTC"); st = 200 * 24
tr = ((df.t < split) & (df.index >= st)).values; te = (df.t >= split).values; allm = tr | te
skip = {"hour_utc", "weekday", "INV_leg_dir", "INV_from_leg_extreme", "INV_leg_move", "INV_rsi_divergence_low", "INV_rsi_divergence_high"}
out = []
for pct in (0.03, 0.12):
    lab = zigzag(c, pct)
    for side, v in (("LONG (perfect buy)", 1), ("SHORT (perfect sell)", -1)):
        for col in f.columns:
            if col in skip: continue
            x = f[col].values; pts = tr & (lab == v) & ~np.isnan(x)
            if pts.sum() < 15: continue
            hi = np.nanmedian(x[pts]) > np.nanmedian(x[allm])
            for cov in (0.7, 0.8, 0.9):
                th = np.nanquantile(x[pts], 1 - cov if hi else cov)
                sig = (x >= th) if hi else (x <= th)
                tp = te & (lab == v) & ~np.isnan(x)
                out.append(dict(wave=pct, side=side, feature=col, cover=cov, rule=f"{'>=' if hi else '<='} {th:.4g}",
                                cov_test=sig[tp].mean(), false_alarm=sig[allm & ~np.isnan(x)].mean()))
t = pd.DataFrame(out); t["lift"] = t.cov_test / t.false_alarm
t.to_pickle("coverage.pkl")
pd.set_option("display.width", 220)
for (w, s), g in t.groupby(["wave", "side"], sort=False):
    for cov in (0.7, 0.8, 0.9):
        gg = g[(g.cover == cov)].sort_values("false_alarm").head(8)
        print(f"\n### {w:.0%} waves, {s}: rule true at {cov:.0%} of perfect points in 2017-20 — best (fewest false alarms)")
        print(gg[["feature", "rule", "cov_test", "false_alarm", "lift"]].round(3).to_string(index=False))
