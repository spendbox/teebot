import { describe, expect, it } from "vitest";
import { buildPrompt, sanitize, type AiVerdict } from "@/lib/ai";
import { analyze } from "@/lib/engine/analysis";
import { decide } from "@/lib/engine/decide";
import { PROFILES } from "@/lib/engine/profiles";
import type { Candle } from "@/lib/engine/types";

const verdict = (v: Partial<AiVerdict>): AiVerdict => ({
  approve: true,
  confidence: 80,
  stop_price: 95,
  size_multiplier: 1,
  reasoning: "ok",
  key_risks: [],
  ...v,
});

describe("AI safety limits", () => {
  it("never lets the AI widen the stop-loss", () => {
    expect(sanitize(verdict({ stop_price: 90 }), 95, 100).stop_price).toBe(95);
  });

  it("allows a tighter stop, but not one at or above the entry", () => {
    expect(sanitize(verdict({ stop_price: 97 }), 95, 100).stop_price).toBe(97);
    expect(sanitize(verdict({ stop_price: 100 }), 95, 100).stop_price).toBe(95);
  });

  it("never lets the AI increase the trade size", () => {
    expect(sanitize(verdict({ size_multiplier: 3 }), 95, 100).size_multiplier).toBe(1);
    expect(sanitize(verdict({ size_multiplier: 0 }), 95, 100).size_multiplier).toBe(0.25);
  });

  it("clamps confidence to 0-100", () => {
    expect(sanitize(verdict({ confidence: 250 }), 95, 100).confidence).toBe(100);
  });
});

describe("AI prompt", () => {
  it("contains the trade, indicators and recent candles", () => {
    const candles: Candle[] = Array.from({ length: 400 }, (_, i) => {
      const c = 100 + Math.sin(i / 10) * 3 + i * 0.05;
      return { t: Date.UTC(2025, 0, 1) + i * 3600_000, o: c - 0.2, h: c + 0.5, l: c - 0.6, c, v: 1000 };
    });
    const a = analyze(candles);
    const d = decide(a, candles.length - 1, PROFILES.cautious, { inPosition: false, fng: 55 });
    const prompt = buildPrompt({
      symbol: "ETHUSDT",
      analysis: a,
      decision: d,
      daily: candles.slice(-10),
      fng: 55,
      btc: { regime: "uptrend", change24h: 0.012 },
      recentTrades: [{ symbol: "ETHUSDT", pnl: -0.18, exit_reason: "stop-loss" }],
      proposal: { entry: 120, stop: 117, spendUsd: 6, equityUsd: 20 },
    });
    expect(prompt).toContain("Coin: ETHUSDT");
    expect(prompt).toContain("Fear & Greed index: 55");
    expect(prompt).toContain("BTC: uptrend");
    expect(prompt).toContain("stop-loss");
    expect(prompt.split("\n").filter((l) => /^\d{4}-\d\d-\d\dT\d\d o/.test(l)).length).toBe(82);
    expect(prompt).not.toContain("NaN");
  });
});
