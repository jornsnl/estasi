// Plain JavaScript: the production image has no TypeScript (npm prune --omit=dev).
import path from "path";
import { fileURLToPath } from "url";

/** @type {import("next").NextConfig} */
const nextConfig = {
  // This app lives in a subfolder of the Academy repository; it is its own root.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  experimental: {
    // Room for uploads (documents and meeting summaries are capped at 10 MB).
    serverActions: { bodySizeLimit: "11mb" },
  },
  // pg loads optional native modules; keep it out of the bundle.
  serverExternalPackages: ["pg", "nodemailer"],
};

export default nextConfig;
