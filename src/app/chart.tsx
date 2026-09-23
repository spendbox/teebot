export function EquityChart({ points }: { points: { t: number; equity: number }[] }) {
  if (points.length < 2) return <p className="muted">The chart appears after the bot has run a few times.</p>;
  const w = 600;
  const h = 160;
  const values = points.map((p) => p.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const t0 = points[0].t;
  const tSpan = points[points.length - 1].t - t0 || 1;
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${(((p.t - t0) / tSpan) * w).toFixed(1)},${(h - 8 - ((p.equity - min) / span) * (h - 16)).toFixed(1)}`)
    .join(" ");
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Balance over time">
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="muted">
        Low ${min.toFixed(2)} · High ${max.toFixed(2)}
      </div>
    </>
  );
}
