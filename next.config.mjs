// Plain JavaScript on purpose: the production image has no TypeScript
// (npm prune --omit=dev), and a next.config.ts would make Next try to
// install it on every start.

/** @type {import("next").NextConfig} */
const nextConfig = {
  experimental: {
    // Room for uploads (assignments and course material are capped at 10 MB).
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
