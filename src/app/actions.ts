"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, requireAuth, safeEqual, sessionToken } from "@/lib/auth";
import { runTick, type TickReport } from "@/lib/bot";
import { getFuturesHistory, getFuturesPosition, getHistory, getWallet } from "@/lib/bybit";
import { HISTORY_DAYS, backtestBreakout, type BreakoutBacktest } from "@/lib/breakout/strategy";
import { db, getSettings, logEvent, updateSettings } from "@/lib/db";
import { backtest, type BacktestResult } from "@/lib/engine/backtest";
import { getProfile } from "@/lib/engine/profiles";
import { getFearGreedHistory } from "@/lib/sentiment";
import { findLatestChatId, sendTelegram } from "@/lib/telegram";

const back = (path: string, msg: string): never => redirect(`${path}?msg=${encodeURIComponent(msg)}`);

export async function login(form: FormData) {
  const password = String(form.get("password") ?? "");
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected || !safeEqual(password, expected)) back("/login", "Wrong password");
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 180, // stay logged in on your phone for 6 months
    path: "/",
  });
  redirect("/");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function toggleBot() {
  await requireAuth();
  const s = await getSettings();
  if (s.kill_switch) back("/", "Safety shutdown is active - reset it in Settings first");
  await updateSettings({ enabled: !s.enabled });
  await logEvent("info", `Bot switched ${s.enabled ? "OFF" : "ON"} (${s.mode})`);
  back("/", s.enabled ? "Bot switched off" : "Bot switched on - it checks the market every 5 minutes");
}

export async function runNowAction(): Promise<TickReport> {
  await requireAuth();
  return runTick({ manual: true });
}

export async function saveStrategy(form: FormData) {
  await requireAuth();
  const strategy = form.get("strategy") === "classic" ? "classic" : "breakout";
  const breakout_profile = form.get("breakout_profile") === "safer" ? "safer" : "balanced";
  const s = await getSettings();
  const open = await db().from("positions").select("id").eq("mode", s.mode).eq("status", "open");
  if (strategy !== (s.strategy ?? "breakout") && (open.data?.length ?? 0) > 0) {
    back("/settings", "Close the open trade first (or wait for it to finish) before switching strategy");
  }
  await updateSettings({ strategy, breakout_profile });
  await logEvent("info", `Strategy set to ${strategy === "breakout" ? `Breakout day-trader (${breakout_profile})` : "Classic"}`);
  back("/settings", "Strategy saved");
}

export async function saveAiSettings(form: FormData) {
  await requireAuth();
  const limit = Math.round(Number(form.get("ai_daily_limit")));
  if (!(limit >= 0 && limit <= 24)) back("/settings", "Daily AI reviews must be between 0 and 24");
  await updateSettings({ ai_enabled: form.get("ai_enabled") === "on", ai_daily_limit: limit });
  back("/settings", "AI settings saved");
}

export async function saveSettings(form: FormData) {
  await requireAuth();
  const symbols = form.getAll("symbols").map(String).filter((s) => /^[A-Z0-9]+USDT$/.test(s));
  if (symbols.length === 0) back("/settings", "Pick at least one coin");
  const risk = String(form.get("risk_profile"));
  await updateSettings({ symbols, risk_profile: risk === "balanced" ? "balanced" : "cautious" });
  back("/settings", "Settings saved");
}

// Restarts the early-warning clock. Skipped if the database hasn't been upgraded yet.
const restartWarning = (s: { run_start_at?: unknown }) =>
  "run_start_at" in s ? { run_start_at: null, run_start_equity: null, warning_at: null, warning_reason: null } : {};

export async function saveWarning(form: FormData) {
  await requireAuth();
  const s = await getSettings();
  if (!("run_start_at" in s)) back("/settings", "Run supabase/upgrade-warning.sql in Supabase first");
  const action = String(form.get("warning_action"));
  if (action !== "pause" && action !== "alert") back("/settings", "Choose what the early warning should do");
  await updateSettings({ warning_action: action as "pause" | "alert" });
  back("/settings", action === "pause" ? "Early warning will pause new trades" : "Early warning will only alert you");
}

export async function clearWarning() {
  await requireAuth();
  const s = await getSettings();
  await updateSettings(restartWarning(s));
  await logEvent("warn", "Early warning cleared by owner - the warning clock restarts from today's balance");
  back("/settings", "Early warning cleared. It now measures from today's balance and the clock starts again.");
}

export async function setMode(form: FormData) {
  await requireAuth();
  const mode = String(form.get("mode"));
  const s = await getSettings();
  if (mode === "live") {
    if (String(form.get("confirm")).trim() !== "LIVE") back("/settings", 'Type LIVE in the box to confirm real-money trading');
    if (!process.env.BYBIT_API_KEY || !process.env.BYBIT_API_SECRET) back("/settings", "Add your Bybit API keys in Vercel first");
    const open = await db().from("positions").select("id").eq("mode", "paper").eq("status", "open");
    if ((open.data?.length ?? 0) > 0) back("/settings", "Wait until practice trades are closed, or reset practice mode");
  }
  if (mode !== "live" && mode !== "paper") back("/settings", "Unknown mode");
  if (mode === s.mode) back("/settings", `Already in ${mode === "live" ? "real money" : "practice"} mode`);
  const openLive = await db().from("positions").select("id").eq("mode", "live").eq("status", "open");
  if (mode === "paper" && (openLive.data?.length ?? 0) > 0) {
    back("/settings", "You still have real trades open. Wait for them to close before switching to practice");
  }
  await updateSettings({
    mode: mode as "paper" | "live",
    enabled: false,
    peak_equity: null,
    day_start_equity: null,
    day_start_date: null,
    ...restartWarning(s),
  });
  await logEvent("warn", `Switched to ${mode === "live" ? "REAL MONEY" : "practice"} mode (bot paused)`);
  back("/settings", `Now in ${mode === "live" ? "REAL MONEY" : "practice"} mode. The bot is paused - switch it on from the dashboard.`);
}

export async function resetPaper(form: FormData) {
  await requireAuth();
  const balance = Number(form.get("balance"));
  if (!(balance >= 5 && balance <= 1_000_000)) back("/settings", "Enter a starting balance between 5 and 1,000,000");
  await db().from("positions").delete().eq("mode", "paper");
  await db().from("equity_snapshots").delete().eq("mode", "paper");
  const s = await getSettings();
  await updateSettings({
    paper_start_balance: balance,
    ...(s.mode === "paper" ? { peak_equity: null, day_start_equity: null, day_start_date: null, kill_switch: false, kill_reason: null, ...restartWarning(s) } : {}),
  });
  back("/settings", `Practice account reset to $${balance}`);
}

export async function resetSafety() {
  await requireAuth();
  await updateSettings({ kill_switch: false, kill_reason: null, peak_equity: null, day_start_equity: null, day_start_date: null });
  await logEvent("warn", "Safety shutdown reset by owner");
  back("/settings", "Safety shutdown cleared. Balance tracking restarted from today. The bot is still off until you switch it on.");
}

export async function resetPeak() {
  await requireAuth();
  const s = await getSettings();
  await updateSettings({ peak_equity: null, day_start_equity: null, day_start_date: null, ...("run_start_at" in s ? { run_start_equity: null } : {}) });
  back("/settings", "Balance tracking restarted (use this after depositing or withdrawing)");
}

export async function connectTelegram() {
  await requireAuth();
  let chatId: string | null = null;
  try {
    chatId = await findLatestChatId();
  } catch (e) {
    back("/settings", (e as Error).message);
  }
  if (!chatId) back("/settings", "No message found. Open your bot in Telegram, send it 'hi', then press Connect again");
  await updateSettings({ telegram_chat_id: chatId });
  await sendTelegram(chatId, "Teebot connected. You'll get a message for every trade and warning.");
  back("/settings", "Telegram connected - check your phone for a test message");
}

export async function testBybit() {
  await requireAuth();
  let message = "";
  try {
    const w = await getWallet();
    message = `Bybit connected. Account value $${w.totalEquity.toFixed(2)}, USDT available ${(w.coins.USDT ?? 0).toFixed(2)}.`;
    try {
      await getFuturesPosition("BTCUSDT");
      message += " Futures (derivatives) access: OK.";
    } catch (e) {
      message += ` Futures access FAILED: ${(e as Error).message}. Check the API key has Contract/Derivatives permissions.`;
    }
  } catch (e) {
    message = `Bybit test failed: ${(e as Error).message}`;
  }
  back("/settings", message);
}

export type BacktestState = { error?: string; symbol?: string; days?: number; result?: BacktestResult } | null;

export async function runBacktest(_prev: BacktestState, form: FormData): Promise<BacktestState> {
  await requireAuth();
  const symbol = String(form.get("symbol"));
  const days = Math.min(730, Math.max(30, Number(form.get("days")) || 180));
  const balance = Math.max(5, Number(form.get("balance")) || 20);
  const s = await getSettings();
  try {
    const [candles, fngByDay] = await Promise.all([getHistory(symbol, days + 11), getFearGreedHistory()]);
    const result = backtest(candles, getProfile(s.risk_profile), { startBalance: balance, fngByDay });
    return { symbol, days, result };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export type BreakoutBacktestState = { error?: string; days?: number; result?: Omit<BreakoutBacktest, "trades"> & { trades: BreakoutBacktest["trades"] } } | null;

export async function runBreakoutBacktest(_prev: BreakoutBacktestState, form: FormData): Promise<BreakoutBacktestState> {
  await requireAuth();
  const days = Math.min(1800, Math.max(90, Number(form.get("days")) || 730));
  const balance = Math.max(10, Number(form.get("balance")) || 50);
  const profile = form.get("profile") === "safer" ? "safer" : "balanced";
  try {
    const hourly = await getFuturesHistory("BTCUSDT", days + HISTORY_DAYS + 2);
    const from = Date.now() - days * 86_400_000;
    const result = backtestBreakout(hourly, { profile, startBalance: balance, minNotional: 90, from });
    return { days, result: { ...result, trades: result.trades.slice(-30).reverse() } };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
