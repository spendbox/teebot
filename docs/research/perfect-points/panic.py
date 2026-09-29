import numpy as np, pandas as pd
exec(open("checklist.py").read().split("def near")[0])
score = buy.sum(axis=1).values; yr = df.t.dt.year.values; COST = 0.00065
sma200d = df.close.rolling(200 * 24).mean().values  # 200-day average
for k in (6, 7, 8):
  for hold in (6, 12, 24, 48):
    for trend in (False, True):
        rets = {}; i = 200
        while i < len(c) - hold:
            if score[i] >= k and (not trend or c[i] > sma200d[i]):
                r = c[i + hold] / c[i] * (1 - 2 * COST) - 1; rets.setdefault(yr[i], []).append(r); i += hold
            else: i += 1
        cells = []; tot = {}
        for y in range(2017, 2024):
            rs = rets.get(y, []); g = np.prod([1 + r for r in rs]) - 1 if rs else 0
            cells.append(f"{y % 100}:{g:+.0%}({len(rs)})")
        tr_ = np.prod([1 + r for y in range(2017, 2021) for r in rets.get(y, [])]); te_ = np.prod([1 + r for y in range(2021, 2024) for r in rets.get(y, [])])
        allr = [r for v in rets.values() for r in v]
        print(f"{k}+ signs, sell after {hold:2d}h{', only above 200-day avg' if trend else '':26s} win {np.mean([r>0 for r in allr]):.0%} avg {np.mean(allr):+.2%} | 2017-20 x{tr_:.2f}  2021-23 x{te_:.2f} | " + " ".join(cells))
