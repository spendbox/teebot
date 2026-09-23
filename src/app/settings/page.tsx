import { getSettings } from "@/lib/db";
import { PROFILES } from "@/lib/engine/profiles";
import { connectTelegram, resetPaper, resetPeak, resetSafety, saveSettings, setMode, testBybit } from "../actions";
import { Message, Nav } from "../ui";

export const dynamic = "force-dynamic";

const COINS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const s = await getSettings();
  const p = PROFILES[s.risk_profile as keyof typeof PROFILES] ?? PROFILES.cautious;
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

  return (
    <>
      <Nav />
      <main>
        <Message msg={msg} />

        <div className="card">
          <h2>Trading</h2>
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
      </main>
    </>
  );
}
