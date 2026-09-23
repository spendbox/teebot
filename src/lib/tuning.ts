import { getHistory } from "./bybit";
import { db } from "./db";
import { tune } from "./engine/backtest";
import type { RiskProfile, Tuning } from "./engine/types";

export const RETUNE_HOURS = 12;

export interface StoredTuning extends Tuning {
  symbol: string;
  updated_at: string;
  profile: string;
}

export async function loadTunings(): Promise<Map<string, StoredTuning>> {
  const { data, error } = await db().from("coin_tuning").select("*");
  if (error) throw new Error(`Database: ${error.message}`);
  return new Map((data as StoredTuning[]).map((t) => [t.symbol, t]));
}

// Re-tunes the coins whose settings are missing or oldest, a few per run so a
// single run stays fast. Every coin is refreshed about twice a day.
export async function retuneStale(symbols: string[], profile: RiskProfile, tunings: Map<string, StoredTuning>, max = 2): Promise<string[]> {
  const stale = symbols
    .filter((s) => {
      const t = tunings.get(s);
      return !t || t.profile !== profile.name || Date.now() - Date.parse(t.updated_at) > RETUNE_HOURS * 3600_000;
    })
    .sort((x, y) => Date.parse(tunings.get(x)?.updated_at ?? "1970") - Date.parse(tunings.get(y)?.updated_at ?? "1970"))
    .slice(0, max);

  for (const symbol of stale) {
    const hourStart = Math.floor(Date.now() / 3600_000) * 3600_000;
    const candles = (await getHistory(symbol, 72)).filter((k) => k.t < hourStart);
    const t = tune(candles, profile);
    const row: StoredTuning = { ...t, symbol, profile: profile.name, updated_at: new Date().toISOString() };
    const { error } = await db().from("coin_tuning").upsert(row);
    if (error) throw new Error(`Database: ${error.message}`);
    tunings.set(symbol, row);
  }
  return stale;
}
