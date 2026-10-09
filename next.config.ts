import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SENTRY_SERVER_ENABLED: process.env.SENTRY_DSN ? "true" : "false",
  },
};

export default nextConfig;
