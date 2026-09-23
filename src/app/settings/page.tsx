import { getSettings } from "@/lib/db";
import { PROFILES } from "@/lib/engine/profiles";
import { clearWarning, connectTelegram, resetEthPractice, resetPaper, saveEthShare, saveWarning, setEthMode, resetPeak, resetSafety, saveSettings, saveStrategy, setMode, testBybit } from "../actions";
import { LogoutButton, Message, Nav } from "../ui";

export const dynamic = "force-dynamic";

const COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const s = await getSettings();
  const p = PROFILES[s.risk_profile as keyof typeof PROFILES] ?? PROFILES.cautious;
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

  return (
    <>
      <Nav active="settings" />
      <main>
        <Message msg={msg} />

        <div className="card">
          <h2>Strategy</h2>
          <form action={saveStrategy}>
            <label className="option">
              <input type="radio" name="strategy" value="breakout" defaultChecked={(s.strategy ?? "breakout") === "breakout"} />
              <span>
                <strong>Breakout day-trader</strong> <span className="chip accent">Recommended</span>
                <span className="muted small" style={{ display: "block" }}>
                  Bitcoin futures, 2x–5x leverage by confidence score, closed by the end of every day
                </span>
              </span>
            </label>
            <label className="option">
              <input type="radio" name="strategy" value="classic" defaultChecked={s.strategy === "classic"} />
              <span>
                <strong>Classic</strong>
                <span className="muted small" style={{ display: "block" }}>
                  The original spot strategy (lost money in long-term tests)
                </span>
              </span>
            </label>
            <p>
              <span className="muted small" style={{ display: "block", marginBottom: 6 }}>
                Breakout leverage
              </span>
              <select name="breakout_profile" defaultValue={s.breakout_profile ?? "balanced"}>
                <option value="balanced">Balanced: score 5 → 2x, 6 → 4x, 7 → 5x</option>
                <option value="safer">Safer: score 5 → 2x, 6–7 → 3x</option>
              </select>
            </p>
            <button className="primary" type="submit">
              Save
            </button>
          </form>
          <p className="muted">
            Breakout tests on 2021–2026 Bitcoin prices (never used to design the rules): Balanced about +38%/year, about 21 trades a year,
            longest losing streak 5, worst dip −37%. Safer: smaller dips, lower profit. Past results don&apos;t guarantee the future.
          </p>
        </div>

        <div className="card">
          <h2>Classic strategy settings</h2>
          <form action={saveSettings}>
            <p>Coins to trade:</p>
            <p>
              {COINS.map((c) => (
                <label key={c} className="check">
                  <input type="checkbox" name="symbols" value={c} defaultChecked={s.symbols.includes(c)} />
                  {c.replace("USDT", "")}
                </label>
              ))}
            </p>
            <p>
              Risk level:{" "}
              <select name="risk_profile" defaultValue={s.risk_profile}>
                <option value="cautious">Cautious (recommended)</option>
                <option value="balanced">Balanced</option>
              </select>
            </p>
            <button className="primary" type="submit">
              Save
            </button>
          </form>
          <p className="muted">
            Current rules: risks at most {pct(p.riskPerTrade)} of your balance per trade, up to {p.maxOpenPositions} trades at once, stops
            for the day after a {pct(p.dailyLossLimit)} loss, and shuts down completely after a {pct(p.maxDrawdown)} fall from the peak.
          </p>
        </div>

        <div className="card">
          <h2>Money mode</h2>
          <p>
            Currently: <strong>{s.mode === "live" ? "REAL MONEY on Bybit" : "Practice money"}</strong>
          </p>
          {s.mode === "paper" ? (
            <form action={setMode} className="row">
              <input type="hidden" name="mode" value="live" />
              <input name="confirm" placeholder="Type LIVE to confirm" />
              <button className="danger" type="submit">
                Switch to real money
              </button>
            </form>
          ) : (
            <form action={setMode}>
              <input type="hidden" name="mode" value="paper" />
              <button type="submit">Switch back to practice</button>
            </form>
          )}
          <p className="muted">Only switch to real money after practice mode has run for a few weeks and you are happy with the results.</p>
          <form action={testBybit}>
            <button type="submit">Test Bybit connection</button>
          </form>
        </div>

        <div className="card" id="ethereum">
          <h2>Ethereum day-trader</h2>
          {!("eth_mode" in s) ? (
            <p className="bad">Not set up yet: run supabase/upgrade-eth.sql in Supabase (SQL Editor → paste → Run). It starts in practice mode.</p>
          ) : (
            <>
              <p>
                Currently:{" "}
                <strong>{s.eth_mode === "live" ? "REAL MONEY on Bybit" : s.eth_mode === "off" ? "Off" : "Practice money"}</strong>
              </p>
              <p className="muted small">
                Buys strong same-day Ethereum breakouts, scored 0–4 (Bitcoin breaking out too, early breakout, early in a recovery), at 1x–3x.
                Stop 3–8% below the buy, always sold by 23:57 UTC. It runs next to the Bitcoin bot and uses the same Start/Stop switch.
              </p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {s.eth_mode !== "paper" && (
                  <form action={setEthMode}>
                    <input type="hidden" name="eth_mode" value="paper" />
                    <button type="submit">Use practice money</button>
                  </form>
                )}
                {s.eth_mode !== "off" && (
                  <form action={setEthMode}>
                    <input type="hidden" name="eth_mode" value="off" />
                    <button type="submit">Switch Ethereum off</button>
                  </form>
                )}
              </div>
              {s.eth_mode !== "live" && (
                <form action={setEthMode} className="row" style={{ marginTop: 12 }}>
                  <input type="hidden" name="eth_mode" value="live" />
                  <input name="confirm" placeholder="Type LIVE to confirm" />
                  <button className="danger" type="submit">
                    Use real money for Ethereum
                  </button>
                </form>
              )}
              <h3>Practice account</h3>
              <form action={resetEthPractice} className="row">
                <span>Start again with $</span>
                <input name="balance" type="number" min="5" step="1" defaultValue={s.eth_paper_start_balance ?? 100} style={{ width: 100 }} />
                <button type="submit">Reset Ethereum practice</button>
              </form>
              <h3>Real money share</h3>
              <form action={saveEthShare} className="row">
                <span>With real money, Ethereum uses</span>
                <select name="share" defaultValue={String(s.eth_share ?? 0.5)}>
                  <option value="0.25">25%</option>
                  <option value="0.5">50%</option>
                  <option value="0.75">75%</option>
                </select>
                <span>of the Bybit balance</span>
                <button type="submit">Save</button>
              </form>
              <p className="muted small">
                When both Bitcoin and Ethereum use real money, Bitcoin gets the rest. Practice first: switch to real money only after a few weeks
                of practice trades you are happy with. Ethereum&apos;s minimum order is 0.01 ETH.
              </p>
            </>
          )}
        </div>

        <div className="card">
          <h2>Practice account</h2>
          <form action={resetPaper} className="row">
            <span>Start again with $</span>
            <input name="balance" type="number" min="5" step="1" defaultValue={s.paper_start_balance} style={{ width: 100 }} />
            <button type="submit">Reset practice account</button>
          </form>
          <p className="muted">This deletes all practice trades.</p>
        </div>

        <div className="card">
          <h2>Telegram alerts</h2>
          <p>{s.telegram_chat_id ? "Connected." : "Not connected."}</p>
          <ol className="muted">
            <li>Create your bot with @BotFather and add its token to Vercel (see the setup guide).</li>
            <li>Open your new bot in Telegram and send it any message, such as &quot;hi&quot;.</li>
            <li>Press the button below.</li>
          </ol>
          <form action={connectTelegram}>
            <button type="submit">Connect Telegram</button>
          </form>
        </div>

        <div className="card" id="early-warning">
          <h2>Early warning</h2>
          {!("run_start_at" in s) ? (
            <p className="bad">Not set up yet: run supabase/upgrade-warning.sql in Supabase (SQL Editor → paste → Run).</p>
          ) : (
            <>
              {s.warning_at ? (
                <p className="bad">
                  <strong>Triggered:</strong> {s.warning_reason}.
                </p>
              ) : (
                <p>
                  Watching since{" "}
                  {s.run_start_at ? new Date(s.run_start_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "the next check"}
                  {s.run_start_equity != null ? ` from a balance of $${s.run_start_equity.toFixed(2)}` : ""}.
                </p>
              )}
              <p className="muted small">
                Warns you if the balance falls 15% in the first 2 months, 20% by month 4, or 30% after that, measured from where this run started.
              </p>
              <form action={saveWarning}>
                <label className="option">
                  <input type="radio" name="warning_action" value="pause" defaultChecked={(s.warning_action ?? "pause") === "pause"} />
                  <span>
                    <strong>Alert me and pause new trades</strong> <span className="chip accent">Recommended</span>
                    <span className="muted small" style={{ display: "block" }}>
                      An open trade still finishes normally. You decide whether to carry on.
                    </span>
                  </span>
                </label>
                <label className="option">
                  <input type="radio" name="warning_action" value="alert" defaultChecked={s.warning_action === "alert"} />
                  <span>
                    <strong>Only alert me</strong>
                    <span className="muted small" style={{ display: "block" }}>
                      Telegram message and a red banner; the bot keeps trading.
                    </span>
                  </span>
                </label>
                <button type="submit">Save</button>
              </form>
              <form action={clearWarning} style={{ marginTop: 12 }}>
                <button className={s.warning_at ? "danger" : ""} type="submit">
                  {s.warning_at ? "I've reviewed it - clear the warning and resume" : "Restart the warning clock from today"}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="card">
          <h2>Safety</h2>
          {s.kill_switch ? (
            <>
              <p className="bad">Safety shutdown is active: {s.kill_reason}</p>
              <form action={resetSafety}>
                <button className="danger" type="submit">
                  I understand - clear the shutdown
                </button>
              </form>
            </>
          ) : (
            <p>No safety shutdown. Peak balance tracked: {s.peak_equity != null ? `$${s.peak_equity.toFixed(2)}` : "not yet"}</p>
          )}
          <form action={resetPeak} style={{ marginTop: 12 }}>
            <button type="submit">I deposited or withdrew - restart balance tracking</button>
          </form>
          <p className="muted">
            Press this after moving money in or out of Bybit, otherwise a withdrawal can look like a trading loss and trigger the shutdown.
          </p>
        </div>
        <div className="card row-between">
          <span className="muted">Signed in to your Teebot dashboard</span>
          <LogoutButton />
        </div>
      </main>
    </>
  );
}
