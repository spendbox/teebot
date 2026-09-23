import { closedPositions, db, getSettings, openPositions, type Position } from "@/lib/db";
import { toggleBot } from "./actions";
import { BreakoutPanel } from "./breakout-panel";
import { LiveBar, RunNow, SubmitButton } from "./live";
import { EquityChart, Message, Nav, REGIME_TEXT, money, price, signedMoney } from "./ui";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface SignalRow {
  symbol: string;
  regime: string;
  reason: string;
  price: number;
  combined: number;
  threshold: number;
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

function TradeRow({ p, now }: { p: Position; now?: number }) {
  const open = p.status === "open";
  const pnl = open ? (now != null ? p.qty * now - p.cost : null) : p.pnl;
  const coin = p.symbol.replace("USDT", "");
  return (
    <div className="list-row">
      <div className="main">
        <div className="title">
          {coin}
          {p.leverage ? ` · ${p.leverage}x` : ""}
          {p.score != null ? <span className="muted small"> · score {p.score}/7</span> : null}
        </div>
        <div className="sub">
          {open
            ? `Bought ${price(p.entry_price)} · stop ${price(p.stop_price)} · ${when(p.opened_at)}`
            : `${price(p.entry_price)} → ${price(p.exit_price)} · ${p.exit_reason ?? ""} · ${when(p.closed_at)}`}
        </div>
      </div>
      <div className={`right ${pnl == null ? "" : pnl >= 0 ? "good" : "bad"}`}>{signedMoney(pnl)}</div>
    </div>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const s = await getSettings();
  const breakout = (s.strategy ?? "breakout") === "breakout";
  const strat = breakout ? "breakout" : "classic";
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [open, closed, priceRes, snapsRes, eventsRes] = await Promise.all([
    openPositions(s.mode, strat),
    closedPositions(s.mode, 15, strat),
    breakout
      ? db().from("day_plans").select("price").eq("mode", s.mode).order("day", { ascending: false }).limit(1)
      : db().from("signals").select("*").in("symbol", s.symbols),
    db().from("equity_snapshots").select("created_at,equity").eq("mode", s.mode).gte("created_at", since).order("created_at").limit(5000),
    db().from("events").select("*").order("created_at", { ascending: false }).limit(20),
  ]);

  const signals = breakout ? [] : ((priceRes.data ?? []) as SignalRow[]).sort((a, b) => s.symbols.indexOf(a.symbol) - s.symbols.indexOf(b.symbol));
  const btcPrice = breakout ? ((priceRes.data?.[0] as { price?: number } | undefined)?.price ?? undefined) : undefined;
  const priceOf = (sym: string) => (breakout ? btcPrice : signals.find((x) => x.symbol === sym)?.price);
  const snaps = (snapsRes.data ?? []).map((r) => ({ t: Date.parse(r.created_at), equity: r.equity as number }));
  const events = eventsRes.data ?? [];

  const equity = snaps.length ? snaps[snaps.length - 1].equity : s.mode === "paper" ? s.paper_start_balance : null;
  const start = s.mode === "paper" ? s.paper_start_balance : (snaps[0]?.equity ?? null);
  const total = equity != null && start != null ? equity - start : null;
  const totalPct = total != null && start ? (total / start) * 100 : null;
  const today = equity != null && s.day_start_equity != null ? equity - s.day_start_equity : null;
  const tone = (n: number | null) => (n == null ? "" : n >= 0 ? "good" : "bad");

  return (
    <>
      <Nav
        active="dashboard"
        right={<span className={`pill ${s.mode === "live" ? "live" : ""}`}>{s.mode === "live" ? "REAL MONEY" : "Practice"}</span>}
      />
      <main>
        <Message msg={msg} />
        {s.kill_switch && (
          <div className="notice">
            <strong>Safety shutdown:</strong> {s.kill_reason}. The bot closed everything and stopped. See <a href="/settings">Settings</a>.
          </div>
        )}
        {s.last_error && <div className="notice">Last check had a problem: {s.last_error}</div>}

        <div className="stack">
          <section className="card hero">
            <div className="row-between">
              <LiveBar lastTickAt={s.last_tick_at} enabled={s.enabled} />
              <span className="pill">
                {breakout ? `BTC breakout · ${s.breakout_profile === "safer" ? "2–3x" : "2–5x"}` : "Classic strategy"}
              </span>
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="muted small">Balance</div>
              <div className="balance">{money(equity)}</div>
              <div className="deltas">
                <span className={`chip ${tone(total)}`}>
                  {signedMoney(total)}
                  {totalPct != null ? ` (${totalPct >= 0 ? "+" : ""}${totalPct.toFixed(1)}%)` : ""} total
                </span>
                <span className={`chip ${tone(today)}`}>{signedMoney(today)} today</span>
              </div>
            </div>
            <EquityChart points={snaps} />
            <div className="hero-actions">
              <RunNow />
              <form action={toggleBot}>
                <SubmitButton className={s.enabled ? "danger" : "primary"} pendingText={s.enabled ? "Stopping…" : "Starting…"}>
                  {s.enabled ? "Stop bot" : "Start bot"}
                </SubmitButton>
              </form>
            </div>
          </section>

          {breakout && <BreakoutPanel settings={s} equity={equity} />}

          {!breakout && (
            <div className="coins">
              {signals.map((x) => (
                <div key={x.symbol} className="card coin-card">
                  <div className="coin-head">
                    <span className="coin">{x.symbol.replace("USDT", "")}</span>
                    <span className="num">{price(x.price)}</span>
                  </div>
                  <span className={`chip ${x.regime}`}>{REGIME_TEXT[x.regime] ?? x.regime}</span>
                  <div className="meter">
                    <span className="fill" style={{ width: `${Math.max(0, Math.min(1, x.combined)) * 100}%` }} />
                    <span className="mark" style={{ left: `${Math.min(1, x.threshold) * 100}%` }} />
                  </div>
                  <p className="reason small">{x.reason}</p>
                </div>
              ))}
              {signals.length === 0 && <div className="card empty">No data yet - press &quot;Check now&quot;.</div>}
            </div>
          )}

          {open.length > 0 && (
            <section className="card">
              <div className="card-head">
                <h2>Open trade</h2>
                <span className="chip accent">Live</span>
              </div>
              <div className="list">
                {open.map((p) => (
                  <TradeRow key={p.id} p={p} now={priceOf(p.symbol)} />
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-head">
              <h2>Recent trades</h2>
              {closed.length > 0 && (
                <span className="muted small">
                  {closed.filter((p) => (p.pnl ?? 0) > 0).length}/{closed.length} won
                </span>
              )}
            </div>
            <div className="list">
              {closed.map((p) => (
                <TradeRow key={p.id} p={p} />
              ))}
              {closed.length === 0 && (
                <div className="empty">
                  No finished trades yet. {breakout ? "The bot trades about twice a month - most days it just watches." : ""}
                </div>
              )}
            </div>
          </section>

          <details className="card">
            <summary>Activity log</summary>
            <ul className="activity">
              {events.map((e) => (
                <li key={e.id} className={e.level}>
                  <span className="when">{when(e.created_at)}</span>
                  <span className="what">{e.message}</span>
                </li>
              ))}
              {events.length === 0 && <li className="empty">Nothing yet.</li>}
            </ul>
          </details>
        </div>
      </main>
    </>
  );
}
