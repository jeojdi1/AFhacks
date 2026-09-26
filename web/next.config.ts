import path from "node:path";
import type { NextConfig } from "next";

// Repo root (one level above /web). Widening the Turbopack root lets app code
// import shared JSON from outside /web, e.g. `@fixtures/programs.json` or
// `../data/fixtures/*.json`. outputFileTracingRoot must match turbopack.root.
const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  turbopack: {
    root: repoRoot,
  },
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
