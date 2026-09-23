import { STRATEGIES, adaptiveWeights, type Analysis } from "./analysis";
import type { Decision, Regime, RiskProfile, StrategyName, TradeParams } from "./types";

// Fear & Greed (0-100): buying into extreme greed needs a stronger signal.
export function sentimentAdjustment(fng: number | null): number {
  if (fng == null) return 0;
  if (fng >= 85) return 0.2;
  if (fng >= 75) return 0.1;
  if (fng <= 20) return -0.05;
  return 0;
}

// The single rule that turns signals into buy / sell / wait. Shared by the live
// bot, the backtester and the tuner so they can never disagree.
export function evaluate(args: {
  regime: Regime;
  combined: number;
  confirmations: number;
  anyWeight: boolean;
  threshold: number;
  inPosition: boolean;
  profile: RiskProfile;
}): { action: Decision["action"]; reason: string } {
  const { regime, combined, confirmations, anyWeight, threshold, inPosition, profile } = args;
  if (inPosition) {
    if (combined <= profile.exitThreshold) return { action: "exit", reason: `Signals turned negative (${combined.toFixed(2)})` };
    return { action: "hold", reason: "Holding; stop-loss protects the trade" };
  }
  if (regime === "chaotic") return { action: "hold", reason: "Market too volatile - sitting out" };
  if (regime === "downtrend") return { action: "hold", reason: "Downtrend - staying in cash" };
  if (!anyWeight) return { action: "hold", reason: "No strategy has been working recently" };
  if (combined < threshold) return { action: "hold", reason: `Signal ${combined.toFixed(2)} below ${threshold.toFixed(2)}` };
  if (confirmations < profile.minConfirmations) return { action: "hold", reason: `Only ${confirmations} strategy agrees` };
  return { action: "enter", reason: `Buy signal ${combined.toFixed(2)} in ${regime}` };
}

export function decide(
  a: Analysis,
  i: number,
  profile: RiskProfile,
  opts: { inPosition: boolean; fng: number | null; params?: TradeParams },
): Decision {
  const regime = a.regime[i];
  const weights = adaptiveWeights(a, i);
  const scores = {} as Record<StrategyName, number>;
  let combined = 0;
  let confirmations = 0;
  for (const s of STRATEGIES) {
    scores[s] = a.scores[s][i];
    combined += weights[s] * scores[s];
    if (scores[s] > 0.2) confirmations++;
  }
  const params = opts.params ?? profile.defaults;
  const threshold = params.entryThreshold + sentimentAdjustment(opts.fng);
  const anyWeight = STRATEGIES.some((s) => weights[s] > 0);
  const { action, reason } = evaluate({ regime, combined, confirmations, anyWeight, threshold, inPosition: opts.inPosition, profile });
  return { regime, scores, weights, combined, confirmations, threshold, action, reason, price: a.candles[i].c, atr: a.atr[i] };
}
