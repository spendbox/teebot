import * as bybit from "../bybit";
import { FEE } from "../engine/backtest";
import type { Position } from "../db";
import type { Broker } from "./types";

const rulesCache = new Map<string, bybit.InstrumentRules>();

async function rules(symbol: string) {
  let r = rulesCache.get(symbol);
  if (!r) {
    r = await bybit.getInstrument(symbol);
    rulesCache.set(symbol, r);
  }
  return r;
}

// Market orders fill instantly, but the details can take a moment to appear.
async function waitForFill(symbol: string, orderId: string): Promise<bybit.OrderInfo> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const o = await bybit.getOrder(symbol, orderId);
    if (o && o.cumExecQty > 0 && ["Filled", "PartiallyFilledCanceled"].includes(o.orderStatus)) return o;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Order ${orderId} on ${symbol} did not confirm in time - check Bybit`);
}

export function liveBroker(): Broker {
  return {
    mode: "live",
    async account() {
      const w = await bybit.getWallet();
      return { equity: w.totalEquity, cash: w.coins.USDT ?? 0 };
    },
    async minOrderUsd(symbol) {
      return Math.max((await rules(symbol)).minOrderAmt, 1);
    },
    async buy(symbol, usd) {
      const r = await rules(symbol);
      const orderId = await bybit.marketBuyUsd(symbol, bybit.roundStep(usd, r.quotePrecision));
      const o = await waitForFill(symbol, orderId);
      // Bybit takes the buy fee out of the coins received.
      const qty = Number(bybit.roundStep(o.cumExecQty * (1 - FEE), r.basePrecision));
      return { qty, price: o.avgPrice, cost: o.cumExecValue };
    },
    async placeStop(symbol, qty, stop) {
      const r = await rules(symbol);
      return bybit.placeStopLoss(symbol, bybit.roundStep(qty, r.basePrecision), bybit.roundStep(stop, r.tickSize));
    },
    async moveStop(pos, stop) {
      if (pos.stop_order_id) {
        await bybit.cancelStopLoss(pos.symbol, pos.stop_order_id).catch(() => undefined);
      }
      return this.placeStop(pos.symbol, pos.qty, stop);
    },
    async sell(pos) {
      if (pos.stop_order_id) {
        await bybit.cancelStopLoss(pos.symbol, pos.stop_order_id).catch(() => undefined);
      }
      const r = await rules(pos.symbol);
      const wallet = await bybit.getWallet();
      const held = wallet.coins[r.baseCoin] ?? 0;
      const qty = bybit.roundStep(Math.min(pos.qty, held), r.basePrecision);
      const orderId = await bybit.marketSell(pos.symbol, qty);
      const o = await waitForFill(pos.symbol, orderId);
      return { price: o.avgPrice, proceeds: o.cumExecValue * (1 - FEE) };
    },
    async checkStop(pos: Position) {
      if (!pos.stop_order_id) return { status: "missing" };
      const o = await bybit.getOrder(pos.symbol, pos.stop_order_id, true);
      if (!o) return { status: "missing" };
      if (o.orderStatus === "Filled" && o.cumExecQty > 0) {
        return { status: "filled", exit: { price: o.avgPrice, proceeds: o.cumExecValue * (1 - FEE) } };
      }
      if (["Cancelled", "Rejected", "Deactivated"].includes(o.orderStatus)) return { status: "missing" };
      return { status: "active" };
    },
  };
}
