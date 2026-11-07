"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/academy";
import { requireOwner } from "@/lib/auth/session";
import { isAllowedRedirectUri } from "@/lib/oauth/pure";
import { createClient, mcpSettingsFor } from "@/lib/oauth/server";
import { getSecurityStore } from "@/lib/security/store";

const PROFILE = "/beheer/profiel";
function done(message: string, isError = false): never {
  redirect(`${PROFILE}?${isError ? "fout" : "melding"}=${encodeURIComponent(message)}#mcp`);
}

export async function saveMcpSettings(formData: FormData) {
  const owner = await requireOwner();
  const previous = await mcpSettingsFor(owner.id);
  const next = {
    userId: owner.id,
    enabled: formData.get("enabled") === "on",
    allowWrite: formData.get("allowWrite") === "on",
    allowRegistration: formData.get("allowRegistration") === "on",
    updatedAt: new Date().toISOString(),
  };
  await getSecurityStore().saveMcpSettings(next);
  const changes = [
    previous.enabled !== next.enabled && (next.enabled ? "MCP aangezet" : "MCP uitgezet"),
    previous.allowWrite !== next.allowWrite && (next.allowWrite ? "schrijven toegestaan" : "schrijven uitgezet"),
    previous.allowRegistration !== next.allowRegistration && (next.allowRegistration ? "zelf aanmelden toegestaan" : "zelf aanmelden uitgezet"),
  ].filter(Boolean);
  if (changes.length) await audit(owner, "MCP-instellingen gewijzigd", changes.join(", "));
  done(next.enabled ? "MCP-instellingen opgeslagen." : "MCP staat uit. Verbonden apps hebben geen toegang meer totdat je MCP weer aanzet.");
}

export async function revokeGrant(formData: FormData) {
  const owner = await requireOwner();
  const store = getSecurityStore();
  const grant = await store.getGrant(String(formData.get("grantId") ?? ""));
  if (!grant || grant.userId !== owner.id) done("Verbinding niet gevonden.", true);
  await store.updateGrant(grant.id, { revokedAt: new Date().toISOString() });
  const client = await store.getClient(grant.clientId);
  await audit(owner, "MCP-verbinding verbroken", client?.name ?? grant.clientId);
  done("Verbinding verbroken. De app moet opnieuw toestemming vragen.");
}

export async function deleteOAuthClient(formData: FormData) {
  const owner = await requireOwner();
  const store = getSecurityStore();
  const client = await store.getClient(String(formData.get("clientId") ?? ""));
  if (!client) done("App niet gevonden.", true);
  await store.deleteClient(client.id);
  await audit(owner, "MCP-app verwijderd", client.name);
  done(`${client.name} verwijderd, met al zijn verbindingen.`);
}

export interface ManualClientState {
  error?: string;
  clientId?: string;
  clientSecret?: string;
  name?: string;
}

/** A client made by hand, for apps that cannot register themselves. The secret is shown once. */
export async function createManualClient(_previous: ManualClientState, formData: FormData): Promise<ManualClientState> {
  const owner = await requireOwner();
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const redirectUris = String(formData.get("redirectUris") ?? "")
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (!name) return { error: "Geef de app een naam." };
  if (redirectUris.length === 0) return { error: "Vul minstens één redirect URI in (de callback-URL van de app)." };
  const bad = redirectUris.find((u) => !isAllowedRedirectUri(u));
  if (bad) return { error: `Deze redirect URI kan niet: ${bad}. Gebruik https, of http alleen voor localhost.` };
  const { client, secret } = await createClient({ name, redirectUris, confidential: true, source: "manual" });
  await audit(owner, "MCP-app aangemaakt", name);
  return { clientId: client.id, clientSecret: secret ?? undefined, name };
}
