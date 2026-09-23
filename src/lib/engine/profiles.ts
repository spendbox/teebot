import type { RiskProfile } from "./types";

export const PROFILES: Record<RiskProfile["name"], RiskProfile> = {
  cautious: {
    name: "cautious",
    riskPerTrade: 0.01,
    maxPositionPct: 0.35,
    maxOpenPositions: 2,
    dailyLossLimit: 0.03,
    maxDrawdown: 0.15,
    entryThreshold: 0.45,
    exitThreshold: -0.2,
    minConfirmations: 2,
    stopAtr: 2,
    trailAtr: 2.5,
    breakevenAtr: 1.5,
    cooldownHours: 3,
  },
  balanced: {
    name: "balanced",
    riskPerTrade: 0.015,
    maxPositionPct: 0.5,
    maxOpenPositions: 3,
    dailyLossLimit: 0.05,
    maxDrawdown: 0.25,
    entryThreshold: 0.35,
    exitThreshold: -0.25,
    minConfirmations: 1,
    stopAtr: 2,
    trailAtr: 3,
    breakevenAtr: 1.5,
    cooldownHours: 2,
  },
};

export function getProfile(name: string | null | undefined): RiskProfile {
  return PROFILES[name as RiskProfile["name"]] ?? PROFILES.cautious;
}
