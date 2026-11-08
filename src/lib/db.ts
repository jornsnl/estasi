import "server-only";
import pg from "pg";

/**
 * The one Postgres pool of the app (DATABASE_URL: the Supabase session pooler
 * in production, a plain Postgres in development). The Academy (schema
 * public) and Your Wedding Space (schema wedding_space) share it.
 *
 * The search path is "wedding_space, public", so unqualified names resolve to
 * Wedding Space tables first. Academy queries therefore always name the
 * schema: `select * from public.users`, never `from users`. (Both schemas have
 * a table called files.)
 */

// Dates (type 1082) stay "YYYY-MM-DD" strings instead of turning into
// midnight-UTC Date objects that shift a day in Dutch time.
pg.types.setTypeParser(1082, (value: string) => value);

const state = globalThis as unknown as { __wsPool?: pg.Pool };

function connectionOptions(raw: string): pg.PoolConfig {
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  const connectionString = raw.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const host = new URL(connectionString).hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "" || host.startsWith("/");
  return {
    connectionString,
    ssl: local ? false : ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    application_name: "academy-wedding-space",
  };
}

export function pool(): pg.Pool {
  if (!state.__wsPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL ontbreekt: de app heeft de database nodig. Zie .env.example en de README.");
    const created = new pg.Pool(connectionOptions(url));
    // pg runs this before any other query on a new connection.
    created.on("connect", (client) => {
      client.query("set search_path to wedding_space, public").catch((err) => console.error(`[db] search_path: ${err.message}`));
    });
    state.__wsPool = created;
  }
  return state.__wsPool;
}

/** The pool or a client inside a transaction (from tx). */
export type Queryable = Pick<pg.Pool, "query"> | pg.PoolClient;

export async function query<T extends object>(sql: string, params: unknown[] = [], db: Queryable = pool()): Promise<T[]> {
  const result = await db.query(sql, params);
  return result.rows as T[];
}

export async function one<T extends object>(sql: string, params: unknown[] = [], db: Queryable = pool()): Promise<T | null> {
  const rows = await query<T>(sql, params, db);
  return rows[0] ?? null;
}

/** Runs fn in a transaction; everything is rolled back when it throws. */
export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids from URLs and forms: anything that is not a uuid simply does not exist. */
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
