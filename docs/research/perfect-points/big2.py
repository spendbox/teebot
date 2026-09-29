exec(open("big.py").read().split("periods =")[0])
allidx = np.arange(len(c))
print("Neighbourhood check, real long-only, whole period (hold x10.25) and 2018-2023 only / 2021-2023 only:")
i18 = np.where(yr >= 2018)[0]; i21 = np.where(yr >= 2021)[0]; i17 = np.where(yr == 2017)[0]
print(f"  holding: all x{c[-1]/c[0]:.2f} | 2017 part x{c[i17][-1]/c[i17][0]:.2f} | 2018-23 x{c[-1]/c[i18][0]:.2f} | 2021-23 x{c[-1]/c[i21][0]:.2f}")
for pct in (0.06, 0.07, 0.08, 0.09, 0.10, 0.11, 0.12, 0.13, 0.14, 0.15, 0.17, 0.20):
    a = real(allidx, pct, False); b = real(i17, pct, False); d = real(i18, pct, False); e = real(i21, pct, False)
    print(f"  {pct:.0%}: all x{a[0]:6.2f} (dip {a[2]:.0%}) | 2017 part x{b[0]:.2f} | 2018-23 x{d[0]:.2f} (dip {d[2]:.0%}) | 2021-23 x{e[0]:.2f}")
