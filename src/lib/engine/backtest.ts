import { WARMUP, analyze } from "./analysis";
import { decide } from "./decide";
import { initialStop, positionSize, updateStop } from "./risk";
import type { Candle, RiskProfile } from "./types";

export const FEE = 0.001; // Bybit spot taker fee, per side
export const SLIPPAGE = 0.0005;

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  pnl: number;
  reason: string;
}

export interface BacktestResult {
  startBalance: number;
  endBalance: number;
  returnPct: number;
  buyHoldPct: number;
  maxDrawdownPct: number;
  trades: BacktestTrade[];
  winRate: number;
  equityCurve: { t: number; equity: number }[];
}

// Simulates one coin, candle by candle, using exactly the same decision and
// risk code as the live bot. Decisions only ever see candles up to "now".
export function backtest(
  candles: Candle[],
  profile: RiskProfile,
  opts: { startBalance?: number; minOrderUsd?: number; fngByDay?: Map<string, number> } = {},
): BacktestResult {
  const startBalance = opts.startBalance ?? 20;
  const minOrderUsd = opts.minOrderUsd ?? 5;
  const a = analyze(candles);
  let cash = startBalance;
  let pos: { qty: number; entry: number; stop: number; highest: number; time: number; cost: number } | null = null;
  let peak = startBalance;
  let maxDd = 0;
  let cooldownUntil = 0;
  const trades: BacktestTrade[] = [];
  const curve: { t: number; equity: number }[] = [];

  const close = (i: number, price: number, reason: string) => {
    if (!pos) return;
    const fill = price * (1 - SLIPPAGE);
    const proceeds = pos.qty * fill * (1 - FEE);
    cash += proceeds;
    trades.push({ entryTime: pos.time, exitTime: candles[i].t, entry: pos.entry, exit: fill, pnl: proceeds - pos.cost, reason });
    pos = null;
    cooldownUntil = candles[i].t + profile.cooldownHours * 3600_000;
  };

  for (let i = WARMUP; i < candles.length; i++) {
    const k = candles[i];

    if (pos) {
      // Stop hit during this candle (fill at the stop, or the open if it gapped below).
      if (k.l <= pos.stop) {
        close(i, Math.min(pos.stop, k.o), "stop");
      } else {
        pos.highest = Math.max(pos.highest, k.h);
        pos.stop = updateStop({ entry: pos.entry, stop: pos.stop, highest: pos.highest, atr: a.atr[i], profile });
      }
    }

    const day = new Date(k.t).toISOString().slice(0, 10);
    const fng = opts.fngByDay?.get(day) ?? null;
    const d = decide(a, i, profile, { inPosition: pos !== null, fng });

    if (pos && d.action === "exit") {
      close(i, k.c, "signal");
    } else if (!pos && d.action === "enter" && k.t >= cooldownUntil) {
      const entry = k.c * (1 + SLIPPAGE);
      const stop = initialStop(entry, a.atr[i], profile);
      const spend = positionSize({ equity: cash, cash, entry, stop, profile, minOrderUsd });
      if (spend > 0) {
        cash -= spend;
        pos = { qty: (spend * (1 - FEE)) / entry, entry, stop, highest: k.c, time: k.t, cost: spend };
      }
    }

    const equity = cash + (pos ? pos.qty * k.c : 0);
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, (peak - equity) / peak);
    curve.push({ t: k.t, equity });
  }
  if (pos) close(candles.length - 1, candles[candles.length - 1].c, "end of test");

  const first = candles[Math.min(WARMUP, candles.length - 1)]?.c ?? 1;
  const last = candles[candles.length - 1]?.c ?? 1;
  const wins = trades.filter((t) => t.pnl > 0).length;
  const step = Math.max(1, Math.floor(curve.length / 300));
  return {
    startBalance,
    endBalance: cash,
    returnPct: (cash / startBalance - 1) * 100,
    buyHoldPct: (last / first - 1) * 100,
    maxDrawdownPct: maxDd * 100,
    trades,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    equityCurve: curve.filter((_, j) => j % step === 0),
  };
}
