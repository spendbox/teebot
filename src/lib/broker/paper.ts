import { FEE, SLIPPAGE } from "../engine/backtest";
import { sumClosedPnl, type Position } from "../db";
import type { Broker } from "./types";

// Practice money: real prices, pretend orders, same fees and slippage as the backtest.
export function paperBroker(startBalance: number): Broker {
  return {
    mode: "paper",
    async account(prices, open) {
      const realized = await sumClosedPnl("paper");
      const invested = open.reduce((s, p) => s + p.cost, 0);
      const cash = startBalance + realized - invested;
      const holdings = open.reduce((s, p) => s + p.qty * (prices[p.symbol] ?? p.entry_price), 0);
      return { cash, equity: cash + holdings };
    },
    async minOrderUsd() {
      return 5;
    },
    async buy(_symbol, usd, price) {
      const fill = price * (1 + SLIPPAGE);
      return { qty: (usd * (1 - FEE)) / fill, price: fill, cost: usd };
    },
    async placeStop() {
      return null;
    },
    async moveStop() {
      return null;
    },
    async sell(pos, price) {
      const fill = price * (1 - SLIPPAGE);
      return { price: fill, proceeds: pos.qty * fill * (1 - FEE) };
    },
    async checkStop() {
      return { status: "active" };
    },
  };
}
