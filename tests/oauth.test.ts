import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { basicCredentials, isAllowedRedirectUri, pkceMatches, redirectUriMatches } from "@/lib/oauth/pure";

describe("PKCE S256", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  it("accepts the matching verifier", () => {
    expect(pkceMatches(verifier, challenge)).toBe(true);
  });
  it("rejects another verifier, a short one and an empty one", () => {
    expect(pkceMatches(`${verifier}x`, challenge)).toBe(false);
    expect(pkceMatches("kort", createHash("sha256").update("kort").digest("base64url"))).toBe(false);
    expect(pkceMatches("", challenge)).toBe(false);
  });
});

describe("redirect URIs", () => {
  it("allows https, loopback http and app schemes", () => {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:6274/oauth/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:33418/callback")).toBe(true);
    expect(isAllowedRedirectUri("cursor://anysphere.cursor-retrieval/oauth/callback")).toBe(true);
  });
  it("refuses plain http elsewhere, script schemes and fragments", () => {
    expect(isAllowedRedirectUri("http://example.com/callback")).toBe(false);
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectUri("data:text/html,hoi")).toBe(false);
    expect(isAllowedRedirectUri("https://claude.ai/callback#x")).toBe(false);
    expect(isAllowedRedirectUri("geen url")).toBe(false);
  });
  it("matches exactly, except the port of a loopback redirect", () => {
    const registered = ["https://claude.ai/api/mcp/auth_callback", "http://127.0.0.1/callback"];
    expect(redirectUriMatches(registered, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectUriMatches(registered, "https://claude.ai/api/mcp/auth_callback/")).toBe(false);
    expect(redirectUriMatches(registered, "https://evil.example/api/mcp/auth_callback")).toBe(false);
    expect(redirectUriMatches(registered, "http://127.0.0.1:51234/callback")).toBe(true);
    expect(redirectUriMatches(registered, "http://127.0.0.1:51234/andere")).toBe(false);
    expect(redirectUriMatches(registered, "http://localhost:51234/callback")).toBe(false);
  });
});

describe("client credentials", () => {
  it("reads an Authorization: Basic header", () => {
    const header = `Basic ${Buffer.from("wpa_c_abc:geheim:met:dubbele").toString("base64")}`;
    expect(basicCredentials(header)).toEqual({ id: "wpa_c_abc", secret: "geheim:met:dubbele" });
    expect(basicCredentials("Bearer x")).toBeNull();
    expect(basicCredentials(null)).toBeNull();
  });
});
