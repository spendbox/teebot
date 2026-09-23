"use client";

import { useActionState } from "react";
import { runBreakoutBacktest, type BreakoutBacktestState } from "../actions";
import { EquityChart } from "../chart";

const pct = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;

export function BreakoutBacktestForm() {
  const [state, action, pending] = useActionState<BreakoutBacktestState, FormData>(runBreakoutBacktest, null);
  const r = state?.result;
  return (
    <>
      <form action={action} className="row">
        <select name="days" defaultValue="730">
          <option value="365">Last year</option>
          <option value="730">Last 2 years</option>
          <option value="1095">Last 3 years</option>
          <option value="1800">Last 5 years</option>
        </select>
        <select name="profile" defaultValue="balanced">
          <option value="balanced">Balanced (2x / 4x / 5x)</option>
          <option value="safer">Safer (2x / 3x)</option>
        </select>
        <span>Start with $</span>
        <input name="balance" type="number" min="10" defaultValue="50" style={{ width: 90 }} />
        <button className="primary" type="submit" disabled={pending}>
          {pending ? (
            <>
              <span className="spinner" aria-hidden /> Downloading prices and testing…
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
      {r && (
        <div style={{ marginTop: 16 }}>
          <div className="grid">
            <div className="stat">
              <div className="label">Result</div>
              <div className={`value ${r.endBalance >= r.startBalance ? "good" : "bad"}`}>
                ${r.startBalance.toFixed(0)} → ${r.endBalance.toFixed(0)}
              </div>
              <div className="muted">{pct(r.cagrPct)} per year on average</div>
            </div>
            <div className="stat">
              <div className="label">Trades per year</div>
              <div className="value">{r.tradesPerYear.toFixed(0)}</div>
              <div className="muted">{r.winRatePct.toFixed(0)}% won</div>
            </div>
            <div className="stat">
              <div className="label">Longest losing streak</div>
              <div className="value">{r.longestLosingStreak} in a row</div>
            </div>
            <div className="stat">
              <div className="label">Worst dip / worst month</div>
              <div className="value">
                −{r.maxDrawdownPct.toFixed(0)}% / {r.worstMonthPct.toFixed(0)}%
              </div>
            </div>
            <div className="stat">
              <div className="label">Just holding Bitcoin</div>
              <div className={`value ${r.buyHoldPct >= 0 ? "good" : "bad"}`}>{pct(r.buyHoldPct)}</div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <EquityChart points={r.equityCurve} />
          </div>
          <h3>Year by year ({r.profitableYears} profitable)</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Result</th>
                  <th>Trades</th>
                </tr>
              </thead>
              <tbody>
                {r.yearly.map((y) => (
                  <tr key={y.year}>
                    <td>{y.year}</td>
                    <td className={y.returnPct >= 0 ? "good" : "bad"}>{pct(y.returnPct)}</td>
                    <td>{y.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Most recent trades</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Score</th>
                  <th>Leverage</th>
                  <th>Why it closed</th>
                  <th>Account change</th>
                </tr>
              </thead>
              <tbody>
                {r.trades.map((t) => (
                  <tr key={t.day}>
                    <td>{new Date(t.day).toISOString().slice(0, 10)}</td>
                    <td>{t.score}/7</td>
                    <td>{t.leverage}x</td>
                    <td>{t.reason}</td>
                    <td className={t.ret >= 0 ? "good" : "bad"}>{pct(t.ret * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Uses Bybit&apos;s own Bitcoin futures prices, with fees, slippage and funding, and skips trades below Bybit&apos;s minimum order. Past
            results don&apos;t guarantee future profit.
          </p>
        </div>
      )}
    </>
  );
}
