import numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from features import load_hourly
df = load_hourly("h1.csv"); c = df.close.values; f = pd.read_pickle("invent.pkl"); sc = np.load("scores.npy"); COST = 0.00065
yr = df.t.dt.year.values; st = 800
tr = (yr <= 2020) & (np.arange(len(c)) >= st); te = (yr >= 2021) & (yr <= 2023)
cands = {"fall_deceleration": +1, "whale_size": +1, "seller_exhaustion": +1, "retail_vs_whale_24h": -1, "kurtosis_72h": -1,
         "squeeze_pct": +1, "efficiency_24h": +1, "anchored_vwap_gap": -1, "liquidation_cascade": +1, "panic_score": +1}
def trade(sig, per, hold):
    idx = np.where(per)[0]; i = idx[0]; end = idx[-1]; g = 1; n = 0; w = 0
    while i < end - hold:
        if sig[i]:
            r = c[i + 1 + hold] / c[i + 1] * (1 - 2 * COST) - 1; g *= 1 + r; n += 1; w += r > 0; i += hold + 1   # enter NEXT hour (no same-bar fill)
        else: i += 1
    return g, n, w
hold_tr, hold_te = c[np.where(tr)[0][-1]] / c[np.where(tr)[0][0]], c[np.where(te)[0][-1]] / c[np.where(te)[0][0]]
print(f"holding: 2018-20 ${100*hold_tr:.0f} | 2021-23 ${100*hold_te:.0f}")
print("-- each invented indicator alone: buy (next hour) when it is in its top/bottom 5% (level set on 2017-20), sell 24h later")
ranks = {}
for k, d in cands.items():
    x = f[k].values * d; q = np.nanquantile(x[tr], 0.95); sig = x >= q
    a = trade(sig, tr, 24); b = trade(sig, te, 24)
    print(f"  {k:22s} 2017-20: ${100*a[0]:5.0f} ({a[1]} trades, {a[2]/max(a[1],1):.0%} won) | 2021-23: ${100*b[0]:5.0f} ({b[1]} trades, {b[2]/max(b[1],1):.0%} won)")
    ranks[k] = pd.Series(x).rank(pct=True).values
print("-- combined 'turn score' = average rank of the 5 most consistent (fall_deceleration, whale_size, seller_exhaustion, retail_vs_whale, kurtosis)")
combo = np.nanmean(np.c_[[ranks[k] for k in ("fall_deceleration", "whale_size", "seller_exhaustion", "retail_vs_whale_24h", "kurtosis_72h")]].T, axis=1)
for top in (0.95, 0.98):
    q = np.nanquantile(combo[tr], top)
    for extra, lbl in ((np.ones(len(c), bool), "alone"), (sc[:, 0] >= 3, "+ 3 of the 5 long signs")):
        sig = (combo >= q) & extra
        for hold in (24, 72):
            a = trade(sig, tr, hold); b = trade(sig, te, hold)
            print(f"  top {1-top:.0%} {lbl:24s} hold {hold}h: 2017-20 ${100*a[0]:5.0f} ({a[1]} tr, {a[2]/max(a[1],1):.0%}) | 2021-23 ${100*b[0]:5.0f} ({b[1]} tr, {b[2]/max(b[1],1):.0%})")
