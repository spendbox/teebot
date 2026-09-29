import numpy as np, pandas as pd, pickle, warnings; warnings.filterwarnings("ignore")
from bo import run, metrics, DEFAULT
D = pickle.load(open("days.pkl", "rb"))
P = [("2018-01-01", "2021-01-01"), ("2021-01-01", "2024-01-01")]
def two(**kw):
    out = []
    for s, e in P:
        m = metrics(run(D, s, e, **kw), s, e); out.append(f"${m['end']:5.0f} dip {-m['maxdd']:3.0f}% {m['trades']:3d}tr")
    return " | ".join(out)
print("=== A. PARAMETER SENSITIVITY  (2018-20 | 2021-23; holding: $211 | $153)")
for name, key, vals in [("Breakout distance K", "K", [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]),
                        ("Strong-trend % (clue 1)", "trend", [4, 6, 8.575, 10, 12, 15]),
                        ("Calm-day ratio (clue 6)", "rangeRel", [0.6, 0.7, 0.752, 0.85, 1.0]),
                        ("Volume multiple", "volMult", [0, 1.0, 1.25, 1.5, 1.75, 2.0]),
                        ("Early-hour cutoff (clue 7)", "hour", [8, 10, 12, 14, 16]),
                        ("Emergency stop", "stop", [0.03, 0.04, 0.05, 0.06, 0.08, 0.10])]:
    print(f"-- {name}")
    for v in vals: print(f"   {v:>6}: {two(**{key: v})}{'   <- live' if v == DEFAULT[key] else ''}")
print("\n=== C. DESIGN VARIANTS")
for name, kw in [("Live bot", {}),
                 ("Volume vs SAME UTC hour (last 20 days)", dict(volMode="same")),
                 ("Same-hour volume, 1.25x", dict(volMode="same", volMult=1.25)),
                 ("Range-based stop: 1.0x avg daily range", dict(stopMode="range", stop=1.0)),
                 ("Range-based stop: 1.5x avg daily range", dict(stopMode="range", stop=1.5)),
                 ("Fixed 1x on every score 5+", dict(lev={5: 1, 6: 1, 7: 1})),
                 ("Fixed 2x on every score 5+", dict(lev={5: 2, 6: 2, 7: 2})),
                 ("Fixed 3x on every score 5+", dict(lev={5: 3, 6: 3, 7: 3})),
                 ("Safer profile (2x/3x/3x)", dict(lev={5: 2, 6: 3, 7: 3})),
                 ("Also trade score 4 at 1x", dict(lev={4: 1, 5: 2, 6: 4, 7: 5}, minScore=4)),
                 ("Risk-based: lose max 10% if stopped", dict(riskPct=0.10, lev={5: 1, 6: 1, 7: 1})),
                 ("Risk-based: lose max 15% if stopped", dict(riskPct=0.15, lev={5: 1, 6: 1, 7: 1})),
                 ("Slippage 0.1% per side (2x assumed)", dict(slip=0.001)),
                 ("Slippage 0.2% per side (4x assumed)", dict(slip=0.002))]:
    print(f"   {name:42s} {two(**kw)}")
