import path from "node:path";
import type { NextConfig } from "next";

// Repo root (one level above /web). Widening the Turbopack root lets app code
// import shared JSON from outside /web, e.g. `@fixtures/programs.json` or
// `../data/fixtures/*.json`. outputFileTracingRoot must match turbopack.root.
const repoRoot = path.join(__dirname, "..");

// GitHub Pages build (scripts/build_pages.sh): a static export of the demo-data version, served
// under https://jeojdi1.github.io/AFhacks/. No engine, no proxy, no server routes.
const pages = process.env.PAGES_EXPORT === "1";
const pagesBase = process.env.PAGES_BASE_PATH ?? "/AFhacks";

const nextConfig: NextConfig = {
  turbopack: {
    root: repoRoot,
  },
  outputFileTracingRoot: repoRoot,
  ...(pages
    ? {
        output: "export" as const,
        basePath: pagesBase,
        trailingSlash: true,
        images: { unoptimized: true },
        // The normal build and `tsc --noEmit` already type-check; skipping it here avoids stale
        // .next/dev types that reference the server-only /api/lan route (moved aside for export).
        typescript: { ignoreBuildErrors: true },
        env: { NEXT_PUBLIC_BASE_PATH: pagesBase },
      }
    : {}),
  // Same-origin engine proxy: the browser calls /engine/* on the web server, which forwards to the
  // FastAPI engine on this machine. Lets a phone on the same Wi-Fi use the live engine with no CORS
  // or localhost problems (build with NEXT_PUBLIC_API_URL=/engine).
  ...(pages ? {} : { rewrites }),
};

async function rewrites() {
  const engine = (process.env.MUSTER_ENGINE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
  return [{ source: "/engine/:path*", destination: `${engine}/:path*` }];
}

export default nextConfig;
