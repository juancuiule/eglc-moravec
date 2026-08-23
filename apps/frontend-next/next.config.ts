import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets this be reached from other devices on the local network by the
  // Pi's mDNS hostname (e.g. testing from a phone during local/self-hosted
  // deploy checks), not just localhost — the Next equivalent of Vite's
  // server.allowedHosts.
  allowedDevOrigins: ["raspberrypi.local"],
  // Don't auto-generate AGENTS.md/CLAUDE.md into the package.
  agentRules: false,
};

export default nextConfig;
