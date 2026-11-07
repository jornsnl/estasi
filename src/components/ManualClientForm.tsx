"use client";

import { useActionState } from "react";
import { createManualClient, type ManualClientState } from "@/app/actions/mcp";
import { CopyField } from "./CopyField";
import { SubmitButton } from "./SubmitButton";

/** Makes an OAuth client by hand and shows its secret once. */
export function ManualClientForm() {
  const [state, action] = useActionState<ManualClientState, FormData>(createManualClient, {});
  if (state.clientId) {
    return (
      <div className="space-y-3 rounded-lg border border-success/20 bg-success-soft/50 p-4">
        <p className="text-sm font-medium text-success">{state.name} is aangemaakt. Kopieer het secret nu: het wordt maar één keer getoond.</p>
        <CopyField id="newClientId" label="Client ID" value={state.clientId} />
        {state.clientSecret && <CopyField id="newClientSecret" label="Client secret" value={state.clientSecret} />}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      {state.error && <p role="alert" className="rounded-lg border border-bordeaux/30 bg-bordeaux-soft px-4 py-3 text-sm text-bordeaux">{state.error}</p>}
      <div>
        <label htmlFor="clientName" className="label">Naam van de app</label>
        <input id="clientName" name="name" maxLength={100} required className="input" placeholder="Bijvoorbeeld: Claude" />
      </div>
      <div>
        <label htmlFor="redirectUris" className="label">Redirect URI(s)</label>
        <textarea id="redirectUris" name="redirectUris" rows={2} required className="input font-mono text-xs" placeholder="https://claude.ai/api/mcp/auth_callback" />
        <p className="hint">De callback-URL die de app opgeeft. Meerdere: één per regel.</p>
      </div>
      <SubmitButton className="btn-secondary" pendingText="Aanmaken…">App aanmaken</SubmitButton>
    </form>
  );
}
