import type { Position } from "../db";

export interface Fill {
  qty: number;
  price: number;
  cost: number; // USDT spent including fees
}

export interface Exit {
  price: number;
  proceeds: number; // USDT received after fees
  qty: number; // coins sold
}

export type StopState = { status: "active" } | { status: "missing" } | { status: "filled"; exit: Exit };

export interface Broker {
  mode: "paper" | "live";
  account(prices: Record<string, number>, open: Position[]): Promise<{ equity: number; cash: number }>;
  minOrderUsd(symbol: string): Promise<number>;
  buy(symbol: string, usd: number, price: number): Promise<Fill>;
  // Returns the exchange order id of the stop, or null when the bot watches the stop itself.
  placeStop(symbol: string, qty: number, stop: number): Promise<string | null>;
  moveStop(pos: Position, stop: number): Promise<string | null>;
  // Sells `qty` (default: the whole position). Any exchange stop-loss is cancelled first.
  sell(pos: Position, price: number, qty?: number): Promise<Exit>;
  // State of the exchange-side stop-loss ("filled" means it already sold the position).
  checkStop(pos: Position): Promise<StopState>;
}
