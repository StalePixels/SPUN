import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// SPUN's version, built into the CMS. The Docker build puts the file at the same place beside the app.
export const SPUN_VERSION = readFileSync(path.join(process.cwd(), "..", "client", "VERSION"), "utf8").trim();

const nextConfig: NextConfig = {
  output: "standalone",
  env: { SPUN_VERSION },
  // next dev must not write AGENTS.md and CLAUDE.md into the project.
  agentRules: false,
  // next dev serves its scripts only to allowed hosts; allow the host in AUTH_URL.
  allowedDevOrigins: process.env.AUTH_URL ? [new URL(process.env.AUTH_URL).hostname] : [],
  // A page in a frame could trick a user into clicking Allow.
  async headers() {
    return [
      {
        source: "/oauth/authorize",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Above the largest zip a user can have as an own limit
      // (UPLOAD_LIMIT_MB_MAX in src/lib/rules.ts) plus multipart overhead,
      // so the CMS itself rejects larger files with its own message.
      bodySizeLimit: "81mb",
    },
  },
};

export default nextConfig;
