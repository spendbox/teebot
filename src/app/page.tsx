import { aiAvailable } from "@/lib/ai";
import { MIN_CONFIDENCE } from "@/lib/ai-gate";
import { closedPositions, db, getSettings, openPositions } from "@/lib/db";
import { toggleBot } from "./actions";
import { BreakoutPanel } from "./breakout-panel";
import { LiveBar, RunNow, SubmitButton } from "./live";
import { EquityChart, Message, Nav, REGIME_TEXT, money, price } from "./ui";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface SignalRow {
  symbol: string;
  updated_at: string;
  regime: string;
  action: string;
  reason: string;
  price: number;
  combined: number;
  threshold: number;
  weights: Record<string, number>;
}

interface ReviewRow {
  id: number;
  created_at: string;
  symbol: string;
  price: number;
  approve: boolean | null;
  confidence: number | null;
  reasoning: string | null;
  key_risks: string[] | null;
  cost_usd: number | null;
  error: string | null;
  price_24h: number | null;
}

const STRATEGY_TEXT: Record<string, string> = {
  trend: "Trend",
  meanReversion: "Range",
  breakout: "Breakout",
};

const pctText = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const s = await getSettings();
  const breakout = (s.strategy ?? "breakout") === "breakout";
  const strat = breakout ? "breakout" : "classic";
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [open, closed, signalsRes, snapsRes, eventsRes, firstSnapRes, reviewsRes, monthCostRes] = await Promise.all([
    openPositions(s.mode, strat),
    closedPositions(s.mode, 20, strat),
    breakout ? db().from("day_plans").select("price").eq("mode", s.mode).order("day", { ascending: false }).limit(1) : db().from("signals").select("*").in("symbol", s.symbols),
    db().from("equity_snapshots").select("created_at,equity").eq("mode", s.mode).gte("created_at", since).order("created_at").limit(5000),
    db().from("events").select("*").order("created_at", { ascending: false }).limit(15),
    db().from("equity_snapshots").select("equity").eq("mode", s.mode).order("created_at").limit(1),
    db().from("ai_reviews").select("*").order("created_at", { ascending: false }).limit(50),
    db().from("ai_reviews").select("cost_usd").gte("created_at", monthStart),
  ]);
  const breakoutPrice = breakout ? ((signalsRes.data?.[0] as { price?: number } | undefined)?.price ?? null) : null;
  const signals = (breakout ? [] : ((signalsRes.data ?? []) as SignalRow[])).sort((a, b) => s.symbols.indexOf(a.symbol) - s.symbols.indexOf(b.symbol));
  const snaps = (snapsRes.data ?? []).map((r) => ({ t: Date.parse(r.created_at), equity: r.equity as number }));
  const events = eventsRes.data ?? [];
  const reviews = (reviewsRes.data ?? []) as ReviewRow[];
  const aiMonthCost = (monthCostRes.data ?? []).reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);

  const equity = snaps.length ? snaps[snaps.length - 1].equity : s.mode === "paper" ? s.paper_start_balance : null;
  const startEquity = s.mode === "paper" ? s.paper_start_balance : (firstSnapRes.data?.[0]?.equity ?? null);
  const totalPnl = equity != null && startEquity != null ? equity - startEquity : null;
  const todayPnl = equity != null && s.day_start_equity != null ? equity - s.day_start_equity : null;
  const wins = closed.filter((p) => (p.pnl ?? 0) > 0).length;
  const priceOf = (sym: string) => (breakout ? breakoutPrice ?? undefined : signals.find((x) => x.symbol === sym)?.price);
  const cls = (n: number | null) => (n == null ? "" : n >= 0 ? "good" : "bad");

  // Was the AI right? Compare the price 24h after each verdict.
  const judged = reviews.filter((r) => r.price_24h != null && r.approve != null);
  const avgMove = (rows: ReviewRow[]) => (rows.length ? rows.reduce((sum, r) => sum + (r.price_24h! / r.price - 1), 0) / rows.length : null);
  const rejectedMove = avgMove(judged.filter((r) => !r.approve || (r.confidence ?? 0) < MIN_CONFIDENCE));
  const approvedMove = avgMove(judged.filter((r) => r.approve && (r.confidence ?? 0) >= MIN_CONFIDENCE));
  const aiReady = aiAvailable() && s.ai_enabled;

  return (
    <>
      <Nav />
      <main>
        <Message msg={msg} />
        {s.kill_switch && (
          <div className="notice">
            <strong>Safety shutdown:</strong> {s.kill_reason}. The bot sold everything and stopped. Review in <a href="/settings">Settings</a>.
          </div>
        )}
        {s.last_error && <div className="notice">Last check had a problem: {s.last_error}</div>}

        <section className="card hero">
          <div className="hero-top">
            <LiveBar lastTickAt={s.last_tick_at} enabled={s.enabled} />
            <div className="pills">
              <span className={`pill ${s.mode === "live" ? "live" : ""}`}>{s.mode === "live" ? "REAL MONEY" : "PRACTICE"}</span>
              {breakout ? (
                <span className="pill">Breakout · {s.breakout_profile === "safer" ? "Safer 2-3x" : "Balanced 2-5x"}</span>
              ) : (
                <>
                  <span className="pill">{s.risk_profile === "balanced" ? "Balanced" : "Cautious"}</span>
                  <span className={`pill ${aiReady ? "ai" : ""}`}>{aiReady ? "AI reviewer on" : "AI reviewer off"}</span>
                </>
              )}
            </div>
          </div>
          <div className="hero-main">
            <div>
              <div className="label">Balance</div>
              <div className="big">{money(equity)}</div>
              <div className="sub">
                <span className={cls(totalPnl)}>{money(totalPnl)} total</span>
                <span className={cls(todayPnl)}>{money(todayPnl)} today</span>
                <span className="muted">{closed.length ? `${wins}/${closed.length} recent trades won` : "no finished trades yet"}</span>
              </div>
            </div>
            <div className="hero-actions">
              <RunNow />
              <form action={toggleBot}>
                <SubmitButton className={s.enabled ? "danger" : "primary"} pendingText={s.enabled ? "Switching off…" : "Switching on…"}>
                  {s.enabled ? "Switch bot off" : "Switch bot on"}
                </SubmitButton>
              </form>
            </div>
          </div>
          <EquityChart points={snaps} />
        </section>

        {breakout && <BreakoutPanel settings={s} equity={equity} />}

        {!breakout && <h2 className="section">What the bot sees</h2>}
        {!breakout && <div className="coins">
          {signals.map((x) => {
            const pos = open.find((p) => p.symbol === x.symbol);
            const fill = Math.max(0, Math.min(1, x.combined));
            const trusted = Object.entries(x.weights).filter(([, w]) => w > 0);
            return (
              <div key={x.symbol} className="card coin-card">
                <div className="coin-head">
                  <span className="coin">{x.symbol.replace("USDT", "")}</span>
                  <span className="price">{price(x.price)}</span>
                </div>
                <span className={`chip ${x.regime}`}>{REGIME_TEXT[x.regime] ?? x.regime}</span>
                {pos && <span className="chip holding">Holding</span>}
                <div className="meter" title={`Signal ${x.combined.toFixed(2)}, needs ${x.threshold.toFixed(2)}`}>
                  <span className="fill" style={{ width: `${fill * 100}%` }} />
                  <span className="mark" style={{ left: `${Math.min(1, x.threshold) * 100}%` }} />
                </div>
                <div className="muted small">
                  Buy signal {x.combined.toFixed(2)} · needs {x.threshold.toFixed(2)}
                </div>
                <p className="reason">{x.reason}</p>
                <div className="muted small">
                  Trusting: {trusted.length ? trusted.map(([k, w]) => `${STRATEGY_TEXT[k] ?? k} ${(w * 100).toFixed(0)}%`).join(" · ") : "no strategy yet"}
                </div>
              </div>
            );
          })}
          {signals.length === 0 && <div className="card muted">No data yet - press &quot;Check market now&quot;.</div>}
        </div>}

        {!breakout && <section className="card">
          <div className="row-between">
            <h2>AI reviewer (Opus 5.5)</h2>
            <span className="muted small">This month: ${aiMonthCost.toFixed(2)} · today {s.ai_calls_date === new Date().toISOString().slice(0, 10) ? s.ai_calls_today : 0}/{s.ai_daily_limit} reviews</span>
          </div>
          <p className="muted small">
            The AI is only asked when the rules already want to buy. It must be at least {MIN_CONFIDENCE}% confident, and it can only cancel a trade, tighten the stop-loss or make the trade smaller.
          </p>
          {!aiAvailable() && <div className="notice">Add ANTHROPIC_API_KEY in Vercel to switch the AI reviewer on (see the setup guide).</div>}
          {judged.length > 0 && (
            <div className="grid small-grid">
              <div className="stat">
                <div className="label">After AI said NO, price moved</div>
                <div className={`value ${rejectedMove == null ? "" : rejectedMove <= 0 ? "good" : "bad"}`}>{rejectedMove == null ? "-" : pctText(rejectedMove)}</div>
                <div className="muted small">average over the next 24h (negative = good call)</div>
              </div>
              <div className="stat">
                <div className="label">After AI said YES, price moved</div>
                <div className={`value ${cls(approvedMove)}`}>{approvedMove == null ? "-" : pctText(approvedMove)}</div>
                <div className="muted small">average over the next 24h</div>
              </div>
            </div>
          )}
          <div className="reviews">
            {reviews.slice(0, 6).map((r) => (
              <div key={r.id} className="review">
                <div className="row-between">
                  <span>
                    <span className="coin">{r.symbol.replace("USDT", "")}</span>{" "}
                    {r.error ? (
                      <span className="chip">Unavailable</span>
                    ) : r.approve && (r.confidence ?? 0) >= MIN_CONFIDENCE ? (
                      <span className="chip uptrend">Approved {r.confidence?.toFixed(0)}%</span>
                    ) : (
                      <span className="chip downtrend">Rejected {r.confidence?.toFixed(0)}%</span>
                    )}
                  </span>
                  <span className="muted small">
                    {new Date(r.created_at).toLocaleString()} at {price(r.price)}
                    {r.price_24h != null && ` · 24h later ${pctText(r.price_24h / r.price - 1)}`}
                  </span>
                </div>
                <p>{r.error ?? r.reasoning}</p>
                {r.key_risks && r.key_risks.length > 0 && <p className="muted small">Risks: {r.key_risks.join(" · ")}</p>}
              </div>
            ))}
            {reviews.length === 0 && (
              <p className="muted">No reviews yet. In a cautious setup, buy signals are rare - this is expected.</p>
            )}
          </div>
        </section>}

        <section className="card">
          <h2>Open trades</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Size</th>
                  <th>Bought at</th>
                  <th>Now</th>
                  <th>Stop-loss</th>
                  <th>Profit / loss</th>
                </tr>
              </thead>
              <tbody>
                {open.map((p) => {
                  const now = priceOf(p.symbol);
                  const pnl = now != null ? p.qty * now - p.cost : null;
                  return (
                    <tr key={p.id}>
                      <td>
                        {p.symbol.replace("USDT", "")}
                        {p.leverage ? ` ${p.leverage}x` : ""}
                      </td>
                      <td>{money(p.cost)}</td>
                      <td>{price(p.entry_price)}</td>
                      <td>{price(now)}</td>
                      <td>{price(p.stop_price)}</td>
                      <td className={cls(pnl)}>{money(pnl)}</td>
                    </tr>
                  );
                })}
                {open.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No open trades - your money is safe in USDT.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h2>Recent trades</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Closed</th>
                  <th>Coin</th>
                  <th>Bought</th>
                  <th>Sold</th>
                  <th>Result</th>
                  <th>Why sold</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((p) => (
                  <tr key={p.id}>
                    <td>{p.closed_at ? new Date(p.closed_at).toLocaleString() : "-"}</td>
                    <td>{p.symbol.replace("USDT", "")}</td>
                    <td>{price(p.entry_price)}</td>
                    <td>{price(p.exit_price)}</td>
                    <td className={cls(p.pnl)}>{money(p.pnl)}</td>
                    <td>{p.exit_reason}</td>
                  </tr>
                ))}
                {closed.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No finished trades yet. A cautious bot can wait days for a good setup - that is normal.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <h2>Activity</h2>
          <ul className="activity">
            {events.map((e) => (
              <li key={e.id} className={e.level}>
                <span className="muted small">{new Date(e.created_at).toLocaleString()}</span>
                <span>{e.message}</span>
              </li>
            ))}
            {events.length === 0 && <li className="muted">Nothing yet.</li>}
          </ul>
        </section>
      </main>
    </>
  );
}
