import numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from features import load_hourly, zigzag
df = load_hourly("h1.csv"); f = pd.read_pickle("longfeat.pkl"); c = df.close.values; n = len(c); yr = df.t.dt.year.values
split = pd.Timestamp("2021-01-01", tz="UTC"); st = 200 * 24
tr = ((df.t < split) & (df.index >= st)).values; te = (df.t >= split).values
COST = 0.00065
L = pd.DataFrame({"72h range bottom 8%": f.range_pos_72h <= 0.08, "Keltner <= -0.95": f.keltner_pos <= -0.95,
    "4%+ below 50h avg": f.dist_sma50 <= -0.039, "RSI14 <= 32": f.rsi14 <= 31.6, "2.3%+ below 24h VWAP": f.dist_vwap24 <= -0.0226})
S = pd.DataFrame({"72h range top 8%": f.range_pos_72h >= 0.92, "24h range top 12%": f.range_pos_24h >= 0.88,
    "RSI14 >= 67": f.rsi14 >= 67, "Keltner >= 0.79": f.keltner_pos >= 0.79, "1.9%+ above 24h VWAP": f.dist_vwap24 >= 0.0189})
ls, ss = L.sum(axis=1).values, S.sum(axis=1).values
lab = zigzag(c, 0.12); pb, ps = np.where(lab == 1)[0], np.where(lab == -1)[0]
print("How many of the 5 signs are present at the perfect points (2017-20 / 2021-23):")
for k in range(3, 6):
    print(f"  {k}+ of 5: LONG {np.mean(ls[tr & (lab==1)] >= k):.0%} / {np.mean(ls[te & (lab==1)] >= k):.0%} (any hour {np.mean(ls[st:] >= k):.1%}) | SHORT {np.mean(ss[tr & (lab==-1)] >= k):.0%} / {np.mean(ss[te & (lab==-1)] >= k):.0%} (any hour {np.mean(ss[st:] >= k):.1%})")
def run(k, mode, exit_rule, hold=72, trail=0.12, per=None):
    """mode: long / short / both. exit: 'time' (hold hours), 'opposite' (opposite signal), 'trail' (price moves trail% against from best)."""
    idx = np.where(per)[0]; i = idx[0]; end = idx[-1]; g = 1.0; trades = []
    while i < end:
        side = 0
        if mode in ("long", "both") and ls[i] >= k: side = 1
        elif mode in ("short", "both") and ss[i] >= k: side = -1
        if not side: i += 1; continue
        e = c[i]; best = e; j = i + 1
        while j < end:
            best = max(best, c[j]) if side == 1 else min(best, c[j])
            if exit_rule == "time" and j - i >= hold: break
            if exit_rule == "opposite" and ((side == 1 and ss[j] >= k) or (side == -1 and ls[j] >= k)): break
            if exit_rule == "trail" and ((side == 1 and c[j] <= best * (1 - trail)) or (side == -1 and c[j] >= best * (1 + trail))): break
            j += 1
        r = (c[j] / e - 1) * side - 2 * COST; g *= 1 + r; trades.append(r); i = j + (1 if exit_rule == "time" else 0)
        if exit_rule == "opposite": continue
    return g, trades
hold_tr, hold_te = c[np.where(tr)[0][-1]] / c[np.where(tr)[0][0]], c[-1] / c[np.where(te)[0][0]]
print(f"\nHolding: 2017-20 x{hold_tr:.2f}, 2021-23 x{hold_te:.2f}")
print("signs | trades | exit | 2017-20 result (trades, win%) | 2021-23 result (trades, win%)")
for k in (4, 5):
    for mode in ("long", "short", "both"):
        for ex, kw in (("hold 3 days", dict(exit_rule="time", hold=72)), ("hold 7 days", dict(exit_rule="time", hold=168)),
                       ("until opposite signs", dict(exit_rule="opposite")), ("until 12% against best", dict(exit_rule="trail"))):
            a, ta = run(k, mode, per=tr, **kw); b, tb = run(k, mode, per=te, **kw)
            w = lambda t: f"{len(t)}, {np.mean([x > 0 for x in t]):.0%}" if t else "0"
            print(f"  {k}+/5 | {mode:5s} | {ex:22s} | x{a:6.2f} ({w(ta)}) | x{b:6.2f} ({w(tb)})")
np.save("scores.npy", np.c_[ls, ss])
