import { STRATEGIES, adaptiveWeights, type Analysis } from "./analysis";
import type { Decision, RiskProfile, StrategyName } from "./types";

// Fear & Greed (0-100): buying into extreme greed needs a stronger signal.
export function sentimentAdjustment(fng: number | null): number {
  if (fng == null) return 0;
  if (fng >= 85) return 0.2;
  if (fng >= 75) return 0.1;
  if (fng <= 20) return -0.05;
  return 0;
}

export function decide(
  a: Analysis,
  i: number,
  profile: RiskProfile,
  opts: { inPosition: boolean; fng: number | null },
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
  const threshold = profile.entryThreshold + sentimentAdjustment(opts.fng);
  const base = { regime, scores, weights, combined, confirmations, threshold, price: a.candles[i].c, atr: a.atr[i] };

  if (opts.inPosition) {
    if (combined <= profile.exitThreshold) {
      return { ...base, action: "exit", reason: `Signals turned negative (${combined.toFixed(2)})` };
    }
    return { ...base, action: "hold", reason: "Holding; stop-loss protects the trade" };
  }

  if (regime === "chaotic") return { ...base, action: "hold", reason: "Market too volatile - sitting out" };
  if (regime === "downtrend") return { ...base, action: "hold", reason: "Downtrend - staying in cash" };
  if (STRATEGIES.every((s) => weights[s] === 0)) {
    return { ...base, action: "hold", reason: "No strategy has been working recently" };
  }
  if (combined < threshold) {
    return { ...base, action: "hold", reason: `Signal ${combined.toFixed(2)} below ${threshold.toFixed(2)}` };
  }
  if (confirmations < profile.minConfirmations) {
    return { ...base, action: "hold", reason: `Only ${confirmations} strategy agrees` };
  }
  return { ...base, action: "enter", reason: `Buy signal ${combined.toFixed(2)} in ${regime}` };
}
