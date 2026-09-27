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
  // Same-origin engine proxy: the browser calls /engine/* on the web server, which forwards to the
  // FastAPI engine on this machine. Lets a phone on the same Wi-Fi use the live engine with no CORS
  // or localhost problems (build with NEXT_PUBLIC_API_URL=/engine).
  async rewrites() {
    const engine = (process.env.MUSTER_ENGINE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    return [{ source: "/engine/:path*", destination: `${engine}/:path*` }];
  },
};

export default nextConfig;
