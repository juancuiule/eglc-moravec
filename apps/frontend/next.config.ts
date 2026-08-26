import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets this be reached from other devices on the local network by the
  // Pi's mDNS hostname (e.g. testing from a phone during local/self-hosted
  // deploy checks), not just localhost — the Next equivalent of Vite's
  // server.allowedHosts.
  allowedDevOrigins: ["raspberrypi.local"],
  // Don't auto-generate AGENTS.md/CLAUDE.md into the package.
  agentRules: false,
  // A minimal, self-contained production server (Dockerfile's runtime
  // stage) instead of shipping the full node_modules tree.
  output: "standalone",
  // engine is consumed as TS source in dev (see its "development" export
  // condition) so edits to packages/engine/src hot-reload here directly,
  // with no build step for engine in dev.
  transpilePackages: ["engine"],
  // This app lives in a pnpm workspace and depends on packages/engine —
  // trace file dependencies from the monorepo root so the standalone
  // output includes that workspace package, not just this app's own dir.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
};

export default nextConfig;
