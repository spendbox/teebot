// Early warning: spots a strategy that has stopped working, long before the
// 50% safety shutdown. From 20,000 simulated runs of the 2021-2026 trades, a
// working bot almost never falls this far this fast (1-2% of runs), while a bot
// whose edge has gone does so several times more often.

export const WARNING_RULES = [
  { untilMonths: 2, dropPct: 15 },
  { untilMonths: 4, dropPct: 20 },
  { untilMonths: Infinity, dropPct: 30 },
] as const;

const MONTH = 30 * 86_400_000;

export type WarningAction = "pause" | "alert";

export interface WarningCheck {
  months: number; // since the start of this run
  dropPct: number; // how far the balance is below its starting balance (0 if above)
  limitPct: number; // the drop that triggers the warning right now
  triggered: boolean;
  limitChangesAt: number | null; // when the limit next loosens (ms), if ever
}

export function warningLimit(months: number): { limitPct: number; untilMonths: number } {
  const rule = WARNING_RULES.find((r) => months < r.untilMonths) ?? WARNING_RULES[WARNING_RULES.length - 1];
  return { limitPct: rule.dropPct, untilMonths: rule.untilMonths };
}

export function checkWarning(startEquity: number, equity: number, startAt: number, now: number): WarningCheck {
  const months = Math.max(0, (now - startAt) / MONTH);
  const { limitPct, untilMonths } = warningLimit(months);
  const dropPct = startEquity > 0 ? Math.max(0, (1 - equity / startEquity) * 100) : 0;
  return {
    months,
    dropPct,
    limitPct,
    triggered: dropPct >= limitPct - 1e-9,
    limitChangesAt: Number.isFinite(untilMonths) ? startAt + untilMonths * MONTH : null,
  };
}
