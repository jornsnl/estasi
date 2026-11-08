import "server-only";
import { sendNotification, setVapidDetails } from "web-push";
import { query } from "@/lib/db";

/**
 * Web Push (pushmeldingen) through the service worker of the app
 * (public/beheer-sw.js). Needs a VAPID key pair in the environment:
 *   npx web-push generate-vapid-keys
 * gives VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY; VAPID_SUBJECT is a mailto:
 * address. Without the keys nothing is pushed and only e-mail goes out.
 */

const clean = (value: string | undefined) => (value ?? "").trim().replace(/^["']|["']$/g, "");

export const vapidPublicKey = () => clean(process.env.VAPID_PUBLIC_KEY);

export const pushConfigured = () => Boolean(vapidPublicKey() && clean(process.env.VAPID_PRIVATE_KEY));

let configured = false;
function setup(): boolean {
  if (!pushConfigured()) return false;
  if (!configured) {
    const subject = clean(process.env.VAPID_SUBJECT) || `mailto:${clean(process.env.CONTACT_EMAIL) || "academy@estasiweddings.nl"}`;
    setVapidDetails(subject, vapidPublicKey(), clean(process.env.VAPID_PRIVATE_KEY));
    configured = true;
  }
  return true;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Path inside the app, opened when the notification is tapped. */
  url: string;
  /** Same tag replaces the previous notification instead of stacking them. */
  tag: string;
}

interface Subscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Sends to every device of these people; subscriptions the push service no longer knows are removed. */
export async function pushTo(userIds: string[], message: PushMessage): Promise<number> {
  if (userIds.length === 0 || !setup()) return 0;
  const subscriptions = await query<Subscription>(
    `select id, endpoint, p256dh, auth from public.push_subscriptions where user_id = any($1::uuid[])`,
    [userIds],
  );
  // A path, not a full address: the service worker opens it on its own origin.
  const payload = JSON.stringify(message);
  let sent = 0;
  await Promise.all(
    subscriptions.map(async (s) => {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
        sent++;
        await query(`update public.push_subscriptions set last_used_at = now() where id = $1`, [s.id]);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await query(`delete from public.push_subscriptions where id = $1`, [s.id]);
        } else {
          console.error(`[push] versturen mislukt (${status ?? "?"}): ${(err as Error).message}`);
        }
      }
    }),
  );
  return sent;
}
