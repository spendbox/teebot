"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { TickReport } from "@/lib/bot";
import { runNowAction } from "./actions";

const REFRESH_MS = 15_000;
const TICK_MS = 5 * 60_000;

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function clock(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Re-fetches the dashboard every few seconds and shows when the bot last/next checks.
export function LiveBar({ lastTickAt, enabled }: { lastTickAt: string | null; enabled: boolean }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const r = setInterval(() => {
      router.refresh();
      setLoadedAt(Date.now());
    }, REFRESH_MS);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [router]);

  const last = lastTickAt ? Date.parse(lastTickAt) : null;
  let next = "";
  if (enabled && last) {
    const remaining = last + TICK_MS - now;
    next = remaining > 0 ? `next check in ${clock(remaining)}` : "checking any moment…";
  }

  return (
    <div className="livebar">
      <span className={`dot ${enabled ? "pulse" : ""}`} aria-hidden />
      <strong>{enabled ? "Live" : "Paused"}</strong>
      <span className="muted">
        {last ? `Last market check ${ago(now - last)}` : "No market check yet"}
        {next && ` · ${next}`} · page updated {ago(now - loadedAt)}
      </span>
    </div>
  );
}

const STEPS = [
  "Downloading latest prices from Bybit…",
  "Working out the market type for each coin…",
  "Asking the three strategies…",
  "Checking the safety rules…",
  "Asking Opus 5.5 for a second opinion (only if there's a buy signal)…",
];

export function RunNow() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(0);
  const [report, setReport] = useState<TickReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pending) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1800);
    return () => clearInterval(t);
  }, [pending]);

  const run = () => {
    setReport(null);
    setError(null);
    start(async () => {
      try {
        setReport(await runNowAction());
      } catch (e) {
        setError((e as Error).message);
      }
      router.refresh();
    });
  };

  return (
    <div>
      <button className="primary" onClick={run} disabled={pending}>
        {pending ? (
          <>
            <span className="spinner" aria-hidden /> Checking…
          </>
        ) : (
          "Check market now"
        )}
      </button>
      {pending && <div className="run-panel muted">{STEPS[step]}</div>}
      {error && <div className="run-panel bad">{error}</div>}
      {report && !pending && (
        <div className="run-panel">
          <div className="run-head">
            <strong>
              {report.status === "ran"
                ? `Checked ${report.coins?.length ?? 0} coins just now`
                : report.status === "busy"
                  ? "The bot is already checking - try again in a moment"
                  : report.status === "error"
                    ? "The check hit a problem"
                    : report.messages[0]}
            </strong>
            <button className="link" onClick={() => setReport(null)}>
              Close
            </button>
          </div>
          {report.coins?.map((c) => (
            <div key={c.symbol} className="run-row">
              <span className="coin">{c.symbol.replace("USDT", "")}</span>
              <span>{c.outcome}</span>
            </div>
          ))}
          {report.messages
            .filter((m) => !report.coins?.some((c) => m.startsWith(c.symbol)))
            .map((m, i) => (
              <div key={i} className="run-row muted">
                {m}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function SubmitButton({ children, className, pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (
        <>
          <span className="spinner" aria-hidden /> {pendingText ?? "Working…"}
        </>
      ) : (
        children
      )}
    </button>
  );
}
