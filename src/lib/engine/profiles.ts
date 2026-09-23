import type { RiskProfile } from "./types";

export const PROFILES: Record<RiskProfile["name"], RiskProfile> = {
  cautious: {
    name: "cautious",
    riskPerTrade: 0.01,
    maxPositionPct: 0.35,
    maxOpenPositions: 2,
    dailyLossLimit: 0.03,
    maxDrawdown: 0.15,
    exitThreshold: -0.2,
    minConfirmations: 2,
    cooldownHours: 2,
    defaults: { entryThreshold: 0.4, stopAtr: 2, takeProfitR: 1, trailAtr: 2.5, maxHoldHours: 48 },
  },
  balanced: {
    name: "balanced",
    riskPerTrade: 0.015,
    maxPositionPct: 0.5,
    maxOpenPositions: 3,
    dailyLossLimit: 0.05,
    maxDrawdown: 0.25,
    exitThreshold: -0.25,
    minConfirmations: 1,
    cooldownHours: 1,
    defaults: { entryThreshold: 0.35, stopAtr: 2, takeProfitR: 1, trailAtr: 3, maxHoldHours: 72 },
  },
};

export function getProfile(name: string | null | undefined): RiskProfile {
  return PROFILES[name as RiskProfile["name"]] ?? PROFILES.cautious;
}
