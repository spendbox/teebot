// Crypto Fear & Greed Index from alternative.me (free, no key).

export async function getFearGreed(): Promise<number | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", { cache: "no-store" });
    const json = (await res.json()) as { data: { value: string }[] };
    const v = Number(json.data?.[0]?.value);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

// Daily history keyed by YYYY-MM-DD, for backtests.
export async function getFearGreedHistory(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=0", { cache: "no-store" });
    const json = (await res.json()) as { data: { value: string; timestamp: string }[] };
    for (const d of json.data ?? []) {
      map.set(new Date(Number(d.timestamp) * 1000).toISOString().slice(0, 10), Number(d.value));
    }
  } catch {
    // Backtest simply runs without sentiment.
  }
  return map;
}
