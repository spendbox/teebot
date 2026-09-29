import numpy as np, pandas as pd, pickle
from bo import load_days, run, metrics
D = load_days(); pickle.dump(D, open("days.pkl", "wb"))
for s, e in (("2018-01-01", "2021-01-01"), ("2021-01-01", "2024-01-01")):
    m = metrics(run(D, s, e), s, e); print(s[:4], e[:4], {k: round(v, 2) for k, v in m.items()})
