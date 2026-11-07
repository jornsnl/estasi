import Link from "next/link";
import { redirect } from "next/navigation";
import { decideAuthorization } from "@/app/actions/oauth";
import { SubmitButton } from "@/components/SubmitButton";
import { currentSession } from "@/lib/auth/session";
import { SCOPE_LABELS } from "@/lib/oauth/config";
import { mcpSettingsFor, parseAuthorizeRequest } from "@/lib/oauth/server";

export const metadata = { title: "App verbinden" };
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

/**
 * OAuth consent screen. An MCP app (for example Claude) sends the owner
 * here; only after "Toestaan" does the app get a code for its tokens.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Search> }) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) params.set(key, value[0]);
  }
  const query = params.toString();
  const here = `/oauth/authorize?${query}`;

  const parsed = await parseAuthorizeRequest(params);
  if (!parsed.ok) {
    if ("redirect" in parsed) redirect(parsed.redirect);
    return <Problem text={parsed.screen} />;
  }

  const current = await currentSession();
  if (!current) redirect(`/login?next=${encodeURIComponent(here)}`);
  if (current.needsCode) redirect(`/tweestaps?next=${encodeURIComponent(here)}`);
  if (current.user.role !== "owner") return <Problem text="Alleen het beheeraccount kan apps verbinden." />;

  const settings = await mcpSettingsFor(current.user.id);
  if (!settings.enabled) {
    return (
      <Problem text="MCP staat uit. Zet MCP eerst aan op je profiel in het beheer en verbind de app daarna opnieuw.">
        <Link href="/beheer/profiel#mcp" className="btn-secondary mt-4">Naar profiel</Link>
      </Problem>
    );
  }

  const { client, redirectUri, scope } = parsed.value;
  const target = new URL(redirectUri);
  const wantsWrite = scope.includes("write");
  return (
    <>
      <h1 className="text-3xl">App verbinden</h1>
      <p className="mt-2 text-sm text-muted">
        <strong className="text-ink">{client.name}</strong> wil toegang tot de Academy en Your Wedding Space namens{" "}
        <strong className="text-ink">{current.user.name}</strong>.
      </p>
      <dl className="mt-4 space-y-1 rounded-lg border border-line bg-cream/50 p-3 text-xs text-muted">
        <div>
          <dt className="inline font-medium text-ink">Terug naar: </dt>
          <dd className="inline break-all">{target.protocol === "https:" || target.protocol === "http:" ? target.host : target.protocol}</dd>
        </div>
        {client.clientUri && (
          <div>
            <dt className="inline font-medium text-ink">Website: </dt>
            <dd className="inline break-all">{client.clientUri}</dd>
          </div>
        )}
        <div>
          <dt className="inline font-medium text-ink">Aangemeld: </dt>
          <dd className="inline">{client.source === "manual" ? "door jou, op je profiel" : "door de app zelf"}</dd>
        </div>
      </dl>
      <form action={decideAuthorization} className="mt-6 space-y-4">
        <input type="hidden" name="query" value={query} />
        <fieldset className="space-y-3">
          <legend className="label">De app mag</legend>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked disabled className="mt-0.5 h-4 w-4 accent-[#722F37]" />
            <span>{SCOPE_LABELS.read}</span>
          </label>
          {wantsWrite && (
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="write" defaultChecked={settings.allowWrite} disabled={!settings.allowWrite} className="mt-0.5 h-4 w-4 accent-[#722F37]" />
              <span>
                {SCOPE_LABELS.write}
                {!settings.allowWrite && <span className="block text-xs text-muted">Staat uit op je profiel: de app kan alleen lezen.</span>}
              </span>
            </label>
          )}
        </fieldset>
        <p className="text-xs text-muted">
          Verbind alleen apps die je zelf net hebt gekoppeld. Je kunt de verbinding altijd verbreken op je profiel in het beheer.
        </p>
        <div className="flex gap-3">
          <SubmitButton name="decision" value="allow" className="btn-primary flex-1" pendingText="Bezig…">Toestaan</SubmitButton>
          <SubmitButton name="decision" value="deny" className="btn-secondary flex-1">Weigeren</SubmitButton>
        </div>
      </form>
    </>
  );
}

function Problem({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <>
      <h1 className="text-3xl">App verbinden</h1>
      <p role="alert" className="mt-4 rounded-lg border border-bordeaux/30 bg-bordeaux-soft px-4 py-3 text-sm text-bordeaux">{text}</p>
      {children}
    </>
  );
}
