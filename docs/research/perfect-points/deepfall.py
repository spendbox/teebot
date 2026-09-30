import numpy as np, pandas as pd, warnings; warnings.filterwarnings("ignore")
from features import load_hourly
df = load_hourly("h1.csv"); c = df.close.values; F = pd.read_pickle("longfeat.pkl"); sc = np.load("scores.npy"); COST = 0.00065
yr = df.t.dt.year.values; st = 200 * 24
dd7 = F.D_from_high_7d.values
def run(depth, exit_kind, per):
    idx = np.where(per)[0]; i = idx[0]; end = idx[-1]; g = 1; n = 0; wins = 0
    while i < end:
        if sc[i, 0] >= 4 and dd7[i] <= -depth:
            e = c[i]; best = e; j = i + 1
            while j < end:
                best = max(best, c[j])
                if exit_kind[0] == "hold" and j - i >= exit_kind[1]: break
                if exit_kind[0] == "trail" and c[j] <= best * (1 - exit_kind[1]): break
                j += 1
            r = c[j] / e * (1 - 2 * COST) - 1; g *= 1 + r; n += 1; wins += r > 0; i = j + 1
        else: i += 1
    return g, n, wins
pers = {"2018-20": (yr >= 2018) & (yr <= 2020), "2021-23": (yr >= 2021) & (yr <= 2023)}
hold = {k: c[np.where(m)[0][-1]] / c[np.where(m)[0][0]] for k, m in pers.items()}
print("holding:", {k: f"${100*v:.0f}" for k, v in hold.items()})
for depth in (0.0, 0.10, 0.15, 0.20):
    for ex in (("hold", 72), ("hold", 168), ("trail", 0.12)):
        cells = []
        for k, m in pers.items():
            g, n, w = run(depth, ex, m & (np.arange(len(c)) >= st)); cells.append(f"{k}: ${100*g:.0f} ({n} trades, {w/max(n,1):.0%} won)")
        print(f"4+ signs & {depth:.0%}+ below 7-day high, {ex[0]} {ex[1]}: " + " | ".join(cells))
