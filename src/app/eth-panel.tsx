import { getKlines } from "@/lib/bybit";
import { db, openPositions, closedPositions, type Position, type Settings } from "@/lib/db";
import { ethMode, ethStats } from "@/lib/eth/bot";
import { ETH_EARLY_HOUR, ETH_SYMBOL, btcTriggerFor, ethLeverage } from "@/lib/eth/strategy";
import { TodayChart } from "./price-chart";
import { money, signedMoney } from "./ui";

const DAY = 86_400_000;

interface PlanRow {
  status: string;
  eligible: boolean;
  open: number | null;
  trigger: number | null;
  price: number | null;
  score: number | null;
  leverage: number | null;
  clues: { key?: string; label: string; met: boolean }[] | null;
  note: string | null;
}

const STATUS: Record<string, { text: string; tone: string }> = {
  waiting: { text: "Watching for a breakout", tone: "accent" },
  "no-uptrend": { text: "No trade today", tone: "" },
  entered: { text: "In a trade", tone: "good" },
  done: { text: "Done for today", tone: "" },
  "skipped-low-score": { text: "Skipped: score too low", tone: "" },
  "skipped-too-small": { text: "Skipped: too small", tone: "bad" },
};

const eth = (n: number | null | undefined) => (n == null ? "-" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

async function liveData(dayStart: number) {
  const [m15, btcD] = await Promise.all([
    getKlines(ETH_SYMBOL, "15", 100, undefined, "linear").catch(() => []),
    getKlines("BTCUSDT", "D", 4, undefined, "linear").catch(() => []),
  ]);
  const now = Date.now();
  const points = m15.filter((k) => k.t >= dayStart).map((k) => ({ t: Math.min(k.t + 15 * 60_000, now), v: k.c }));
  const today = btcD.find((d) => d.t === dayStart);
  const past = btcD.filter((d) => d.t < dayStart);
  const btcBrokeOut = today && past.length ? today.h >= btcTriggerFor(past, today.o) : false;
  return { points, btcBrokeOut };
}

function TradeLine({ p }: { p: Position }) {
  const open = p.status === "open";
  return (
    <div className="list-row">
      <div className="main">
        <div className="title">
          ETH{p.leverage ? ` · ${p.leverage}x` : ""}
          {p.score != null ? <span className="muted small"> · score {p.score}/4</span> : null}
        </div>
        <div className="sub">
          {open
            ? `Bought ${eth(p.entry_price)} · stop ${eth(p.stop_price)} · ${when(p.opened_at)}`
            : `${eth(p.entry_price)} → ${eth(p.exit_price)} · ${p.exit_reason ?? ""} · ${when(p.closed_at)}`}
        </div>
      </div>
      {!open && <div className={`right ${(p.pnl ?? 0) >= 0 ? "good" : "bad"}`}>{signedMoney(p.pnl)}</div>}
    </div>
  );
}

export async function EthPanel({ settings }: { settings: Settings }) {
  const mode = ethMode(settings);
  if (mode === "off") return null;
  const today = new Date().toISOString().slice(0, 10);
  const dayStart = Math.floor(Date.now() / DAY) * DAY;
  const [{ data }, open, closed, stats, live] = await Promise.all([
    db().from("eth_day_plans").select("*").eq("mode", mode).eq("day", today).limit(1),
    openPositions(mode, "eth"),
    closedPositions(mode, 5, "eth"),
    ethStats(mode),
    liveData(dayStart),
  ]);
  const plan = (data?.[0] ?? null) as PlanRow | null;
  const openTrade = open[0];
  const waiting = plan?.status === "waiting";
  const hourNow = new Date().getUTCHours();
  const baseClues = (plan?.clues ?? []).filter((c) => c.key !== "btc" && c.key !== "early");
  const shownClues = waiting
    ? [
        { label: "Bitcoin is breaking out too", met: live.btcBrokeOut },
        { label: `Breakout before ${ETH_EARLY_HOUR}:00 UTC`, met: hourNow < ETH_EARLY_HOUR },
        ...baseClues,
      ]
    : (plan?.clues ?? []);
  const score = waiting ? shownClues.filter((c) => c.met).length : (plan?.score ?? null);
  const lev = score != null ? ethLeverage(score) : 0;
  const distance = plan?.trigger && plan?.price ? (plan.trigger / plan.price - 1) * 100 : null;
  const progress =
    plan?.trigger && plan.price && plan.open && plan.trigger > plan.open ? Math.max(0, Math.min(1, (plan.price - plan.open) / (plan.trigger - plan.open))) : null;
  const status = plan ? (STATUS[plan.status] ?? { text: plan.status, tone: "" }) : null;
  const practiceBalance =
    mode === "paper"
      ? (settings.eth_paper_start_balance ?? 100) + stats.pnl + (openTrade && plan?.price ? openTrade.qty * (plan.price - openTrade.entry_price) : 0)
      : null;
  const streak = stats.current > 0 ? `${stats.current}W` : stats.current < 0 ? `${-stats.current}L` : "-";

  return (
    <>
      <section className="card" id="ethereum">
        <div className="card-head">
          <h2>Today · Ethereum</h2>
          <span className={`pill ${mode === "live" ? "live" : ""}`}>{mode === "live" ? "REAL MONEY" : "Practice"}</span>
        </div>
        {status && (
          <div style={{ marginBottom: 8 }}>
            <span className={`chip ${status.tone}`}>{status.text}</span>
          </div>
        )}
        {settings.eth_last_error && <div className="notice">Ethereum trader problem: {settings.eth_last_error}</div>}
        {!plan ? (
          <p className="empty">No Ethereum check yet today. It runs every minute while the bot is on (or press &quot;Check now&quot;).</p>
        ) : (
          <>
            <p className="muted small" style={{ margin: 0 }}>
              {plan.note}
            </p>
            {plan.eligible && plan.trigger ? (
              <div className="target">
                <div className="prices">
                  <div>
                    <div className="muted small">ETH now</div>
                    <div className="big">{eth(plan.price)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="muted small">Buys at</div>
                    <div className="big">{eth(plan.trigger)}</div>
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
            {live.points.length > 1 && (plan.eligible || openTrade) && (
              <>
                <TodayChart
                  points={live.points}
                  dayStart={dayStart}
                  open={plan.open}
                  trigger={plan.trigger}
                  entry={openTrade?.entry_price ?? null}
                  stop={openTrade?.stop_price ?? null}
                  showGap={waiting}
                  coin="Ethereum"
                  decimals={0}
                />
                <p className="explain">
                  {openTrade
                    ? "The bot bought at the green line. If Ethereum falls to the red line it sells straight away; otherwise it sells before midnight UTC."
                    : "The bot buys only if Ethereum climbs to the blue line: today's opening price plus 80% of yesterday's high-to-low range."}
                </p>
              </>
            )}
            {score != null && plan.eligible && (
              <div className="score">
                <div className="n">{score}/4</div>
                <div className="small">
                  {waiting ? "Score if it broke out now" : "Setup score"}
                  <div className="muted">{lev ? `Trades at ${lev}x leverage` : "Below 2 - it would skip this one"}</div>
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
          <div className="label">{mode === "paper" ? "ETH practice" : "ETH share"}</div>
          <div className="value">{mode === "paper" ? money(practiceBalance) : `${((settings.eth_share ?? 0.5) * 100).toFixed(0)}%`}</div>
          <div className={`hint ${stats.pnl >= 0 ? "good" : "bad"}`}>{signedMoney(stats.pnl)} so far</div>
        </div>
        <div className="card stat">
          <div className="label">ETH trades</div>
          <div className="value">{stats.count}</div>
          <div className="hint">{stats.count ? `${Math.round((stats.wins / stats.count) * 100)}% won` : "~1-2 a month"}</div>
        </div>
        <div className="card stat">
          <div className="label">ETH streak</div>
          <div className={`value ${stats.current > 0 ? "good" : stats.current < 0 ? "bad" : ""}`}>{streak}</div>
          <div className="hint">worst run: {stats.longestLoss}L</div>
        </div>
        <div className="card stat">
          <div className="label">ETH leverage</div>
          <div className="value">1–3x</div>
          <div className="hint">by score</div>
        </div>
      </div>

      {(openTrade || closed.length > 0) && (
        <section className="card">
          <div className="card-head">
            <h2>Ethereum trades</h2>
            {closed.length > 0 && (
              <span className="muted small">
                {closed.filter((p) => (p.pnl ?? 0) > 0).length}/{closed.length} won
              </span>
            )}
          </div>
          <div className="list">
            {openTrade && <TradeLine p={openTrade} />}
            {closed.map((p) => (
              <TradeLine key={p.id} p={p} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
