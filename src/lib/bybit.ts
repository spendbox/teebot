import { createHmac } from "node:crypto";
import type { Candle } from "./engine/types";

const BASE_URL = process.env.BYBIT_BASE_URL || "https://api.bybit.com";
const RECV_WINDOW = "10000";

export class BybitError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

interface BybitResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
}

export function sign(secret: string, timestamp: string, apiKey: string, payload: string): string {
  return createHmac("sha256", secret).update(timestamp + apiKey + RECV_WINDOW + payload).digest("hex");
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (res.status === 403 || res.status === 451) {
    throw new BybitError(
      "Bybit refused the connection from this server's location. Change the region in vercel.json (see README).",
      res.status,
    );
  }
  let json: BybitResponse<T>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BybitError(`Bybit returned an unexpected response (HTTP ${res.status})`);
  }
  if (json.retCode !== 0) throw new BybitError(`Bybit: ${json.retMsg}`, json.retCode);
  return json.result;
}

async function publicGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE_URL}${path}?${qs}`, { cache: "no-store" });
  return parse<T>(res);
}

function credentials() {
  const key = process.env.BYBIT_API_KEY;
  const secret = process.env.BYBIT_API_SECRET;
  if (!key || !secret) throw new BybitError("BYBIT_API_KEY and BYBIT_API_SECRET are not set");
  return { key, secret };
}

async function privateGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const { key, secret } = credentials();
  const qs = new URLSearchParams(params).toString();
  const ts = Date.now().toString();
  const res = await fetch(`${BASE_URL}${path}?${qs}`, {
    cache: "no-store",
    headers: {
      "X-BAPI-API-KEY": key,
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": RECV_WINDOW,
      "X-BAPI-SIGN": sign(secret, ts, key, qs),
    },
  });
  return parse<T>(res);
}

async function privatePost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { key, secret } = credentials();
  const json = JSON.stringify(body);
  const ts = Date.now().toString();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-BAPI-API-KEY": key,
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-RECV-WINDOW": RECV_WINDOW,
      "X-BAPI-SIGN": sign(secret, ts, key, json),
    },
    body: json,
  });
  return parse<T>(res);
}

// ---- Public market data ----

// Bybit returns newest-first; we return oldest-first.
export async function getKlines(symbol: string, interval = "60", limit = 1000, end?: number): Promise<Candle[]> {
  const params: Record<string, string> = { category: "spot", symbol, interval, limit: String(limit) };
  if (end) params.end = String(end);
  const r = await publicGet<{ list: string[][] }>("/v5/market/kline", params);
  return r.list
    .map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }))
    .reverse();
}

// Candles that have fully closed (drops the one still forming).
export async function getClosedHourlyCandles(symbol: string, count = 400): Promise<Candle[]> {
  const candles = await getKlines(symbol, "60", Math.min(count + 1, 1000));
  const hourStart = Math.floor(Date.now() / 3600_000) * 3600_000;
  return candles.filter((k) => k.t < hourStart);
}

export async function getHistory(symbol: string, days: number): Promise<Candle[]> {
  const total = days * 24;
  const out: Candle[] = [];
  let end: number | undefined;
  while (out.length < total) {
    const batch = await getKlines(symbol, "60", 1000, end);
    if (batch.length === 0) break;
    out.unshift(...batch.filter((k) => out.length === 0 || k.t < out[0].t));
    end = batch[0].t - 1;
    if (batch.length < 1000) break;
  }
  return out.slice(-total);
}

export async function getLastPrice(symbol: string): Promise<number> {
  const r = await publicGet<{ list: { lastPrice: string }[] }>("/v5/market/tickers", { category: "spot", symbol });
  return +r.list[0].lastPrice;
}

export interface InstrumentRules {
  baseCoin: string;
  basePrecision: number;
  quotePrecision: number;
  minOrderQty: number;
  minOrderAmt: number;
  tickSize: number;
}

export async function getInstrument(symbol: string): Promise<InstrumentRules> {
  const r = await publicGet<{
    list: {
      baseCoin: string;
      lotSizeFilter: { basePrecision: string; quotePrecision: string; minOrderQty: string; minOrderAmt: string };
      priceFilter: { tickSize: string };
    }[];
  }>("/v5/market/instruments-info", { category: "spot", symbol });
  const i = r.list[0];
  if (!i) throw new BybitError(`Unknown symbol ${symbol}`);
  return {
    baseCoin: i.baseCoin,
    basePrecision: +i.lotSizeFilter.basePrecision,
    quotePrecision: +i.lotSizeFilter.quotePrecision,
    minOrderQty: +i.lotSizeFilter.minOrderQty,
    minOrderAmt: +i.lotSizeFilter.minOrderAmt,
    tickSize: +i.priceFilter.tickSize,
  };
}

// Round down to an exchange step (e.g. 0.000001) and format without float noise.
export function roundStep(value: number, step: number): string {
  const decimals = Math.max(0, Math.round(-Math.log10(step)));
  const floored = Math.floor(value / step + 1e-9) * step;
  return floored.toFixed(decimals);
}

// ---- Private (account) ----

export async function getWallet(): Promise<{ totalEquity: number; coins: Record<string, number> }> {
  const r = await privateGet<{
    list: { totalEquity: string; coin: { coin: string; walletBalance: string }[] }[];
  }>("/v5/account/wallet-balance", { accountType: "UNIFIED" });
  const acct = r.list[0];
  const coins: Record<string, number> = {};
  for (const c of acct?.coin ?? []) coins[c.coin] = +c.walletBalance;
  return { totalEquity: +(acct?.totalEquity ?? 0), coins };
}

export async function marketBuyUsd(symbol: string, usd: string): Promise<string> {
  const r = await privatePost<{ orderId: string }>("/v5/order/create", {
    category: "spot",
    symbol,
    side: "Buy",
    orderType: "Market",
    marketUnit: "quoteCoin",
    qty: usd,
  });
  return r.orderId;
}

export async function marketSell(symbol: string, qty: string): Promise<string> {
  const r = await privatePost<{ orderId: string }>("/v5/order/create", {
    category: "spot",
    symbol,
    side: "Sell",
    orderType: "Market",
    marketUnit: "baseCoin",
    qty,
  });
  return r.orderId;
}

// A stop-loss that lives on Bybit itself, so it protects you even if the bot is down.
export async function placeStopLoss(symbol: string, qty: string, triggerPrice: string): Promise<string> {
  const r = await privatePost<{ orderId: string }>("/v5/order/create", {
    category: "spot",
    symbol,
    side: "Sell",
    orderType: "Market",
    qty,
    triggerPrice,
    orderFilter: "StopOrder",
  });
  return r.orderId;
}

export async function cancelStopLoss(symbol: string, orderId: string): Promise<void> {
  await privatePost("/v5/order/cancel", { category: "spot", symbol, orderId, orderFilter: "StopOrder" });
}

export interface OrderInfo {
  orderStatus: string;
  avgPrice: number;
  cumExecQty: number;
  cumExecValue: number;
}

export async function getOrder(symbol: string, orderId: string, isStop = false): Promise<OrderInfo | null> {
  const params: Record<string, string> = { category: "spot", symbol, orderId };
  if (isStop) params.orderFilter = "StopOrder";
  for (const path of ["/v5/order/realtime", "/v5/order/history"]) {
    const r = await privateGet<{
      list: { orderStatus: string; avgPrice: string; cumExecQty: string; cumExecValue: string }[];
    }>(path, params);
    const o = r.list[0];
    if (o) {
      return { orderStatus: o.orderStatus, avgPrice: +o.avgPrice, cumExecQty: +o.cumExecQty, cumExecValue: +o.cumExecValue };
    }
  }
  return null;
}
