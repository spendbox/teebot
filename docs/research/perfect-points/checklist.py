import numpy as np, pandas as pd
from features import load_hourly, zigzag, build
df = load_hourly("h1.csv"); f = build(df); c = df.close.values
lab = zigzag(c, 0.03)
split = pd.Timestamp("2021-01-01", tz="UTC"); tr = ((df.t < split) & (df.index >= 200)).values; te = (df.t >= split).values
buy = pd.DataFrame({
 "RSI(2) under 10": f.rsi2 < 10,
 "fell 2%+ in last 4h": f.ret_4h < -0.02,
 "5%+ below 24h high": f.from_high_24h < -0.05,
 "Stochastic under 20": f.stoch_k < 20,
 "below lower Bollinger band": f.boll_pctb < 0.05,
 "volume 1.3x+ weekly normal": f.vol_vs_168h > 1.3,
 "sellers dominate (taker buy <47%)": f.taker_buy_share < 0.47,
 "big red candle": f.body < -0.5,
})
sell = pd.DataFrame({
 "RSI(2) over 90": f.rsi2 > 90,
 "rose 2%+ in last 4h": f.ret_4h > 0.02,
 "near 24h high (within 1%)": f.from_high_24h > -0.01,
 "Stochastic over 80": f.stoch_k > 80,
 "above upper Bollinger band": f.boll_pctb > 0.95,
 "volume 1.1x+ weekly normal": f.vol_vs_168h > 1.1,
 "buyers dominate (taker buy >53%)": f.taker_buy_share > 0.53,
 "big green candle": f.body > 0.5,
})
def near(i, v, k=2): return (lab[max(0, i - k): i + k + 1] == v).any()
for name, tab, v in (("PERFECT BUY", buy, 1), ("PERFECT SELL", sell, -1)):
    print(f"\n===== {name} checklist (3% waves)")
    print("how often each sign is present:  at the perfect point (2017-20 / 2021-23)  vs  any normal hour")
    for col in tab:
        x = tab[col].values
        print(f"  {col:38s} {x[tr & (lab == v)].mean():5.0%} / {x[te & (lab == v)].mean():5.0%}   vs {x[te].mean():5.0%}")
    score = tab.sum(axis=1).values
    print("signs present -> hours in 2021-23 | really the exact point | within ±2h of it | price 24h later (avg)")
    for k in range(4, 9):
        sel = np.where(te & (score >= k))[0]
        if len(sel) == 0: continue
        ex = (lab[sel] == v).mean(); nr = np.mean([near(i, v) for i in sel])
        fwd = np.nanmean([c[min(i + 24, len(c) - 1)] / c[i] - 1 for i in sel])
        print(f"  {k}+ of 8: {len(sel):5d} hours | {ex:5.0%} | {nr:5.0%} | {fwd:+.2%}")
    allf = np.nanmean([c[min(i + 24, len(c) - 1)] / c[i] - 1 for i in np.where(te)[0]])
    print(f"  (any hour: avg price 24h later {allf:+.2%}; share of hours that are exact points {(lab[te]==v).mean():.1%})")
