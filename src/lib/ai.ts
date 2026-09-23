import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { ema, rsi } from "./engine/indicators";
import type { Analysis } from "./engine/analysis";
import type { Candle, Decision } from "./engine/types";

export const AI_MODEL = "claude-opus-5-5";

const Verdict = z.object({
  approve: z.boolean(),
  confidence: z.number().describe("0-100: how confident you are this trade has a positive expected value after fees"),
  stop_price: z.number().describe("Stop-loss price. Must be at or ABOVE the proposed stop (tighter), never below."),
  size_multiplier: z.number().describe("0.25 to 1.0: fraction of the proposed position size to use"),
  reasoning: z.string().describe("2-4 plain-English sentences a non-trader can understand"),
  key_risks: z.array(z.string()).describe("Up to 3 short risks"),
});
export type AiVerdict = z.infer<typeof Verdict>;

const SYSTEM = `You are the final risk reviewer for a small, cautious, long-only crypto spot trading bot on Bybit.
A rule-based engine has already found a possible BUY. Your job is to decide whether this specific setup is worth taking.

Principles:
- Protecting capital matters more than catching every move. Rejecting a marginal trade is cheap; taking a bad one is not.
- Approve only when trend, momentum, volatility and market context line up and the reward clearly outweighs the risk to the stop after ~0.2% round-trip fees.
- Be sceptical of: buying straight into resistance or after a vertical run-up, extreme greed, falling higher-timeframe trend, fading volume on a breakout, the bot having just lost on this coin, or BTC weakness when the coin is not BTC.
- You may only make the trade safer: tighten the stop (higher stop_price) or reduce size. You can never widen the stop or increase size.
- Base your judgement only on the data given. Do not invent news or events.
- If approve is false, still return the proposed stop and size_multiplier 1.`;

function compactCandles(candles: Candle[], decimals: number): string {
  return candles
    .map((k) => `${new Date(k.t).toISOString().slice(0, 13)} o${k.o.toFixed(decimals)} h${k.h.toFixed(decimals)} l${k.l.toFixed(decimals)} c${k.c.toFixed(decimals)} v${Math.round(k.v)}`)
    .join("\n");
}

export interface ReviewInput {
  symbol: string;
  analysis: Analysis;
  decision: Decision;
  daily: Candle[];
  fng: number | null;
  btc?: { regime: string; change24h: number } | null;
  recentTrades: { symbol: string; pnl: number | null; exit_reason: string | null }[];
  proposal: { entry: number; stop: number; spendUsd: number; equityUsd: number };
}

export function buildPrompt(r: ReviewInput): string {
  const a = r.analysis;
  const i = a.candles.length - 1;
  const closes = a.candles.map((k) => k.c);
  const e20 = ema(closes, 20)[i];
  const e50 = ema(closes, 50)[i];
  const e200 = ema(closes, 200)[i];
  const rsi14 = rsi(closes, 14)[i];
  const price = r.proposal.entry;
  const decimals = price >= 100 ? 2 : price >= 1 ? 4 : 6;
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
  const d = r.decision;
  const change = (h: number) => pct(closes[i] / closes[Math.max(0, i - h)] - 1);
  const riskUsd = r.proposal.spendUsd * (1 - r.proposal.stop / price);

  return `## Proposed trade
Coin: ${r.symbol}
Entry (market): ${price}
Proposed stop-loss: ${r.proposal.stop.toFixed(decimals)} (${pct(1 - r.proposal.stop / price)} below entry)
Position: $${r.proposal.spendUsd.toFixed(2)} of $${r.proposal.equityUsd.toFixed(2)} account; max loss at stop ≈ $${riskUsd.toFixed(2)}

## Engine view
Market type: ${d.regime}
Combined signal: ${d.combined.toFixed(2)} (needed ${d.threshold.toFixed(2)}), strategies agreeing: ${d.confirmations}
Strategy scores (-1..1): ${JSON.stringify(Object.fromEntries(Object.entries(d.scores).map(([k, v]) => [k, +v.toFixed(2)])))}
Strategy trust weights (from recent after-fee performance): ${JSON.stringify(Object.fromEntries(Object.entries(d.weights).map(([k, v]) => [k, +v.toFixed(2)])))}

## Indicators (1h)
EMA20 ${e20.toFixed(decimals)}, EMA50 ${e50.toFixed(decimals)}, EMA200 ${e200.toFixed(decimals)}
RSI14 ${rsi14.toFixed(1)}, ATR14 ${pct(a.atr[i] / price)} of price
Change: 4h ${change(4)}, 24h ${change(24)}, 7d ${change(168)}

## Market context
Fear & Greed index: ${r.fng ?? "unknown"}
${r.btc ? `BTC: ${r.btc.regime}, 24h change ${pct(r.btc.change24h)}` : ""}

## Bot's recent closed trades (newest first)
${r.recentTrades.length ? r.recentTrades.map((t) => `${t.symbol} ${t.pnl != null ? (t.pnl >= 0 ? "+" : "") + t.pnl.toFixed(2) : "?"} (${t.exit_reason})`).join("\n") : "none yet"}

## Daily candles (last ${r.daily.length} days)
${compactCandles(r.daily, decimals)}

## Hourly candles (last 72 hours)
${compactCandles(a.candles.slice(-72), decimals)}

Should the bot take this trade?`;
}

let client: Anthropic | null = null;

export function aiAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function reviewTrade(input: ReviewInput): Promise<{ verdict: AiVerdict; costUsd: number }> {
  client ??= new Anthropic({ timeout: 120_000, maxRetries: 1 });
  const response = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "medium", format: zodOutputFormat(Verdict) },
    messages: [{ role: "user", content: buildPrompt(input) }],
  });
  // Opus 5.5: $4 per million input tokens, $20 per million output tokens (thinking included).
  const costUsd = (response.usage.input_tokens * 4 + response.usage.output_tokens * 20) / 1_000_000;
  if (response.stop_reason === "refusal") throw new Error("AI declined to review this trade");
  const v = response.parsed_output;
  if (!v) throw new Error("AI returned an unreadable answer");
  return { verdict: sanitize(v, input.proposal.stop, input.proposal.entry), costUsd };
}

// The AI may only make a trade safer; enforce that in code, whatever it says.
export function sanitize(v: AiVerdict, proposedStop: number, entry: number): AiVerdict {
  const stop = Number.isFinite(v.stop_price) && v.stop_price >= proposedStop && v.stop_price < entry * 0.997 ? v.stop_price : proposedStop;
  const size = Number.isFinite(v.size_multiplier) ? Math.min(1, Math.max(0.25, v.size_multiplier)) : 1;
  const confidence = Math.min(100, Math.max(0, v.confidence || 0));
  return { ...v, stop_price: stop, size_multiplier: size, confidence, key_risks: v.key_risks.slice(0, 3) };
}
