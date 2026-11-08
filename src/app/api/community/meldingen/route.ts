import { timingSafeEqual } from "crypto";
import { processNotifications } from "@/lib/community/notify";

/**
 * Sends the bundled community mails that are due. The app also does this by
 * itself on page views and new messages; this is for a host that can call a
 * URL periodically (for example every 15 minutes), with
 *   Authorization: Bearer <COMMUNITY_CRON_SECRET>
 * Without COMMUNITY_CRON_SECRET (at least 16 characters) the endpoint is off.
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
  const result = await processNotifications();
  return Response.json(result ? { ok: true, sent: result } : { ok: true, busy: true });
}

export const GET = handle;
export const POST = handle;
