import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Room for uploads (assignments and course material are capped at 10 MB).
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
