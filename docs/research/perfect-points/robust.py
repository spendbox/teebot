exec(open("longshort.py").read().split("hold_tr, hold_te")[0].replace("print(", "(lambda *a, **k: None)("))
def yearly(k, trail):
    cells = []; tot = 1; inmk = 0; hours = 0
    for y in range(2018, 2024):
        per = (yr == y) & (np.arange(n) >= st)
        g, t = run(k, "long", "trail", trail=trail, per=per); tot *= g
        cells.append(f"{y%100}:{g-1:+.0%}")
    return tot, " ".join(cells)
hold = {y: c[yr == y][-1] / c[yr == y][0] for y in range(2018, 2024)}
print("holding by year: " + " ".join(f"{y%100}:{v-1:+.0%}" for y, v in hold.items()) + f" | 2018-23 x{np.prod(list(hold.values())):.2f}")
for k in (4, 5):
    for trail in (0.08, 0.10, 0.12, 0.15, 0.20):
        tot, cells = yearly(k, trail)
        a, _ = run(k, "long", "trail", trail=trail, per=tr); b, _ = run(k, "long", "trail", trail=trail, per=te)
        print(f"{k}+/5 signs, sell {trail:.0%} below best: 2017-20 x{a:.2f} | 2021-23 x{b:.2f} | by year {cells} | 2018-23 x{tot:.2f}")
# time in market & worst dip for the headline version
def curve(k, trail, per):
    idx = np.where(per)[0]; eq = np.ones(len(idx)); g = 1; pos = False; e = best = 0
    for m, i in enumerate(idx):
        if not pos and ls[i] >= k: pos = True; e = best = c[i]; g *= 1 - COST
        elif pos:
            best = max(best, c[i])
            if c[i] <= best * (1 - trail): g *= c[i] / e * (1 - COST); pos = False
        eq[m] = g * (c[i] / e if pos else 1)
    inm = None
    return eq
for per, nm in ((tr, "2017-20"), (te, "2021-23")):
    eq = curve(5, 0.12, per); dd = 1 - (eq / np.maximum.accumulate(eq)).min()
    p = c[per]; hdd = 1 - (p / np.maximum.accumulate(p)).min()
    print(f"{nm}: 5/5 + 12% trail worst dip {dd:.0%} (holding {hdd:.0%})")
