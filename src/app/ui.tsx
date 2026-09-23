import { logout } from "./actions";

export { EquityChart } from "./chart";

export function Nav() {
  return (
    <nav>
      <span className="brand">Teebot</span>
      <a href="/">Dashboard</a>
      <a href="/backtest">Backtest</a>
      <a href="/settings">Settings</a>
      <form action={logout}>
        <button type="submit">Log out</button>
      </form>
    </nav>
  );
}

export function Message({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <div className="notice">{msg}</div>;
}

export const money = (n: number | null | undefined) => (n == null ? "-" : `$${n.toFixed(2)}`);

export const price = (n: number | null | undefined) =>
  n == null ? "-" : n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toPrecision(4);

export const REGIME_TEXT: Record<string, string> = {
  uptrend: "Trending up",
  downtrend: "Trending down",
  range: "Moving sideways",
  chaotic: "Too wild",
};
