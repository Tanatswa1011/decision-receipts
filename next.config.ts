import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages read the synthetic records, saved runs and the live snapshot from disk at request
  // time, so make sure a serverless deploy (e.g. Vercel) bundles them with every route.
  outputFileTracingIncludes: {
    "/**": ["./data/**/*", "./runs/*.json", "./labels/*.json", "./config/**/*", "./docs/results.md"],
  },
};

export default nextConfig;
