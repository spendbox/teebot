import { breakoutStats } from "@/lib/breakout/bot";
import { THRESHOLDS, leverageFor } from "@/lib/breakout/strategy";
import { db, type Settings } from "@/lib/db";
import { price } from "./ui";

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

const STATUS: Record<string, { text: string; tone: string }> = {
  waiting: { text: "Watching for a breakout", tone: "accent" },
  "no-uptrend": { text: "No trade today", tone: "" },
  entered: { text: "In a trade", tone: "good" },
  done: { text: "Done for today", tone: "" },
  "skipped-low-score": { text: "Skipped: score too low", tone: "" },
  "skipped-too-small": { text: "Skipped: account too small", tone: "bad" },
};

export async function BreakoutPanel({ settings, equity }: { settings: Settings; equity: number | null }) {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data }, stats] = await Promise.all([
    db().from("day_plans").select("*").eq("mode", settings.mode).order("day", { ascending: false }).limit(7),
    breakoutStats(settings.mode),
  ]);
  const plans = (data ?? []) as PlanRow[];
  const plan = plans.find((p) => p.day === today);
  const profile = settings.breakout_profile ?? "balanced";
  const hourNow = new Date().getUTCHours();
  const clues = plan?.clues ?? [];
  const waiting = plan?.status === "waiting";
  const earlyClue = { label: `Breakout before ${THRESHOLDS.hour}:00 UTC`, met: hourNow < THRESHOLDS.hour };
  const shownClues = waiting ? [...clues, earlyClue] : clues;
  const score = waiting ? shownClues.filter((c) => c.met).length : plan?.score ?? null;
  const lev = score != null ? leverageFor(score, profile) : 0;
  const progress =
    plan?.trigger && plan.price && plan.open && plan.trigger > plan.open
      ? Math.max(0, Math.min(1, (plan.price - plan.open) / (plan.trigger - plan.open)))
      : null;
  const distance = plan?.trigger && plan?.price ? (plan.trigger / plan.price - 1) * 100 : null;
  const belowPeak = settings.peak_equity && equity ? Math.max(0, (1 - equity / settings.peak_equity) * 100) : 0;
  const streak = stats.current > 0 ? `${stats.current}W` : stats.current < 0 ? `${-stats.current}L` : "-";
  const status = plan ? STATUS[plan.status] ?? { text: plan.status, tone: "" } : null;

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Today · Bitcoin</h2>
          {status && <span className={`chip ${status.tone}`}>{status.text}</span>}
        </div>

        {!plan ? (
          <p className="empty">No check yet today. Press &quot;Check now&quot;.</p>
        ) : (
          <>
            <p className="muted small" style={{ margin: 0 }}>
              {plan.note}
            </p>

            {plan.eligible && plan.trigger ? (
              <div className="target">
                <div className="prices">
                  <div>
                    <div className="muted small">BTC now</div>
                    <div className="big">{price(plan.price)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="muted small">Buys at</div>
                    <div className="big">{price(plan.trigger)}</div>
                  </div>
                </div>
                {progress != null && (
                  <div className="progress" aria-label="Distance to the buy price">
                    <span style={{ width: `${progress * 100}%` }} />
                  </div>
                )}
                {distance != null && (
                  <div className="muted small" style={{ marginTop: 6 }}>
                    {distance > 0 ? `${distance.toFixed(2)}% to go` : "Breakout level reached"}
                  </div>
                )}
              </div>
            ) : null}

            {score != null && plan.eligible && (
              <div className="score">
                <div className="n">{score}/7</div>
                <div className="small">
                  {waiting ? "Score if it broke out now" : "Setup score"}
                  <div className="muted">{lev ? `Trades at ${lev}x leverage` : "Below 5 - it would skip this one"}</div>
                </div>
              </div>
            )}

            {shownClues.length > 0 && plan.eligible && (
              <ul className="clues">
                {shownClues.map((c) => (
                  <li key={c.label} className={c.met ? "yes" : "no"}>
                    <span className="ic">{c.met ? "✓" : "–"}</span>
                    <span>{c.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <div className="stats">
        <div className="card stat">
          <div className="label">Trades</div>
          <div className="value">{stats.count}</div>
          <div className="hint">{stats.count ? `${Math.round((stats.wins / stats.count) * 100)}% won` : "~2 a month"}</div>
        </div>
        <div className="card stat">
          <div className="label">Streak</div>
          <div className={`value ${stats.current > 0 ? "good" : stats.current < 0 ? "bad" : ""}`}>{streak}</div>
          <div className="hint">worst run: {stats.longestLoss}L</div>
        </div>
        <div className="card stat">
          <div className="label">From high</div>
          <div className={`value ${belowPeak > 0.5 ? "bad" : "good"}`}>{belowPeak > 0.5 ? `−${belowPeak.toFixed(1)}%` : "At high"}</div>
          <div className="hint">tested worst −37%</div>
        </div>
        <div className="card stat">
          <div className="label">Leverage</div>
          <div className="value">{profile === "safer" ? "2–3x" : "2–5x"}</div>
          <div className="hint">by score</div>
        </div>
      </div>

      {plans.length > 1 && (
        <section className="card">
          <div className="card-head">
            <h2>This week</h2>
          </div>
          <div className="list">
            {plans.map((p) => (
              <div key={p.day} className="list-row">
                <div className="main">
                  <div className="title">
                    {new Date(p.day + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
                  </div>
                  <div className="sub">{p.note}</div>
                </div>
                <div className="right small muted">{p.score != null ? `${p.score}/7${p.leverage ? ` · ${p.leverage}x` : ""}` : ""}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
