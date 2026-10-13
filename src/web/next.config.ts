import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // next dev must not write AGENTS.md and CLAUDE.md into the project.
  agentRules: false,
  // next dev serves its scripts only to allowed hosts; allow the host in AUTH_URL.
  allowedDevOrigins: process.env.AUTH_URL ? [new URL(process.env.AUTH_URL).hostname] : [],
  experimental: {
    serverActions: {
      // Above the 16 MB screenshot limit plus multipart overhead, so the CMS
      // itself rejects larger files (and zips over 4 MB) with its own message.
      bodySizeLimit: "17mb",
    },
  },
};

export default nextConfig;
