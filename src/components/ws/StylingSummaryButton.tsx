"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { refreshStylingSummary } from "@/app/actions/ws-styling";

/** "Samenvatting vernieuwen" for Sabine: shows that it is working, and a clear message when it fails. */
export function StylingSummaryButton({ coupleId, hasSummary, lastError }: { coupleId: string; hasSummary: boolean; lastError?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(lastError ? { ok: false, text: lastError } : null);

  const run = () => {
    if (hasSummary && !window.confirm("De huidige samenvatting en de voorstellen die nog niet zijn vrijgegeven worden vervangen. Doorgaan?")) return;
    setResult(null);
    start(async () => {
      try {
        const res = await refreshStylingSummary(coupleId);
        setResult(res.ok ? { ok: true, text: res.message ?? "Samenvatting gemaakt." } : { ok: false, text: res.error ?? "Het is niet gelukt." });
        router.refresh();
      } catch {
        setResult({ ok: false, text: "Er ging iets mis met de verbinding. Probeer het opnieuw." });
      }
    });
  };

  return (
    <div className="mt-3 space-y-2">
      <button type="button" onClick={run} disabled={pending} aria-busy={pending} className="btn-secondary">
        {pending && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent" />}
        {pending ? "Samenvatting maken… (kan een halve minuut duren)" : hasSummary ? "Samenvatting vernieuwen" : "Samenvatting maken"}
      </button>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-success-soft text-success" : "bg-bordeaux-soft text-bordeaux"}`}>
          {result.ok ? result.text : `Samenvatting maken is niet gelukt. ${result.text}`}
        </p>
      )}
    </div>
  );
}
