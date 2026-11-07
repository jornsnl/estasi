import Link from "next/link";
import { deleteOAuthClient, revokeGrant, saveMcpSettings } from "@/app/actions/mcp";
import { removePasskey, renamePasskey } from "@/app/actions/passkeys";
import { Badge } from "@/components/Badge";
import { CopyField } from "@/components/CopyField";
import { ManualClientForm } from "@/components/ManualClientForm";
import { Notice } from "@/components/Notice";
import { PasskeyRegister } from "@/components/PasskeyRegister";
import { SubmitButton } from "@/components/SubmitButton";
import { requireOwner } from "@/lib/auth/session";
import { isSupabaseMode } from "@/lib/data";
import { allTools } from "@/lib/mcp/tools";
import { mcpResource } from "@/lib/oauth/config";
import { mcpSettingsFor } from "@/lib/oauth/server";
import { getSecurityStore } from "@/lib/security/store";
import { authClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/util/format";
import { wsConfigured } from "@/lib/ws/db";

export const metadata = { title: "Profiel en beveiliging" };

type Search = Record<string, string | string[] | undefined>;

export default async function OwnerProfilePage({ searchParams }: { searchParams: Promise<Search> }) {
  const owner = await requireOwner();
  const store = getSecurityStore();
  const [passkeys, settings, grants, clients] = await Promise.all([
    store.listPasskeys(owner.id),
    mcpSettingsFor(owner.id),
    store.listGrants(owner.id),
    store.listClients(),
  ]);
  let totpLinked: boolean | null = null;
  if (isSupabaseMode()) {
    const { data } = await (await authClient()).auth.mfa.listFactors();
    totpLinked = Boolean(data?.totp.some((f) => f.status === "verified"));
  }
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const now = new Date().toISOString();
  const activeGrants = grants.filter((g) => !g.revokedAt && g.refreshExpiresAt > now);
  const tools = allTools();
  const serverUrl = mcpResource();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="eyebrow">Beheer</p>
        <h1 className="mt-1 text-4xl">Profiel en beveiliging</h1>
        <p className="mt-2 text-sm text-muted">{owner.name} · {owner.email}</p>
      </div>
      <Notice searchParams={searchParams} />

      {/* Passkeys ------------------------------------------------------------------ */}
      <section id="passkeys" className="card scroll-mt-6 space-y-4 p-6">
        <div>
          <h2 className="text-2xl">Passkeys</h2>
          <p className="mt-2 text-sm text-muted">
            Inloggen zonder wachtwoord, met je vingerafdruk, gezicht of de pincode van je apparaat. Een passkey werkt alleen op deze website,
            dus een nepsite kan hem niet afvangen. Wie met een passkey inlogt, hoeft geen code uit de authenticator app meer te geven:
            de passkey is al beide stappen tegelijk.
          </p>
        </div>
        {passkeys.length > 0 && (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {passkeys.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <form action={renamePasskey} className="flex min-w-[12rem] flex-1 items-center gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <label className="sr-only" htmlFor={`pk-${p.id}`}>Naam</label>
                  <input id={`pk-${p.id}`} name="name" defaultValue={p.name} maxLength={60} className="input py-1" />
                  <SubmitButton className="btn-secondary px-3 py-1 text-xs">Opslaan</SubmitButton>
                </form>
                <div className="text-xs text-muted">
                  <p>Toegevoegd {formatDateTime(p.createdAt)}</p>
                  <p>{p.lastUsedAt ? `Laatst gebruikt ${formatDateTime(p.lastUsedAt)}` : "Nog niet gebruikt"}</p>
                </div>
                {p.backedUp && <Badge tone="success">Gesynchroniseerd</Badge>}
                <form action={removePasskey}>
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton className="text-xs text-bordeaux hover:underline" confirm={`Passkey "${p.name}" verwijderen?`}>Verwijderen</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <PasskeyRegister />
      </section>

      {totpLinked !== null && (
        <section className="card p-6">
          <h2 className="text-2xl">Tweestapsverificatie</h2>
          {totpLinked ? (
            <p className="mt-2 text-sm text-muted">Aan. Bij inloggen met je wachtwoord vragen we ook de code uit je authenticator app.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-muted">Uit. Koppel een authenticator app, of gebruik een passkey.</p>
              <Link href="/tweestaps?next=/beheer/profiel" className="btn-secondary mt-4">Authenticator app koppelen</Link>
            </>
          )}
        </section>
      )}

      {/* MCP -------------------------------------------------------------------------- */}
      <section id="mcp" className="card scroll-mt-6 space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-2xl">MCP: AI-assistent koppelen</h2>
          <Badge tone={settings.enabled ? "success" : "neutral"}>{settings.enabled ? "Aan" : "Uit"}</Badge>
        </div>
        <p className="text-sm text-muted">
          Met MCP (Model Context Protocol) kan een AI-assistent zoals Claude met jouw toestemming in de Academy en Your Wedding Space kijken
          en, als je dat toestaat, dingen voor je doen: openstaande feedback samenvatten, een conceptantwoord schrijven, je agenda en
          takenbord bijhouden. De app logt in via OAuth: je keurt elke verbinding zelf goed en kunt hem hier altijd verbreken.
        </p>

        <form action={saveMcpSettings} className="space-y-3">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="mt-0.5 h-4 w-4 accent-[#722F37]" />
            <span><strong>MCP aan</strong><span className="block text-xs text-muted">Uit: geen enkele app heeft toegang, ook niet met een eerder gegeven toestemming.</span></span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="allowWrite" defaultChecked={settings.allowWrite} className="mt-0.5 h-4 w-4 accent-[#722F37]" />
            <span><strong>Wijzigen toestaan</strong><span className="block text-xs text-muted">Feedback geven, toegang en notities aanpassen, taken, afspraken en antwoorden op vragen. Uit: apps kunnen alleen lezen.</span></span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="allowRegistration" defaultChecked={settings.allowRegistration} className="mt-0.5 h-4 w-4 accent-[#722F37]" />
            <span><strong>Apps mogen zich zelf aanmelden</strong><span className="block text-xs text-muted">Nodig voor Claude en de meeste apps (alleen de server-URL invullen). Aanmelden geeft nog geen toegang: dat doet pas jouw toestemming.</span></span>
          </label>
          <SubmitButton pendingText="Opslaan…">Opslaan</SubmitButton>
        </form>

        <div className="space-y-3 rounded-lg border border-line bg-cream/40 p-4">
          <CopyField id="mcpUrl" label="Server-URL" value={serverUrl} />
          <div className="text-sm text-muted">
            <p className="font-medium text-ink">Zo koppel je Claude</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>Zet MCP hierboven aan en sla op.</li>
              <li>Ga in Claude naar Instellingen, Connectors, en kies <em>Aangepaste connector toevoegen</em>.</li>
              <li>Vul de server-URL in en kies Verbinden.</li>
              <li>Je komt hier terug op het toestemmingsscherm: log in (met je passkey) en kies Toestaan.</li>
            </ol>
          </div>
        </div>

        <div>
          <h3 className="text-lg">Verbonden apps</h3>
          {activeGrants.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Nog geen verbindingen.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
              {activeGrants.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                  <div>
                    <p className="font-medium">{clientName.get(g.clientId) ?? "Onbekende app"}</p>
                    <p className="text-xs text-muted">
                      {g.scope.includes("write") ? "Lezen en wijzigen" : "Alleen lezen"} · verbonden {formatDateTime(g.createdAt)} ·{" "}
                      {g.lastUsedAt ? `laatst gebruikt ${formatDateTime(g.lastUsedAt)}` : "nog niet gebruikt"}
                    </p>
                  </div>
                  <form action={revokeGrant}>
                    <input type="hidden" name="grantId" value={g.id} />
                    <SubmitButton className="btn-secondary px-3 py-1 text-xs" confirm="Deze verbinding verbreken?">Verbreken</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>

        <details className="rounded-lg border border-line p-4">
          <summary className="cursor-pointer text-sm font-medium">Aangemelde apps ({clients.length})</summary>
          {clients.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nog geen apps aangemeld.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {clients.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs break-all text-muted">{c.source === "manual" ? "Handmatig" : "Zelf aangemeld"} · {c.redirectUris.join(", ")}</p>
                  </div>
                  <form action={deleteOAuthClient}>
                    <input type="hidden" name="clientId" value={c.id} />
                    <SubmitButton className="text-xs text-bordeaux hover:underline" confirm={`${c.name} en alle verbindingen verwijderen?`}>Verwijderen</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-3 text-sm text-muted">
              Kan een app zich niet zelf aanmelden? Maak hem hier aan en vul het client ID en secret in bij de geavanceerde instellingen van de app.
            </p>
            <ManualClientForm />
          </div>
        </details>

        <details className="rounded-lg border border-line p-4">
          <summary className="cursor-pointer text-sm font-medium">Beschikbare tools ({tools.length})</summary>
          {!wsConfigured() && <p className="mt-2 text-xs text-muted">De tools voor Your Wedding Space verschijnen zodra de database (DATABASE_URL) is ingesteld.</p>}
          <ul className="mt-3 space-y-2 text-sm">
            {tools.map((t) => (
              <li key={t.name}>
                <span className="font-medium">{t.title}</span>{" "}
                <Badge tone={t.scope === "write" ? "gold" : "neutral"}>{t.scope === "write" ? "wijzigen" : "lezen"}</Badge>
                <p className="text-xs text-muted">{t.description}</p>
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}
