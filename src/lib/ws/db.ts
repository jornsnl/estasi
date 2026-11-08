import "server-only";

/**
 * Your Wedding Space talks to Postgres directly, schema wedding_space. The
 * pool itself is shared with the Academy and lives in src/lib/db.ts.
 */
export { isUuid, one, pool, query, tx } from "@/lib/db";

/** All Wedding Space tables live in this schema. */
export const SCHEMA = "wedding_space";

export const wsConfigured = () => Boolean(process.env.DATABASE_URL);
