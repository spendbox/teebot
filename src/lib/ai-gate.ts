import { aiAvailable, reviewTrade, type AiVerdict, type ReviewInput } from "./ai";
import { getKlines } from "./bybit";
import { db, updateSettings, type Settings } from "./db";

export const MIN_CONFIDENCE = 65;

export type GateResult =
  | { status: "skipped-ai-off" }
  | { status: "approved"; verdict: AiVerdict }
  | { status: "rejected"; verdict: AiVerdict; fresh: boolean }
  | { status: "unavailable"; reason: string; fresh: boolean };

// Asks Opus 5.5 about a buy the rules already want to make. At most one review
// per coin per hourly candle, and a daily cap, keep the cost predictable.
export async function aiGate(
  settings: Settings,
  input: Omit<ReviewInput, "daily"> & { candleTime: number },
): Promise<GateResult> {
  if (!settings.ai_enabled || !aiAvailable()) return { status: "skipped-ai-off" };

  const { data: cached } = await db()
    .from("ai_reviews")
    .select("*")
    .eq("symbol", input.symbol)
    .eq("candle_time", input.candleTime)
    .eq("mode", settings.mode)
    .limit(1);
  const row = cached?.[0];
  if (row) {
    if (row.error) return { status: "unavailable", reason: row.error, fresh: false };
    const verdict = rowToVerdict(row);
    return verdict.approve && verdict.confidence >= MIN_CONFIDENCE
      ? { status: "approved", verdict }
      : { status: "rejected", verdict, fresh: false };
  }

  const today = new Date().toISOString().slice(0, 10);
  const callsToday = settings.ai_calls_date === today ? settings.ai_calls_today : 0;
  if (callsToday >= settings.ai_daily_limit) {
    return { status: "unavailable", reason: `AI daily limit (${settings.ai_daily_limit}) reached`, fresh: false };
  }
  await updateSettings({ ai_calls_date: today, ai_calls_today: callsToday + 1 });
  settings.ai_calls_date = today;
  settings.ai_calls_today = callsToday + 1;

  const base = { symbol: input.symbol, candle_time: input.candleTime, mode: settings.mode, price: input.proposal.entry };
  try {
    const daily = await getKlines(input.symbol, "D", 45);
    const { verdict, costUsd } = await reviewTrade({ ...input, daily });
    await db().from("ai_reviews").insert({
      ...base,
      approve: verdict.approve,
      confidence: verdict.confidence,
      reasoning: verdict.reasoning,
      key_risks: verdict.key_risks,
      stop_price: verdict.stop_price,
      size_multiplier: verdict.size_multiplier,
      cost_usd: costUsd,
    });
    return verdict.approve && verdict.confidence >= MIN_CONFIDENCE
      ? { status: "approved", verdict }
      : { status: "rejected", verdict, fresh: true };
  } catch (e) {
    const reason = (e as Error).message;
    await db().from("ai_reviews").insert({ ...base, error: reason });
    return { status: "unavailable", reason, fresh: true };
  }
}

function rowToVerdict(row: Record<string, unknown>): AiVerdict {
  return {
    approve: !!row.approve,
    confidence: Number(row.confidence ?? 0),
    stop_price: Number(row.stop_price),
    size_multiplier: Number(row.size_multiplier ?? 1),
    reasoning: String(row.reasoning ?? ""),
    key_risks: (row.key_risks as string[]) ?? [],
  };
}

// Fill in where the price went 24h after each review, so you can see whether
// the AI's calls were right.
export async function recordReviewOutcomes(prices: Record<string, number>): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await db()
    .from("ai_reviews")
    .select("id,symbol")
    .is("price_24h", null)
    .is("error", null)
    .lt("created_at", cutoff)
    .limit(20);
  for (const r of data ?? []) {
    if (prices[r.symbol] != null) await db().from("ai_reviews").update({ price_24h: prices[r.symbol] }).eq("id", r.id);
  }
}
