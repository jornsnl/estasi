"use client";

import { useEffect, useState } from "react";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "installed" | "ios-safari" | "ios-other" | "prompt" | "other";

/** How to put the admin on the home screen: steps for iPhone, a button where the browser offers one. */
export function InstallApp() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    const ua = navigator.userAgent;
    // iPadOS presents itself as a Mac; touch points give it away.
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    const otherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    setPlatform(standalone ? "installed" : ios ? (otherIosBrowser ? "ios-other" : "ios-safari") : "other");
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
      setPlatform((p) => (p === "installed" ? p : "prompt"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (platform === null) return null;
  if (platform === "installed") {
    return <p className="rounded-lg border border-success/20 bg-success-soft px-4 py-3 text-sm text-success">Je gebruikt het beheer nu als app.</p>;
  }
  if (platform === "prompt" && prompt) {
    return (
      <button
        type="button"
        className="btn-primary"
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }}
      >
        Installeer als app
      </button>
    );
  }
  return (
    <div className="space-y-2 text-sm text-muted">
      {platform === "ios-other" && (
        <p className="rounded-lg border border-gold/30 bg-gold-soft px-4 py-3 text-gold-ink">Open deze pagina in Safari: alleen daar kun je hem op je beginscherm zetten.</p>
      )}
      <p className="font-medium text-ink">Op je iPhone of iPad (Safari)</p>
      <ol className="list-decimal space-y-0.5 pl-5">
        <li>Tik onderin op de deelknop (het vierkantje met de pijl omhoog).</li>
        <li>Kies <em>Zet op beginscherm</em>. Zie je die niet, scroll dan naar beneden of tik op <em>Meer</em>.</li>
        <li>Laat <em>Open als webapp</em> aan staan en tik op <em>Voeg toe</em>.</li>
      </ol>
      <p>
        Het icoon <strong className="text-ink">Estasi</strong> opent het beheer schermvullend. Log in de app één keer in, het makkelijkst met je passkey:
        de app onthoudt de inlog los van Safari.
      </p>
      {platform === "other" && <p>Op een computer: in Chrome of Edge staat rechts in de adresbalk een knop om de app te installeren.</p>}
    </div>
  );
}
