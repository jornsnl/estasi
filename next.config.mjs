// Plain JavaScript on purpose: the production image has no TypeScript
// (npm prune --omit=dev), and a next.config.ts would make Next try to
// install it on every start.

/** @type {import("next").NextConfig} */
const nextConfig = {
  experimental: {
    // Room for uploads that come along with a form (capped at 10 MB). Wedding
    // Space uploads normally go straight from the browser to Supabase Storage.
    serverActions: { bodySizeLimit: "12mb" },
    // The middleware reads every request first and silently cuts the body off
    // above this size (default 10 MB), which broke uploads near the limit.
    middlewareClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
