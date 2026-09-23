export function EquityChart({ points }: { points: { t: number; equity: number }[] }) {
  if (points.length < 2) return <p className="empty">The balance chart appears after the bot has run for a while.</p>;
  const w = 600;
  const h = 130;
  const values = points.map((p) => p.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const t0 = points[0].t;
  const tSpan = points[points.length - 1].t - t0 || 1;
  const xy = points.map((p) => [((p.t - t0) / tSpan) * w, h - 6 - ((p.equity - min) / span) * (h - 14)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const up = values[values.length - 1] >= values[0];
  const color = up ? "var(--good)" : "var(--bad)";
  return (
    <div className="chart-wrap">
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Balance over time">
        <defs>
          <linearGradient id="eqfill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#eqfill)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="chart-foot">
        <span>{new Date(t0).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span>
          Low ${min.toFixed(2)} · High ${max.toFixed(2)}
        </span>
        <span>Now</span>
      </div>
    </div>
  );
}
