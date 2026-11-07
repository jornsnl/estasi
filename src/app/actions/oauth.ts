"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/academy";
import { requireOwner } from "@/lib/auth/session";
import { issuer } from "@/lib/oauth/config";
import { issueCode, mcpSettingsFor, parseAuthorizeRequest } from "@/lib/oauth/server";
import type { OAuthScope } from "@/lib/security/types";

/** The owner's answer on the consent screen of /oauth/authorize. */
export async function decideAuthorization(formData: FormData) {
  const owner = await requireOwner();
  const query = String(formData.get("query") ?? "").slice(0, 8000);
  const parsed = await parseAuthorizeRequest(new URLSearchParams(query));
  if (!parsed.ok) {
    if ("redirect" in parsed) redirect(parsed.redirect);
    redirect(`/oauth/authorize?${query}`);
  }
  const request = parsed.value;
  const url = new URL(request.redirectUri);
  if (request.state) url.searchParams.set("state", request.state);
  url.searchParams.set("iss", issuer());

  const settings = await mcpSettingsFor(owner.id);
  if (formData.get("decision") !== "allow" || !settings.enabled) {
    url.searchParams.set("error", "access_denied");
    url.searchParams.set("error_description", "The owner did not allow this connection.");
    redirect(url.toString());
  }
  const scope: OAuthScope[] = ["read"];
  if (request.scope.includes("write") && settings.allowWrite && formData.get("write") === "on") scope.push("write");
  url.searchParams.set("code", await issueCode(request, owner, scope));
  await audit(owner, "MCP-app verbonden", `${request.client.name} (${scope.join(", ")})`);
  redirect(url.toString());
}
