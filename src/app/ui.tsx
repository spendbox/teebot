import { logout } from "./actions";

export { EquityChart } from "./chart";

type Tab = "dashboard" | "backtest" | "settings";

const ICONS: Record<Tab, React.ReactNode> = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  ),
  backtest: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 3 3 5-6" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </svg>
  ),
};

const LINKS: { tab: Tab; href: string; label: string }[] = [
  { tab: "dashboard", href: "/", label: "Dashboard" },
  { tab: "backtest", href: "/backtest", label: "Backtest" },
  { tab: "settings", href: "/settings", label: "Settings" },
];

export function Nav({ active = "dashboard", right }: { active?: Tab; right?: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <a href="/" className="brand">
          <span className="brand-mark">T</span> Teebot
        </a>
        {right}
        <nav className="toplinks">
          {LINKS.map((l) => (
            <a key={l.tab} href={l.href} className={l.tab === active ? "active" : ""}>
              {l.label}
            </a>
          ))}
        </nav>
      </header>
      <nav className="tabbar">
        {LINKS.map((l) => (
          <a key={l.tab} href={l.href} className={l.tab === active ? "active" : ""}>
            {ICONS[l.tab]}
            {l.label}
          </a>
        ))}
      </nav>
    </>
  );
}

export function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="ghost">
        Log out
      </button>
    </form>
  );
}

export function Message({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <div className="notice">{msg}</div>;
}

export const money = (n: number | null | undefined) => (n == null ? "-" : `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`);

export const signedMoney = (n: number | null | undefined) => (n == null ? "-" : `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`);

export const price = (n: number | null | undefined) =>
  n == null ? "-" : n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(4) : n.toPrecision(4);

export const REGIME_TEXT: Record<string, string> = {
  uptrend: "Trending up",
  downtrend: "Trending down",
  range: "Moving sideways",
  chaotic: "Too wild",
};
