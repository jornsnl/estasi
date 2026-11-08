import { timingSafeEqual } from "crypto";
import { processExpiryNotices } from "@/lib/academy-expiry";

/**
 * Sends the mails 30 and 7 days before access ends. The app also does this by
 * itself on page views (at most once an hour); this is for a host that can
 * call a URL periodically (for example once a day), with
 *   Authorization: Bearer <COMMUNITY_CRON_SECRET>
 * (the same secret as /api/community/meldingen). Without it (at least 16
 * characters) the endpoint is off.
 */
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = (process.env.COMMUNITY_CRON_SECRET ?? "").trim();
  if (secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const given = Buffer.from(header.replace(/^Bearer\s+/i, "").trim());
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function handle(request: Request) {
  if (!authorised(request)) return new Response("Geen toegang", { status: 401 });
  const result = await processExpiryNotices(new Date(), true);
  return Response.json(result ? { ok: true, mailed: result.mailed } : { ok: true, busy: true });
}

export const GET = handle;
export const POST = handle;
