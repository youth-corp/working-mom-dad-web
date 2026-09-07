import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_PERFORMANCE_RELEASE:
      process.env.NEXT_PUBLIC_PERFORMANCE_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      "unknown",
    NEXT_PUBLIC_PERFORMANCE_ENVIRONMENT:
      process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
  },
};

export default nextConfig;
