import { getKlines } from "@/lib/bybit";
import { login } from "../actions";
import { InstallHint, PasswordField } from "./login-client";
import { SubmitButton } from "../live";

export const dynamic = "force-dynamic";

// Last 7 days of Bitcoin, hourly. Never blocks the login page for long.
async function bitcoinWeek() {
  try {
    const bars = await Promise.race([
      getKlines("BTCUSDT", "60", 168, undefined, "linear"),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    return bars.length > 24 ? bars : null;
  } catch {
    return null;
  }
}

function Sparkline({ closes }: { closes: number[] }) {
  const w = 320;
  const h = 90;
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const x = (i: number) => (i / (closes.length - 1)) * w;
  const y = (v: number) => 6 + (1 - (v - lo) / (hi - lo || 1)) * (h - 12);
  const line = closes.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a78bfa" stopOpacity="0.45" />
          <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#sparkFill)" />
      <path d={line} fill="none" stroke="#c4b5fd" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={x(closes.length - 1)} cy={y(closes[closes.length - 1])} r="3.5" fill="#fff" />
    </svg>
  );
}

const ICONS = [
  <path key="c" d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />,
  <path key="t" d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  <path key="s" d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3Zm-3 9 2 2 4-4" />,
];

const FEATURES = [
  { title: "Watches every minute", text: "Checks Bitcoin around the clock, so you don't have to." },
  { title: "Only strong setups", text: "Trades only in uptrends, scored on 7 clues. About 2 trades a month." },
  { title: "Built-in safety", text: "5% emergency stop, out by midnight, and a shutdown if things go badly." },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const week = await bitcoinWeek();
  const last = week?.[week.length - 1].c;
  const dayAgo = week?.[week.length - 25].c;
  const change = last && dayAgo ? (last / dayAgo - 1) * 100 : null;

  return (
    <div className="landing">
      <div className="landing-glow" aria-hidden>
        <span className="orb a" />
        <span className="orb b" />
        <span className="orb c" />
      </div>

      <div className="landing-inner">
        <header className="landing-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={36} height={36} />
          <span>Teebot</span>
        </header>

        <section className="landing-hero">
          <p className="eyebrow">Bitcoin trading bot</p>
          <h1>
            Your bot trades.
            <br />
            <span className="grad">You check in.</span>
          </h1>
          <p className="lede">A careful Bitcoin bot that waits for the right moment, then manages the trade for you, day and night.</p>

          {week && last != null && (
            <div className="ticker">
              <div className="ticker-head">
                <div>
                  <div className="ticker-label">
                    <span className="live-dot" /> Bitcoin · live
                  </div>
                  <div className="ticker-price">${last.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
                </div>
                {change != null && (
                  <span className={`ticker-change ${change >= 0 ? "up" : "down"}`}>
                    {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}% <small>24h</small>
                  </span>
                )}
              </div>
              <Sparkline closes={week.map((b) => b.c)} />
              <div className="ticker-foot">Last 7 days</div>
            </div>
          )}

          <ul className="features">
            {FEATURES.map((f, i) => (
              <li key={f.title} style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
                <svg className="feat-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {ICONS[i]}
                </svg>
                <div>
                  <strong>{f.title}</strong>
                  <span>{f.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="login-card" aria-label="Log in">
          <h2>Welcome back</h2>
          <p className="login-sub">Enter your dashboard password to see your bot.</p>
          {msg && (
            <div className="login-error" role="alert">
              {msg}
            </div>
          )}
          <form action={login}>
            <PasswordField />
            <SubmitButton className="login-btn" pendingText="Opening…">
              Open dashboard →
            </SubmitButton>
          </form>
          <InstallHint />
        </section>
      </div>

      <footer className="landing-foot">Trading involves risk. Only use money you can afford to lose.</footer>
    </div>
  );
}
