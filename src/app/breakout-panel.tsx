import { breakoutStats } from "@/lib/breakout/bot";
import { THRESHOLDS, leverageFor } from "@/lib/breakout/strategy";
import { checkWarning } from "@/lib/breakout/warning";
import { getKlines } from "@/lib/bybit";
import { db, type Position, type Settings } from "@/lib/db";
import { TodayChart, TrendChart } from "./price-chart";
import { price } from "./ui";

const DAY = 86_400_000;

async function chartData(dayStart: number) {
  const [m15, daily] = await Promise.all([
    getKlines("BTCUSDT", "15", 100, undefined, "linear").catch(() => []),
    getKlines("BTCUSDT", "D", 85, undefined, "linear").catch(() => []),
  ]);
  const now = Date.now();
  // Each 15-minute candle is plotted at its closing time (the latest one at "now").
  const today = m15.filter((k) => k.t >= dayStart).map((k) => ({ t: Math.min(k.t + 15 * 60_000, now), v: k.c }));
  const done = daily.filter((k) => k.t < dayStart);
  const trend = done
    .map((k, i) => (i >= 19 ? { t: k.t, close: k.c, avg: done.slice(i - 19, i + 1).reduce((s, d) => s + d.c, 0) / 20 } : null))
    .filter((p): p is { t: number; close: number; avg: number } => p !== null)
    .slice(-60);
  return { today, trend };
}

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

export async function BreakoutPanel({ settings, equity, openTrade }: { settings: Settings; equity: number | null; openTrade?: Position }) {
  const today = new Date().toISOString().slice(0, 10);
  const dayStart = Math.floor(Date.now() / DAY) * DAY;
  const [{ data }, stats, charts] = await Promise.all([
    db().from("day_plans").select("*").eq("mode", settings.mode).order("day", { ascending: false }).limit(7),
    breakoutStats(settings.mode),
    chartData(dayStart),
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

            {charts.today.length > 1 && (plan.eligible || openTrade) && (
              <>
                <TodayChart
                  points={charts.today}
                  dayStart={dayStart}
                  open={plan.open}
                  trigger={plan.trigger}
                  entry={openTrade?.entry_price ?? null}
                  stop={openTrade?.stop_price ?? null}
                  showGap={waiting}
                />
                <p className="explain">
                  {openTrade
                    ? `The bot bought at the green line. If the price falls to the red line (5% lower), it sells straight away to limit the loss. Otherwise it sells before midnight UTC.`
                    : waiting
                      ? `The black line is Bitcoin's price today. The bot buys only if it climbs up to the blue "Buys at" line${distance != null && distance > 0 ? ` - the shaded bar shows the ${distance.toFixed(2)}% it still has to rise` : ""}. That level is today's opening price plus 70% of yesterday's high-to-low range.`
                      : `The black line is Bitcoin's price today; the blue line is where the bot would have bought.`}
                </p>
              </>
            )}

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

      {charts.trend.length > 1 && (
        <section className="card">
          <div className="card-head">
            <h2>Uptrend check · last 60 days</h2>
            <span className={`chip ${plan?.eligible ? "good" : "bad"}`}>{plan?.eligible ? "Uptrend: can trade" : "No uptrend: no trades"}</span>
          </div>
          <TrendChart points={charts.trend} />
          <p className="explain">
            The bot only trades on days after Bitcoin closed <strong>above</strong> its 20-day average (blue line above the grey line).
            {(() => {
              const last = charts.trend[charts.trend.length - 1];
              const pct = (last.close / last.avg - 1) * 100;
              return ` Yesterday it closed ${Math.abs(pct).toFixed(1)}% ${pct >= 0 ? "above" : "below"} the average.`;
            })()}
          </p>
        </section>
      )}

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

      {settings.run_start_at && settings.run_start_equity != null && equity != null && (
        <WarningGauge startAt={Date.parse(settings.run_start_at)} startEquity={settings.run_start_equity} equity={equity} active={!!settings.warning_at} />
      )}

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

const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

function WarningGauge({ startAt, startEquity, equity, active }: { startAt: number; startEquity: number; equity: number; active: boolean }) {
  const w = checkWarning(startEquity, equity, startAt, Date.now());
  const change = (equity / startEquity - 1) * 100;
  const used = Math.min(1, w.dropPct / w.limitPct);
  const tone = active || used >= 1 ? "bad" : used >= 0.6 ? "warn" : "good";
  return (
    <section className="card" id="early-warning">
      <div className="card-head">
        <h2>Early warning</h2>
        <span className={`chip ${tone === "bad" ? "bad" : tone === "warn" ? "" : "good"}`}>{active ? "Triggered" : tone === "warn" ? "Getting close" : "All clear"}</span>
      </div>
      <div className="gauge" aria-label={`Down ${w.dropPct.toFixed(1)}% of a ${w.limitPct}% limit`}>
        <span className={tone} style={{ width: `${Math.max(2, used * 100)}%` }} />
      </div>
      <div className="row-between small" style={{ marginTop: 6 }}>
        <span>
          {change >= 0 ? "Up" : "Down"} <strong>{Math.abs(change).toFixed(1)}%</strong> since {shortDate(startAt)}
        </span>
        <span className="muted">warning at −{w.limitPct}%</span>
      </div>
      <p className="explain">
        If the balance falls {w.limitPct}% below where it started{w.limitChangesAt ? ` (before ${shortDate(w.limitChangesAt)})` : ""}, the strategy may have stopped
        working and you get an alert. A working bot falls this far only about 1–2 times in 100.
      </p>
    </section>
  );
}
