import numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from features import load_hourly, zigzag
df = load_hourly("h1.csv"); f = pd.read_pickle("longfeat.pkl"); c = df.close.values; n = len(c)
lab = zigzag(c, 0.12)
split = pd.Timestamp("2021-01-01", tz="UTC"); st = 200 * 24
tr = ((df.t < split) & (df.index >= st)).values; te = (df.t >= split).values
buy = pd.DataFrame({
 "fell 7%+ in 24h": f.ret_24h < -0.07,
 "12%+ below 7-day high": f.D_from_high_7d < -0.12,
 "RSI(14) under 30": f.rsi14 < 30,
 "Stochastic under 15": f.stoch_k < 15,
 "5%+ below 50-hour avg": f.dist_sma50 < -0.05,
 "volume 1.8x+ weekly normal": f.vol_vs_168h > 1.8,
 "daily volume 1.3x+ monthly": f.D_volume_1d_vs_30d > 1.3,
 "choppy (ATR 1.5%+)": f.atr_pct > 0.015,
})
sell = pd.DataFrame({
 "rose 5%+ in 24h": f.ret_24h > 0.05,
 "at the top of the week's range (95%+)": f.range_pos_168h > 0.95,
 "RSI(14) over 70": f.rsi14 > 70,
 "Stochastic over 85": f.stoch_k > 85,
 "4%+ above 50-hour avg": f.dist_sma50 > 0.04,
 "volume 1.4x+ weekly normal": f.vol_vs_168h > 1.4,
 "daily volume 1.1x+ monthly": f.D_volume_1d_vs_30d > 1.1,
 "choppy (ATR 1.1%+)": f.atr_pct > 0.011,
})
W = 24
pos_b = np.where(lab == 1)[0]; pos_s = np.where(lab == -1)[0]
def near(i, pos): return np.any(np.abs(pos - i) <= W)
def fwd(i, h): return c[min(i + h, n - 1)] / c[i] - 1
for name, tab, v, pos in (("BIG PERFECT BUY (12% waves)", buy, 1, pos_b), ("BIG PERFECT SELL (12% waves)", sell, -1, pos_s)):
    print(f"\n===== {name}")
    print("sign                                   at the perfect point 2017-20 / 2021-23 | any hour")
    for col in tab:
        x = tab[col].values
        print(f"  {col:38s} {x[tr & (lab == v)].mean():5.0%} / {x[te & (lab == v)].mean():5.0%}  | {x[st:].mean():5.0%}")
    score = tab.sum(axis=1).values
    print("signs  | period  | hours | days | within ±1 day of a big turn | price 3 days later | 7 days later")
    for k in (5, 6, 7, 8):
        for per, m in (("2017-20", tr), ("2021-23", te)):
            sel = np.where(m & (score >= k))[0]
            if len(sel) == 0: print(f"  {k}+/8 | {per} | 0"); continue
            days = len(set(sel // 24))
            nr = np.mean([near(i, pos) for i in sel]); daynr = np.mean([near(d * 24 + 12, pos) for d in set(sel // 24)])
            print(f"  {k}+/8 | {per} | {len(sel):5d} | {days:4d} | hours {nr:4.0%}, days {daynr:4.0%} | {np.mean([fwd(i, 72) for i in sel]):+6.2%} | {np.mean([fwd(i, 168) for i in sel]):+6.2%}")
    base = np.where(tr | te)[0]
    print(f"  any hour: within ±1 day of a big turn {np.mean([near(i, pos) for i in base[::10]]):.0%} | 3d {np.mean([fwd(i, 72) for i in base[::10]]):+.2%} | 7d {np.mean([fwd(i, 168) for i in base[::10]]):+.2%}")
