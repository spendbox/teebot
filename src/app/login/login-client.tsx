"use client";

import { useEffect, useState } from "react";

export function PasswordField() {
  const [show, setShow] = useState(false);
  return (
    <label className="pw">
      <span className="pw-label">Password</span>
      <span className="pw-wrap">
        <input
          type={show ? "text" : "password"}
          name="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
          autoFocus
        />
        <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>
          {show ? "Hide" : "Show"}
        </button>
      </span>
    </label>
  );
}

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

// Offers "Install app" on Android/desktop Chrome and shows the Share-menu tip on iPhone.
export function InstallHint() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  if (evt) {
    return (
      <button
        type="button"
        className="install-btn"
        onClick={async () => {
          await evt.prompt();
          await evt.userChoice;
          setEvt(null);
        }}
      >
        ⤓ Install the Teebot app
      </button>
    );
  }
  if (ios) {
    return (
      <p className="install-tip">
        <strong>Get the app:</strong> tap <ShareIcon /> Share in Safari, then <strong>Add to Home Screen</strong>.
      </p>
    );
  }
  return <p className="install-tip">Tip: add Teebot to your home screen to open it like an app.</p>;
}

function ShareIcon() {
  return (
    <svg className="share-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
