import { breakoutStats } from "@/lib/breakout/bot";
import { THRESHOLDS, leverageFor } from "@/lib/breakout/strategy";
import { db, type Settings } from "@/lib/db";
import { price as fmtPrice } from "./ui";

interface PlanRow {
  day: string;
  status: string;
  eligible: boolean;
  open: number | null;
  trigger: number | null;
  price: number | null;
  score: number | null;
  leverage: number | null;
  clues: { label: string; met: boolean }[] | null;
  note: string | null;
  updated_at: string;
}

const STATUS_TEXT: Record<string, string> = {
  waiting: "Watching for a breakout",
  "no-uptrend": "No trade today (no uptrend)",
  entered: "In a trade",
  done: "Today's trade is finished",
  "skipped-low-score": "Skipped (score too low)",
  "skipped-too-small": "Skipped (account below Bybit minimum)",
};

export async function BreakoutPanel({ settings, equity }: { settings: Settings; equity: number | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data }, stats] = await Promise.all([
    db().from("day_plans").select("*").eq("mode", settings.mode).order("day", { ascending: false }).limit(8),
    breakoutStats(settings.mode),
  ]);
  const plans = (data ?? []) as PlanRow[];
  const plan = plans.find((p) => p.day === today);
  const profile = settings.breakout_profile ?? "balanced";
  const hourNow = new Date().getUTCHours();
  const clues = plan?.clues ?? [];
  const knownMet = clues.filter((c) => c.met).length;
  const ifNow = plan?.status === "waiting" ? knownMet + (hourNow < THRESHOLDS.hour ? 1 : 0) : plan?.score ?? null;
  const distance = plan?.trigger && plan?.price ? (plan.trigger / plan.price - 1) * 100 : null;
  const belowPeak = settings.peak_equity && equity ? (1 - equity / settings.peak_equity) * 100 : 0;
  const streakText = stats.current > 0 ? `${stats.current} win${stats.current > 1 ? "s" : ""} in a row` : stats.current < 0 ? `${-stats.current} loss${stats.current < -1 ? "es" : ""} in a row` : "-";

  return (
    <>
      <h2 className="section">Today&apos;s setup (Bitcoin futures)</h2>
      <section className="card">
        {!plan ? (
          <p className="muted">No check yet today - press &quot;Check market now&quot;.</p>
        ) : (
          <>
            <div className="row-between">
              <span className={`chip ${plan.eligible ? "uptrend" : "downtrend"}`}>{STATUS_TEXT[plan.status] ?? plan.status}</span>
              <span className="muted small">Updated {new Date(plan.updated_at).toLocaleTimeString()}</span>
            </div>
            <p className="reason" style={{ marginTop: 10 }}>
              {plan.note}
            </p>
            {plan.eligible && (
              <div className="grid small-grid">
                <div className="stat">
                  <div className="label">Bitcoin now</div>
                  <div className="value">{fmtPrice(plan.price)}</div>
                </div>
                <div className="stat">
                  <div className="label">Buys at</div>
                  <div className="value">{fmtPrice(plan.trigger)}</div>
                  {distance != null && <div className="muted small">{distance > 0 ? `${distance.toFixed(2)}% above current price` : "reached"}</div>}
                </div>
                <div className="stat">
                  <div className="label">{plan.status === "waiting" ? "Score if it broke out now" : "Score"}</div>
                  <div className="value">{ifNow ?? "-"}/7</div>
                  <div className="muted small">
                    {ifNow != null ? (leverageFor(ifNow, profile) ? `would trade at ${leverageFor(ifNow, profile)}x` : "would skip (needs 5+)") : ""}
                  </div>
                </div>
              </div>
            )}
            {clues.length > 0 && (
              <ul className="clues">
                {clues.map((c) => (
                  <li key={c.label} className={c.met ? "good" : "muted"}>
                    {c.met ? "✓" : "✗"} {c.label}
                  </li>
                ))}
                {plan.status === "waiting" && (
                  <li className={hourNow < THRESHOLDS.hour ? "good" : "muted"}>
                    {hourNow < THRESHOLDS.hour ? "✓" : "✗"} Breakout before {THRESHOLDS.hour}:00 UTC (now {hourNow}:00)
                  </li>
                )}
              </ul>
            )}
          </>
        )}
      </section>

      <div className="grid">
        <div className="card stat">
          <div className="label">Breakout trades</div>
          <div className="value">{stats.count}</div>
          <div className="muted small">{stats.count ? `${Math.round((stats.wins / stats.count) * 100)}% won` : "none yet - about 1 every 2-3 weeks"}</div>
        </div>
        <div className="card stat">
          <div className="label">Current streak</div>
          <div className="value">{streakText}</div>
        </div>
        <div className="card stat">
          <div className="label">Longest losing streak</div>
          <div className="value">{stats.longestLoss}</div>
          <div className="muted small">backtest worst: 5</div>
        </div>
        <div className="card stat">
          <div className="label">Below highest balance</div>
          <div className={`value ${belowPeak > 0.5 ? "bad" : "good"}`}>{belowPeak > 0.5 ? `−${belowPeak.toFixed(1)}%` : "at the high"}</div>
          <div className="muted small">backtest worst: −37%</div>
        </div>
      </div>

      {plans.length > 1 && (
        <section className="card">
          <h2>Last few days</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.day}>
                    <td>{p.day}</td>
                    <td>{STATUS_TEXT[p.status] ?? p.status}</td>
                    <td>{p.score != null ? `${p.score}/7${p.leverage ? `, ${p.leverage}x` : ""}` : ""}</td>
                    <td className="muted" style={{ whiteSpace: "normal" }}>
                      {p.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
