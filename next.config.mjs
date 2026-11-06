// Plain JavaScript on purpose: the production image has no TypeScript
// (npm prune --omit=dev), and a next.config.ts would make Next try to
// install it on every start.

/** @type {import("next").NextConfig} */
const nextConfig = {
  experimental: {
    // Room for uploads (assignments and course material are capped at 10 MB).
    serverActions: { bodySizeLimit: "11mb" },
    // With Supabase every request passes the middleware, which by default only
    // passes on the first 10 MB of a body: a 10 MB upload plus the other form
    // fields would arrive cut off and the whole save would fail.
    middlewareClientMaxBodySize: "11mb",
  },
};

export default nextConfig;
