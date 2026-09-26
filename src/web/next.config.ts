import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // next dev must not write AGENTS.md and CLAUDE.md into the project.
  agentRules: false,
  // next dev serves its scripts only to allowed hosts; allow the host in AUTH_URL.
  allowedDevOrigins: process.env.AUTH_URL ? [new URL(process.env.AUTH_URL).hostname] : [],
  // Bootstrap 5.3 and Pulse use Sass features that Dart Sass now reports as deprecated.
  sassOptions: {
    silenceDeprecations: ["import", "global-builtin", "color-functions", "if-function"],
  },
  experimental: {
    serverActions: {
      // Above the 4 MB upload limit plus multipart overhead, so the CMS itself
      // rejects files between 4 MB and this limit with its own message.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
