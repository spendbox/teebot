export interface Candle {
  t: number; // open time, ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Regime = "uptrend" | "downtrend" | "range" | "chaotic";

export type StrategyName = "trend" | "meanReversion" | "breakout";

export interface RiskProfile {
  name: "cautious" | "balanced";
  riskPerTrade: number; // fraction of equity lost if the stop is hit
  maxPositionPct: number; // max fraction of equity in one coin
  maxOpenPositions: number;
  dailyLossLimit: number; // fraction; no new entries for the rest of the UTC day
  maxDrawdown: number; // fraction from peak; kill switch
  entryThreshold: number; // combined score needed to buy
  exitThreshold: number; // combined score at which to sell
  minConfirmations: number; // strategies that must independently agree
  stopAtr: number; // initial stop distance in ATRs
  trailAtr: number; // trailing stop distance in ATRs
  breakevenAtr: number; // profit (in ATRs) after which stop moves to entry
  cooldownHours: number; // wait after closing a trade before re-entering
}

export interface Decision {
  regime: Regime;
  scores: Record<StrategyName, number>;
  weights: Record<StrategyName, number>;
  combined: number;
  confirmations: number;
  threshold: number;
  action: "enter" | "exit" | "hold";
  reason: string;
  price: number;
  atr: number;
}
