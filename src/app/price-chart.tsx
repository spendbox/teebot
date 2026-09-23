"use client";

import { useEffect, useRef, useState } from "react";

export interface Series {
  name: string;
  color: string; // CSS color / var()
  points: { t: number; v: number }[];
  width?: number;
}

export interface RefLine {
  value: number;
  label: string;
  color: string;
}

export interface Gap {
  from: number; // current value
  to: number; // target value
  label: string;
}

interface Props {
  series: Series[];
  refLines?: RefLine[];
  gap?: Gap | null;
  xDomain?: [number, number];
  xTicks: { t: number; label: string }[];
  formatY: (v: number) => string;
  formatX: (t: number) => string;
  height?: number;
  ariaLabel: string;
}

const PAD = { top: 12, right: 12, bottom: 24, left: 58 };

function PriceChart({ series, refLines = [], gap, xDomain, xTicks, formatY, formatX, height = 220, ariaLabel }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return <p className="empty">Not enough price data yet.</p>;

  const values = [...all.map((p) => p.v), ...refLines.map((r) => r.value)];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const padY = (hi - lo || hi * 0.01) * 0.08;
  lo -= padY;
  hi += padY;
  const [t0, t1] = xDomain ?? [Math.min(...all.map((p) => p.t)), Math.max(...all.map((p) => p.t))];
  const w = width - PAD.left - PAD.right;
  const h = height - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * w;
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * h;

  // Clean y ticks
  const step = niceStep((hi - lo) / 4);
  const yTicks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(v);

  const main = series[0].points;
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    main.forEach((p, i) => {
      const d = Math.abs(x(p.t) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  const hp = hover != null ? main[hover] : null;
  const last = main[main.length - 1];

  return (
    <div className="pchart" ref={box}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        style={{ touchAction: "pan-y" }}
      >
        {/* grid + y axis */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} className="grid" />
            <text x={PAD.left - 8} y={y(v)} className="axis" textAnchor="end" dominantBaseline="middle">
              {formatY(v)}
            </text>
          </g>
        ))}
        {xTicks.map((tk) => (
          <text key={tk.t} x={x(tk.t)} y={height - 6} className="axis" textAnchor="middle">
            {tk.label}
          </text>
        ))}

        {/* distance to target */}
        {gap && gap.to > gap.from && (
          <g>
            <rect x={x(last.t) - 3} width={6} y={y(gap.to)} height={Math.max(1, y(gap.from) - y(gap.to))} className="gapbar" rx={3} />
            <text
              x={x(last.t) + (x(last.t) < width - 110 ? 10 : -10)}
              y={(y(gap.to) + y(gap.from)) / 2}
              className="gaplabel"
              textAnchor={x(last.t) < width - 110 ? "start" : "end"}
              dominantBaseline="middle"
            >
              {gap.label}
            </text>
          </g>
        )}

        {/* reference lines with direct labels */}
        {refLines.map((r) => (
          <g key={r.label}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(r.value)} y2={y(r.value)} stroke={r.color} strokeWidth={1.5} />
            <text x={width - PAD.right - 4} y={y(r.value) - 5} className="reflabel" textAnchor="end">
              {r.label} {formatY(r.value)}
            </text>
          </g>
        ))}

        {/* series */}
        {series.map((s) => (
          <path
            key={s.name}
            d={s.points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width ?? 2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {/* current price dot */}
        <circle cx={x(last.t)} cy={y(last.v)} r={4.5} fill={series[0].color} stroke="var(--card)" strokeWidth={2} />

        {/* hover */}
        {hp && (
          <g>
            <line x1={x(hp.t)} x2={x(hp.t)} y1={PAD.top} y2={PAD.top + h} className="crosshair" />
            {series.map((s) => {
              const p = s.points.find((q) => q.t === hp.t);
              return p ? <circle key={s.name} cx={x(p.t)} cy={y(p.v)} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} /> : null;
            })}
          </g>
        )}
      </svg>
      {hp && (
        <div className="ptip" style={{ left: Math.min(Math.max(x(hp.t), 90), width - 90) }}>
          <div className="muted">{formatX(hp.t)}</div>
          {series.map((s) => {
            const p = s.points.find((q) => q.t === hp.t);
            return p ? (
              <div key={s.name} className="ptip-row">
                <span className="key" style={{ background: s.color }} />
                <strong>{formatY(p.v)}</strong> <span className="muted">{s.name}</span>
              </div>
            ) : null;
          })}
        </div>
      )}
      {series.length > 1 && (
        <div className="plegend">
          {series.map((s) => (
            <span key={s.name}>
              <span className="key" style={{ background: s.color }} /> {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

const usd0 = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const hhmm = (t: number) => `${new Date(t).toISOString().slice(11, 16)} UTC`;

// Today's Bitcoin price against the lines that matter to the bot.
export function TodayChart(props: {
  points: { t: number; v: number }[];
  dayStart: number;
  open: number | null;
  trigger: number | null;
  entry: number | null;
  stop: number | null;
  showGap: boolean;
  coin?: string;
  decimals?: number;
}) {
  const { points, dayStart, open, trigger, entry, stop, showGap, coin = "Bitcoin", decimals = 0 } = props;
  const last = points[points.length - 1];
  const refLines: RefLine[] = [];
  if (open) refLines.push({ value: open, label: "Opened at", color: "var(--muted)" });
  if (trigger && !entry) refLines.push({ value: trigger, label: "Buys at", color: "var(--accent)" });
  if (entry) refLines.push({ value: entry, label: "Bought at", color: "var(--good)" });
  if (stop) refLines.push({ value: stop, label: "Emergency stop", color: "var(--bad)" });
  const pct = trigger && last ? (trigger / last.v - 1) * 100 : null;
  const gap = showGap && trigger && last && pct != null && pct > 0 ? { from: last.v, to: trigger, label: `${pct.toFixed(2)}% to go` } : null;
  return (
    <PriceChart
      series={[{ name: `${coin} price`, color: "var(--text)", points }]}
      refLines={refLines}
      gap={gap}
      xDomain={[dayStart, dayStart + 86_400_000]}
      xTicks={[0, 6, 12, 18, 24].map((hr) => ({ t: dayStart + hr * 3_600_000, label: hr === 24 ? "24:00" : `${String(hr).padStart(2, "0")}:00` }))}
      formatY={decimals ? (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}` : usd0}
      formatX={hhmm}
      ariaLabel={`${coin} price today with the buy level`}
    />
  );
}

// Last 60 days: price vs its 20-day average (the uptrend check).
export function TrendChart(props: { points: { t: number; close: number; avg: number }[] }) {
  const pts = props.points;
  const first = pts[0]?.t ?? 0;
  const lastT = pts[pts.length - 1]?.t ?? 0;
  const ticks = [0, 1, 2, 3].map((k) => first + ((lastT - first) * k) / 3);
  const day = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <PriceChart
      series={[
        { name: "Daily close", color: "var(--accent)", points: pts.map((p) => ({ t: p.t, v: p.close })) },
        { name: "20-day average", color: "var(--muted)", points: pts.map((p) => ({ t: p.t, v: p.avg })), width: 1.5 },
      ]}
      xTicks={ticks.map((t) => ({ t, label: day(t) }))}
      formatY={usd0}
      formatX={day}
      height={180}
      ariaLabel="Bitcoin daily closes and 20-day average"
    />
  );
}
