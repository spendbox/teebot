import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TradeParams } from "./engine/types";

export interface Settings {
  id: number;
  enabled: boolean;
  mode: "paper" | "live";
  risk_profile: string;
  symbols: string[];
  paper_start_balance: number;
  peak_equity: number | null;
  day_start_equity: number | null;
  day_start_date: string | null;
  daily_halt_date: string | null;
  kill_switch: boolean;
  kill_reason: string | null;
  telegram_chat_id: string | null;
  lock_until: string | null;
  last_tick_at: string | null;
  last_error: string | null;
  ai_enabled: boolean;
  ai_daily_limit: number;
  ai_calls_date: string | null;
  ai_calls_today: number;
}

export interface Position {
  id: number;
  mode: "paper" | "live";
  symbol: string;
  status: "open" | "closed";
  qty: number;
  entry_price: number;
  cost: number;
  stop_price: number;
  highest_price: number;
  stop_order_id: string | null;
  opened_at: string;
  closed_at: string | null;
  exit_price: number | null;
  proceeds: number | null;
  pnl: number | null;
  exit_reason: string | null;
  signal: unknown;
  take_profit_price: number | null;
  initial_stop: number | null;
  tp_done: boolean;
  realized: number; // USDT already received from selling part of the position
  params: TradeParams | null;
}

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`Database: ${r.error.message}`);
  return r.data;
}

export async function getSettings(): Promise<Settings> {
  return check(await db().from("settings").select("*").eq("id", 1).single()) as Settings;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  check(await db().from("settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1));
}

export async function openPositions(mode: string): Promise<Position[]> {
  return check(await db().from("positions").select("*").eq("mode", mode).eq("status", "open")) as Position[];
}

export async function closedPositions(mode: string, limit = 50): Promise<Position[]> {
  return check(
    await db()
      .from("positions")
      .select("*")
      .eq("mode", mode)
      .eq("status", "closed")
      .order("closed_at", { ascending: false })
      .limit(limit),
  ) as Position[];
}

export async function sumClosedPnl(mode: string): Promise<number> {
  const rows = check(await db().from("positions").select("pnl").eq("mode", mode).eq("status", "closed")) as {
    pnl: number | null;
  }[];
  return rows.reduce((s, r) => s + (r.pnl ?? 0), 0);
}

export async function insertPosition(
  p: Omit<Position, "id" | "opened_at" | "closed_at" | "exit_price" | "proceeds" | "pnl" | "exit_reason" | "status" | "tp_done" | "realized">,
): Promise<void> {
  check(await db().from("positions").insert({ ...p, status: "open" }));
}

export async function updatePosition(id: number, patch: Partial<Position>): Promise<void> {
  check(await db().from("positions").update(patch).eq("id", id));
}

export async function logEvent(level: "info" | "trade" | "warn" | "error", message: string): Promise<void> {
  await db().from("events").insert({ level, message });
}

// Stops two overlapping runs from trading at the same time.
export async function acquireLock(seconds = 240): Promise<boolean> {
  const now = new Date().toISOString();
  const until = new Date(Date.now() + seconds * 1000).toISOString();
  const r = await db()
    .from("settings")
    .update({ lock_until: until })
    .eq("id", 1)
    .or(`lock_until.is.null,lock_until.lt.${now}`)
    .select("id");
  return !r.error && (r.data?.length ?? 0) > 0;
}

export async function releaseLock(): Promise<void> {
  await db().from("settings").update({ lock_until: null }).eq("id", 1);
}
