import { runEthBacktest } from "../actions";
import { Nav } from "../ui";
import { BreakoutBacktestForm } from "./breakout-form";
import { BacktestForm } from "./form";

export const maxDuration = 120;

export default function BacktestPage() {
  return (
    <>
      <Nav active="backtest" />
      <main>
        <div className="card">
          <h2>Test the Breakout day-trader on past prices</h2>
          <p className="muted">
            Replays Bitcoin futures prices day by day with exactly the rules the live bot uses: uptrend check, breakout trigger, 7-clue score,
            leverage by score, volume check, 5% emergency stop and closing by the end of the day.
          </p>
          <BreakoutBacktestForm />
        </div>
        <div className="card">
          <h2>Test the Ethereum day-trader</h2>
          <p className="muted">
            Replays Ethereum futures prices with the Ethereum trader&apos;s rules: uptrend check, buy line at open + 0.8 × yesterday&apos;s range,
            4-clue score (Bitcoin breaking out too, early breakout, early in a recovery), 1x–3x by score, a 3–8% stop and closing by the end of the day.
          </p>
          <BreakoutBacktestForm run={runEthBacktest} coin="Ethereum" maxScore={4} showProfile={false} defaultBalance={100} />
        </div>
        <div className="card">
          <h2>Classic strategy (older)</h2>
          <p className="muted">The original hourly strategy. It lost money in long-term tests and is kept for comparison.</p>
          <BacktestForm />
        </div>
      </main>
    </>
  );
}
