import numpy as np, pandas as pd, pickle, warnings; warnings.filterwarnings("ignore")
out = pickle.load(open("tf.pkl", "rb")); COST = 0.00065
skip = {"INV month (1-12)", "INV weekday (0=Mon)", "INV days since halving", "INV round-number distance %", "INV below all-time high %"}
for name, (b, f, lab, t) in out.items():
    ok = (np.arange(len(b)) >= (200 if name == "DAILY" else 30))
    early = (b.index < pd.Timestamp("2021-01-01", tz="UTC")); late = ~early
    print(f"\n===== {name}: signs present at ~80% of perfect points (level set on 2017-20, checked on 2021-23)")
    for side, v in (("BUY", 1), ("SELL", -1)):
        rows = []
        for col in f.columns:
            if col in skip: continue
            x = f[col].values; pts = ok & early & (lab == v) & ~np.isnan(x)
            if pts.sum() < 10: continue
            hi = np.nanmedian(x[pts]) > np.nanmedian(x[ok])
            th = np.nanquantile(x[pts], 0.2 if hi else 0.8); sig = (x >= th) if hi else (x <= th)
            rows.append((col, ("≥ " if hi else "≤ ") + f"{th:.3g}", sig[ok & late & (lab == v)].mean(), sig[ok & ~np.isnan(x)].mean()))
        rows.sort(key=lambda r: r[3])
        print(f" -- {side}: sign | at perfect {side.lower()}s 2021-23 | any bar")
        for r in rows[:7]: print(f"    {r[0]:40s} {r[1]:>9s} | {r[2]:4.0%} | {r[3]:4.0%}")
    # simple trade test: buy on 'buy sign' (RSI2 low & red bar), sell on 'sell sign' (RSI2 high & green bar)
    c = b.close.values
    for lo, hi_ in ((25, 75), (15, 85), (10, 90)):
        x = f["RSI(2)"].values; body = f["candle body (-1 red..+1 green)"].values
        res = {}
        for per, m in (("2017-20", ok & early), ("2021-23", ok & late)):
            idx = np.where(m)[0]; pos = False; g = 1; n = 0
            for i in idx:
                if not pos and x[i] <= lo and body[i] < 0: pos = True; e = c[i]; n += 1
                elif pos and x[i] >= hi_ and body[i] > 0: g *= c[i] / e * (1 - 2 * COST); pos = False
            if pos: g *= c[idx[-1]] / e * (1 - 2 * COST)
            res[per] = (g, n, c[idx[-1]] / c[idx[0]])
        print(f"  trade it: buy when RSI(2) ≤ {lo} on a red bar, sell when RSI(2) ≥ {hi_} on a green bar -> " +
              " | ".join(f"{k}: $100->${100*v[0]:,.0f} ({v[1]} trades, hold ${100*v[2]:,.0f})" for k, v in res.items()))
    # how often is a sign-bar actually a perfect point
    x = f["RSI(2)"].values; body = f["candle body (-1 red..+1 green)"].values
    sb = ok & (x <= 25) & (body < 0); ss = ok & (x >= 75) & (body > 0)
    print(f"  bars with the buy sign that were a perfect buy: {np.mean(lab[sb] == 1):.0%} (any bar: {np.mean(lab[ok] == 1):.0%}); sell sign -> perfect sell: {np.mean(lab[ss] == -1):.0%} (any bar: {np.mean(lab[ok] == -1):.0%})")
