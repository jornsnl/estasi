/** Same rules as src/lib/db.ts: TLS for remote hosts, verified when a CA is given. */
export function connectionOptions(raw) {
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  const connectionString = raw.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const host = new URL(connectionString).hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "" || host.startsWith("/");
  return {
    connectionString,
    ssl: local ? false : ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    application_name: "wedding-space-script",
  };
}
