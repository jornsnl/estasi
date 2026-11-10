// Plain JavaScript on purpose: the production image has no TypeScript
// (npm prune --omit=dev), and a next.config.ts would make Next try to
// install it on every start.

/** @type {import("next").NextConfig} */
const nextConfig = {
  experimental: {
    // Room for uploads that come along with a form (10 MB per file, also in
    // Academy assignments; photos are made smaller in the browser first, see
    // src/components/PhotoInput.tsx. 30 MB, so a large photo without that step
    // gets the message "groter dan 10 MB" instead of a crash, feedback Sabine;
    // Academy assignments, see UPLOAD_KINDS in src/lib/domain/assignment.ts;
    // videos are YouTube or Vimeo links, not uploads), plus the rest of the
    // form. Wedding Space uploads normally go straight from the browser to
    // Supabase Storage.
    serverActions: { bodySizeLimit: "30mb" },
    // The middleware reads every request first and silently cuts the body off
    // above this size (default 10 MB), which broke uploads near the limit.
    middlewareClientMaxBodySize: "30mb",
  },
};

export default nextConfig;
