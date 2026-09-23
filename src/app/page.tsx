import { closedPositions, db, getSettings, openPositions } from "@/lib/db";
import { runNow, toggleBot } from "./actions";
import { EquityChart, Message, Nav, REGIME_TEXT, money, price } from "./ui";

export const dynamic = "force-dynamic";

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

const STRATEGY_TEXT: Record<string, string> = {
  trend: "Trend follower",
  meanReversion: "Range trader",
  breakout: "Breakout catcher",
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const s = await getSettings();
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const [open, closed, signalsRes, snapsRes, eventsRes, firstSnapRes] = await Promise.all([
    openPositions(s.mode),
    closedPositions(s.mode, 20),
    db().from("signals").select("*").in("symbol", s.symbols),
    db().from("equity_snapshots").select("created_at,equity").eq("mode", s.mode).gte("created_at", since).order("created_at").limit(5000),
    db().from("events").select("*").order("created_at", { ascending: false }).limit(15),
    db().from("equity_snapshots").select("equity").eq("mode", s.mode).order("created_at").limit(1),
  ]);
  const signals = (signalsRes.data ?? []) as SignalRow[];
  const snaps = (snapsRes.data ?? []).map((r) => ({ t: Date.parse(r.created_at), equity: r.equity as number }));
  const events = eventsRes.data ?? [];
  const equity = snaps.length ? snaps[snaps.length - 1].equity : s.mode === "paper" ? s.paper_start_balance : null;
  const startEquity = s.mode === "paper" ? s.paper_start_balance : (firstSnapRes.data?.[0]?.equity ?? null);
  const totalPnl = equity != null && startEquity != null ? equity - startEquity : null;
  const todayPnl = equity != null && s.day_start_equity != null ? equity - s.day_start_equity : null;
  const wins = closed.filter((p) => (p.pnl ?? 0) > 0).length;
  const priceOf = (sym: string) => signals.find((x) => x.symbol === sym)?.price;
  const cls = (n: number | null) => (n == null ? "" : n >= 0 ? "good" : "bad");

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
        {s.last_error && <div className="notice">Last run had a problem: {s.last_error}</div>}

        <div className="card">
          <div className="row" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span className={`badge ${s.enabled ? "on" : ""}`}>{s.enabled ? "ON" : "OFF"}</span>
            <span className={`badge ${s.mode === "live" ? "live" : ""}`}>{s.mode === "live" ? "REAL MONEY" : "PRACTICE MONEY"}</span>
            <span className="muted">
              Risk: {s.risk_profile} · Last check: {s.last_tick_at ? new Date(s.last_tick_at).toLocaleString() : "never"}
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <form action={runNow}>
                <button type="submit">Run now</button>
              </form>
              <form action={toggleBot}>
                <button type="submit" className={s.enabled ? "danger" : "primary"}>
                  {s.enabled ? "Switch off" : "Switch on"}
                </button>
              </form>
            </span>
          </div>
        </div>

        <div className="grid">
          <div className="card stat">
            <div className="label">Balance</div>
            <div className="value">{money(equity)}</div>
          </div>
          <div className="card stat">
            <div className="label">Total profit / loss</div>
            <div className={`value ${cls(totalPnl)}`}>{money(totalPnl)}</div>
          </div>
          <div className="card stat">
            <div className="label">Today</div>
            <div className={`value ${cls(todayPnl)}`}>{money(todayPnl)}</div>
          </div>
          <div className="card stat">
            <div className="label">Recent wins</div>
            <div className="value">{closed.length ? `${wins}/${closed.length}` : "-"}</div>
          </div>
        </div>

        <div className="card">
          <h2>Balance, last 14 days</h2>
          <EquityChart points={snaps} />
        </div>

        <div className="card">
          <h2>What the bot sees right now</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Price</th>
                  <th>Market</th>
                  <th>Buy signal</th>
                  <th>Trusted strategies</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((x) => (
                  <tr key={x.symbol}>
                    <td>{x.symbol.replace("USDT", "")}</td>
                    <td>{price(x.price)}</td>
                    <td>{REGIME_TEXT[x.regime] ?? x.regime}</td>
                    <td style={{ minWidth: 110 }}>
                      <div className="bar" title={`${x.combined.toFixed(2)} (needs ${x.threshold.toFixed(2)})`}>
                        <span style={{ left: 0, width: `${Math.max(0, Math.min(1, x.combined)) * 100}%` }} />
                      </div>
                      <span className="muted">
                        {x.combined.toFixed(2)} / needs {x.threshold.toFixed(2)}
                      </span>
                    </td>
                    <td className="muted">
                      {Object.entries(x.weights)
                        .filter(([, w]) => w > 0)
                        .map(([k, w]) => `${STRATEGY_TEXT[k] ?? k} ${(w * 100).toFixed(0)}%`)
                        .join(", ") || "none yet"}
                    </td>
                    <td>{x.reason}</td>
                  </tr>
                ))}
                {signals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No data yet - press "Run now".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2>Open trades</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Invested</th>
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
                      <td>{p.symbol.replace("USDT", "")}</td>
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
        </div>

        <div className="card">
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
        </div>

        <div className="card">
          <h2>Activity log</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="muted">{new Date(e.created_at).toLocaleString()}</td>
                    <td className={e.level === "error" ? "bad" : ""} style={{ whiteSpace: "normal" }}>
                      {e.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
