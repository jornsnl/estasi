"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/actions/community";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "busy";

const keyBytes = (base64: string) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
};

/**
 * Push notifications on this device. Uses the service worker of the app
 * (public/beheer-sw.js). On an iPhone or iPad this only works once the app
 * is on the home screen and opened from there (iOS 16.4 and later).
 */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!supported) {
      setState(ios && !standalone ? "ios-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker
      .getRegistration("/")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);

  async function enable() {
    setError(null);
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register("/beheer-sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const result = await savePushSubscription({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent });
      if (!result.ok) throw new Error("Opslaan mislukt.");
      setState("on");
    } catch (err) {
      setError((err as Error).message || "Aanzetten is niet gelukt.");
      setState("off");
    }
  }

  async function disable() {
    setError(null);
    setState("busy");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch (err) {
      setError((err as Error).message || "Uitzetten is niet gelukt.");
      setState("on");
    }
  }

  if (state === "loading") return null;
  return (
    <div className="space-y-2 text-sm">
      {state === "on" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-success">Pushmeldingen staan aan op dit apparaat.</span>
          <button type="button" className="btn-secondary py-1.5" onClick={disable}>
            Uitzetten
          </button>
        </div>
      )}
      {(state === "off" || state === "busy") && (
        <button type="button" className="btn-secondary py-1.5" onClick={enable} disabled={state === "busy"}>
          {state === "busy" ? "Bezig…" : "Pushmeldingen aanzetten op dit apparaat"}
        </button>
      )}
      {state === "denied" && (
        <p className="text-muted">Meldingen zijn in deze browser geblokkeerd. Sta ze toe in de instellingen van de browser voor deze site en laad de pagina opnieuw.</p>
      )}
      {state === "ios-install" && (
        <p className="text-muted">
          Op een iPhone of iPad werken pushmeldingen alleen als de Academy op je beginscherm staat: tik in Safari op de deelknop, kies{" "}
          <em>Zet op beginscherm</em>, open de app vanaf daar en zet de meldingen hier aan.
        </p>
      )}
      {state === "unsupported" && <p className="text-muted">Deze browser ondersteunt geen pushmeldingen. Je krijgt de meldingen per e-mail.</p>}
      {error && (
        <p className="text-bordeaux" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
