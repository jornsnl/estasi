// Plain JavaScript on purpose: the production image has no TypeScript
// (npm prune --omit=dev), and a next.config.ts would make Next try to
// install it on every start.

/** @type {import("next").NextConfig} */
const nextConfig = {
  experimental: {
    // Room for uploads that come along with a form (10 MB; a video in an
    // Academy assignment up to 50 MB, see UPLOAD_KINDS in
    // src/lib/domain/assignment.ts). Wedding Space uploads normally go
    // straight from the browser to Supabase Storage.
    serverActions: { bodySizeLimit: "52mb" },
    // The middleware reads every request first and silently cuts the body off
    // above this size (default 10 MB), which broke uploads near the limit.
    middlewareClientMaxBodySize: "52mb",
  },
};

export default nextConfig;
