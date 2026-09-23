export interface Candle {
  t: number; // open time, ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Regime = "uptrend" | "downtrend" | "range" | "chaotic";

export type StrategyName = "trend" | "meanReversion" | "breakout" | "pullback";

export interface RiskProfile {
  name: "cautious" | "balanced";
  riskPerTrade: number; // fraction of equity lost if the stop is hit
  maxPositionPct: number; // max fraction of equity in one coin
  maxOpenPositions: number;
  dailyLossLimit: number; // fraction; no new entries for the rest of the UTC day
  maxDrawdown: number; // fraction from peak; kill switch
  exitThreshold: number; // combined score at which to sell
  minConfirmations: number; // strategies that must independently agree
  cooldownHours: number; // wait after closing a trade before re-entering
  defaults: TradeParams; // used until a coin has been tuned
}

// Settings the bot re-tunes for each coin from its recent history.
export interface TradeParams {
  entryThreshold: number; // combined score needed to buy
  stopAtr: number; // initial stop distance in ATRs
  takeProfitR: number; // take profit when the gain reaches this multiple of the risk
  trailAtr: number; // trailing stop distance in ATRs, after profit is taken
  maxHoldHours: number; // exit a trade that goes nowhere after this long
}

export interface Tuning {
  params: TradeParams;
  active: boolean; // false = nothing worked recently on this coin, so don't trade it
  reason: string;
  stats: { trades: number; winRate: number; returnPct: number; testReturnPct: number; maxDrawdownPct: number };
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
