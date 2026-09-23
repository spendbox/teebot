"use client";

import { useActionState } from "react";
import { runBacktest, type BacktestState } from "../actions";
import { EquityChart } from "../chart";

export function BacktestForm() {
  const [state, action, pending] = useActionState<BacktestState, FormData>(runBacktest, null);
  const r = state?.result;
  return (
    <>
      <form action={action} className="row">
        <select name="symbol" defaultValue="BTCUSDT">
          {["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"].map((s) => (
            <option key={s} value={s}>
              {s.replace("USDT", "")}
            </option>
          ))}
        </select>
        <select name="days" defaultValue="180">
          <option value="90">Last 3 months</option>
          <option value="180">Last 6 months</option>
          <option value="365">Last year</option>
          <option value="730">Last 2 years</option>
        </select>
        <span>Start with $</span>
        <input name="balance" type="number" min="5" defaultValue="20" style={{ width: 90 }} />
        <button className="primary" type="submit" disabled={pending}>
          {pending ? "Testing..." : "Run test"}
        </button>
      </form>
      {state?.error && <div className="notice" style={{ marginTop: 16 }}>{state.error}</div>}
      {r && (
        <div style={{ marginTop: 16 }}>
          <div className="grid">
            <div className="stat">
              <div className="label">Bot result</div>
              <div className={`value ${r.returnPct >= 0 ? "good" : "bad"}`}>{r.returnPct.toFixed(1)}%</div>
              <div className="muted">
                ${r.startBalance.toFixed(2)} → ${r.endBalance.toFixed(2)}
              </div>
            </div>
            <div className="stat">
              <div className="label">Just buying and holding</div>
              <div className={`value ${r.buyHoldPct >= 0 ? "good" : "bad"}`}>{r.buyHoldPct.toFixed(1)}%</div>
            </div>
            <div className="stat">
              <div className="label">Worst drop from peak</div>
              <div className="value">{r.maxDrawdownPct.toFixed(1)}%</div>
            </div>
            <div className="stat">
              <div className="label">Trades (wins)</div>
              <div className="value">
                {r.trades.length} ({r.winRate.toFixed(0)}%)
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <EquityChart points={r.equityCurve} />
          </div>
          <p className="muted">
            The bot aims to lose much less than buy-and-hold when prices fall, and it will often make less when prices rise fast. That is the price of being
            cautious.
          </p>
        </div>
      )}
    </>
  );
}
