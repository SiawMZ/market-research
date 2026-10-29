import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in the user folder makes Next guess the wrong root; pin it to this project.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
