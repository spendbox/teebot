import type { RiskProfile } from "./types";

export function initialStop(entry: number, atr: number, profile: RiskProfile): number {
  // Keep the stop between 1% and 8% below entry whatever the ATR says.
  const dist = Math.min(Math.max(profile.stopAtr * atr, entry * 0.01), entry * 0.08);
  return entry - dist;
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

// Ratchet the stop up (never down): first to breakeven, then trailing the high.
export function updateStop(args: {
  entry: number;
  stop: number;
  highest: number;
  atr: number;
  profile: RiskProfile;
}): number {
  const { entry, stop, highest, atr, profile } = args;
  let next = stop;
  if (highest >= entry + profile.breakevenAtr * atr) {
    next = Math.max(next, entry * 1.003, highest - profile.trailAtr * atr);
  }
  return next;
}
