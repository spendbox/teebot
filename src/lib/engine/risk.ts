import type { RiskProfile, TradeParams } from "./types";

// Just above entry: covers the ~0.2% round-trip fees so a "break-even" exit isn't a loss.
export const BREAKEVEN = 1.003;

export function initialStop(entry: number, atr: number, params: TradeParams): number {
  // Keep the stop between 1% and 8% below entry whatever the ATR says.
  const dist = Math.min(Math.max(params.stopAtr * atr, entry * 0.01), entry * 0.08);
  return entry - dist;
}

export function takeProfitPrice(entry: number, stop: number, params: TradeParams): number {
  return entry + params.takeProfitR * (entry - stop);
}

// Returns the USDT amount to spend, or 0 if the trade should be skipped.
export function positionSize(args: {
  equity: number;
  cash: number;
  entry: number;
  stop: number;
  profile: RiskProfile;
  minOrderUsd: number;
}): number {
  const { equity, cash, entry, stop, profile, minOrderUsd } = args;
  const stopPct = (entry - stop) / entry;
  if (stopPct <= 0 || equity <= 0) return 0;
  const maxRisk = equity * profile.riskPerTrade;
  let notional = maxRisk / stopPct;
  notional = Math.min(notional, equity * profile.maxPositionPct, cash * 0.98);
  if (notional >= minOrderUsd) return notional;
  // Small accounts: allow the exchange minimum if it risks at most 1.5x the normal amount.
  if (minOrderUsd <= cash * 0.98 && minOrderUsd * stopPct <= maxRisk * 1.5) return minOrderUsd;
  return 0;
}

// Ratchet the stop up (never down). Once profit has been taken, the rest of the
// trade is protected at break-even and the stop follows the price up.
export function nextStop(args: { entry: number; stop: number; highest: number; atr: number; params: TradeParams; tpDone: boolean }): number {
  const { entry, stop, highest, atr, params, tpDone } = args;
  if (!tpDone) return stop;
  return Math.max(stop, entry * BREAKEVEN, highest - params.trailAtr * atr);
}

// A trade that hasn't reached its target after maxHoldHours and isn't clearly
// working is closed: money stuck in a flat trade can't be used elsewhere.
export function timeStopHit(args: { hoursOpen: number; price: number; entry: number; initialStop: number; params: TradeParams; tpDone: boolean }): boolean {
  const { hoursOpen, price, entry, initialStop, params, tpDone } = args;
  return !tpDone && hoursOpen >= params.maxHoldHours && price < entry + 0.3 * (entry - initialStop);
}

// Positions too small to split in two exchange-sized orders are closed in full at the target.
export function canSplit(positionValue: number, minOrderUsd: number): boolean {
  return positionValue / 2 >= minOrderUsd * 1.05;
}
