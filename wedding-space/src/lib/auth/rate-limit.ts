/**
 * Small in-memory limiter for failed sign-ins. Supabase limits per IP, but
 * every sign-in reaches Supabase from this server's IP, so brute force
 * protection per e-mail address and per visitor has to happen here.
 * Memory is per server instance, which is enough for one Render/Railway box.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const state = globalThis as unknown as { __wsLimits?: Map<string, Bucket> };
const buckets = () => (state.__wsLimits ??= new Map());

export interface Limit {
  max: number;
  windowMs: number;
}

export const LOGIN_PER_EMAIL: Limit = { max: 5, windowMs: 15 * 60_000 };
export const LOGIN_PER_IP: Limit = { max: 30, windowMs: 15 * 60_000 };
export const RESET_PER_IP: Limit = { max: 5, windowMs: 15 * 60_000 };

function live(key: string, now: number): Bucket | undefined {
  const bucket = buckets().get(key);
  if (bucket && bucket.resetAt <= now) {
    buckets().delete(key);
    return undefined;
  }
  return bucket;
}

export function isLimited(key: string, limit: Limit, now = Date.now()): boolean {
  return (live(key, now)?.count ?? 0) >= limit.max;
}

export function hit(key: string, limit: Limit, now = Date.now()) {
  const bucket = live(key, now);
  if (bucket) bucket.count += 1;
  else buckets().set(key, { count: 1, resetAt: now + limit.windowMs });
  // Keep memory bounded if someone sprays random addresses.
  if (buckets().size > 10_000) {
    for (const [k, b] of buckets()) if (b.resetAt <= now) buckets().delete(k);
  }
}

export function clear(key: string) {
  buckets().delete(key);
}
