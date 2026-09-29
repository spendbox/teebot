"use client";

import { useActionState } from "react";
import { runWaveBacktest, type WaveBacktestState } from "../actions";
import type { WaveSummary } from "@/lib/wave/strategy";

const usd = (x: number) => `${x >= 0 ? "+" : "−"}$${Math.abs(x).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pct = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;
const day = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ");

function Money({ s, gross = false }: { s: WaveSummary; gross?: boolean }) {
  const v = gross ? s.grossUsd : s.netUsd;
  return <td className={v >= 0 ? "good" : "bad"}>{usd(v)}</td>;
}

export function WaveBacktestForm() {
  const [state, action, pending] = useActionState<WaveBacktestState, FormData>(runWaveBacktest, null);
  const r = state?.result;
  const first = r?.rows[0];
  return (
    <>
      <form action={action} className="row">
        <select name="days" defaultValue="30">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <button className="primary" type="submit" disabled={pending}>
          {pending ? (
            <>
              <span className="spinner" aria-hidden /> Downloading every minute of prices…
            </>
          ) : (
            "Run test"
          )}
        </button>
      </form>
      {state?.error && (
        <div className="notice" style={{ marginTop: 16 }}>
          {state.error}
        </div>
      )}
      {r && first && (
        <div style={{ marginTop: 16 }}>
          <div className="grid">
            <div className="stat">
              <div className="label">${first.step}+ waves found</div>
              <div className="value">{first.waves.toLocaleString()}</div>
              <div className="muted">average rise ${first.avgWaveUsd.toFixed(0)}</div>
            </div>
            <div className="stat">
              <div className="label">Perfect timing, before fees</div>
              <div className="value good">{usd(first.perfect.grossUsd)}</div>
              <div className="muted">per 1 BTC traded</div>
            </div>
            <div className="stat">
              <div className="label">Perfect timing, after fees</div>
              <div className={`value ${first.perfect.netUsd >= 0 ? "good" : "bad"}`}>{usd(first.perfect.netUsd)}</div>
              <div className="muted">per 1 BTC traded</div>
            </div>
            <div className="stat">
              <div className="label">Real bot (${first.step} rule), after fees</div>
              <div className={`value ${first.live.netUsd >= 0 ? "good" : "bad"}`}>{usd(first.live.netUsd)}</div>
              <div className="muted">$100 → ${Math.max(0, 100 + first.live.compoundPct).toFixed(0)}</div>
            </div>
            <div className="stat">
              <div className="label">Just holding 1 BTC</div>
              <div className={`value ${r.holdUsd >= 0 ? "good" : "bad"}`}>{usd(r.holdUsd)}</div>
              <div className="muted">{pct(r.holdPct)}</div>
            </div>
          </div>

          <h3>Every wave size compared (per 1 BTC, buying only)</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Wave at least</th>
                  <th>Waves</th>
                  <th>Perfect, no fees</th>
                  <th>Perfect, after fees</th>
                  <th>Real bot, no fees</th>
                  <th>Real bot, after fees</th>
                  <th>$100 becomes</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row) => (
                  <tr key={row.step}>
                    <td>${row.step.toLocaleString()}</td>
                    <td>{row.waves.toLocaleString()}</td>
                    <Money s={row.perfect} gross />
                    <Money s={row.perfect} />
                    <Money s={row.live} gross />
                    <Money s={row.live} />
                    <td className={row.live.compoundPct >= 0 ? "good" : "bad"}>${Math.max(0, 100 + row.live.compoundPct).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Also selling short at every top (per 1 BTC)</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Wave at least</th>
                  <th>Perfect, no fees</th>
                  <th>Perfect, after fees</th>
                  <th>Real bot, after fees</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row) => (
                  <tr key={row.step}>
                    <td>${row.step.toLocaleString()}</td>
                    <Money s={row.perfectBoth} gross />
                    <Money s={row.perfectBoth} />
                    <Money s={row.liveBoth} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Latest real-bot trades (${first.step} rule)</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bought (UTC)</th>
                  <th>Buy price</th>
                  <th>Sell price</th>
                  <th>Before fees</th>
                  <th>After fees</th>
                </tr>
              </thead>
              <tbody>
                {r.recent.map((t) => (
                  <tr key={t.entryT}>
                    <td>{day(t.entryT)}</td>
                    <td>${t.entry.toFixed(1)}</td>
                    <td>${t.exit.toFixed(1)}</td>
                    <td className={t.grossUsd >= 0 ? "good" : "bad"}>{usd(t.grossUsd)}</td>
                    <td className={t.netUsd >= 0 ? "good" : "bad"}>{usd(t.netUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            &ldquo;Perfect&rdquo; buys at the exact bottom and sells at the exact top of every wave, which is only possible looking back. The
            real bot can only know a bottom was the bottom after the price has already risen ${first.step} from it, so it buys ${first.step}{" "}
            above each bottom and sells ${first.step} below each top. Fees: {r.feePerSidePct.toFixed(3)}% of the trade each time it buys or
            sells (about ${((r.endPrice * r.feePerSidePct) / 100).toFixed(0)} per 1 BTC). Uses Bybit&apos;s 1-minute Bitcoin futures prices.
          </p>
        </div>
      )}
    </>
  );
}
