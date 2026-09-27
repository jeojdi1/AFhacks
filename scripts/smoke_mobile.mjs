#!/usr/bin/env node
// /m smoke check (docs/app-spec.md §2.10).
//
// Visits every phone route in headless Chrome at 390x844 and checks, on each:
//   - 0 console errors (and 0 uncaught page errors)
//   - no horizontal page scroll (scrollWidth <= innerWidth)
//   - every visible `button` and `a[role=button]` is at least 44x44 px
//
// Each route is visited twice: once before routing (empty program) and once after
// routing, so both the empty states and the real screens are covered.
//
// Usage (against a production build: `cd web && npm run build && npx next start -p 3220`):
//   node scripts/smoke_mobile.mjs --base http://localhost:3220 --mode fixtures
//   node scripts/smoke_mobile.mjs --base http://localhost:3220 --mode live --api http://localhost:8220
//
// Live mode resets the engine and then uploads + routes the demo parts list through the
// API, so point it at a throwaway engine (MUSTER_DB=...), never one you are recording from.
//
// Playwright is not a project dependency. The script resolves it from, in order:
// $PLAYWRIGHT_MODULE, a normal `playwright` import, then `npx playwright` in the npm cache.
// Chrome comes from $CHROME_PATH (default: the macOS Google Chrome app).

import { createRequire } from "node:module"
import { existsSync, mkdirSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"])
    return acc
  }, []),
)
const BASE = (args.base || "http://localhost:3000").replace(/\/+$/, "")
const MODE = args.mode === "live" ? "live" : "fixtures"
const API = (args.api || "http://localhost:8000").replace(/\/+$/, "")
const SHOTS = args.shots || null // optional directory for screenshots
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const MIN = 44

const ROUTES = [
  "/m",
  "/m/shops/syn-012",
  "/m/shops/syn-012/offers",
  "/m/shops/syn-012/offers/NG-021",
  "/m/shops/syn-012/certs",
  "/m/shops/syn-012/grow",
  "/m/shops/syn-012/grow/CWB_W47.1",
  "/m/prime",
  "/m/trainee/TP-01?seat=3",
  "/m/shops/syn-001/certs",
]

function loadPlaywright() {
  const req = createRequire(import.meta.url)
  const tries = []
  if (process.env.PLAYWRIGHT_MODULE) tries.push(process.env.PLAYWRIGHT_MODULE)
  tries.push("playwright")
  const npx = join(homedir(), ".npm", "_npx")
  try {
    for (const d of readdirSync(npx)) {
      const p = join(npx, d, "node_modules", "playwright")
      if (existsSync(p)) tries.push(p)
    }
  } catch {
    /* no npx cache */
  }
  for (const t of tries) {
    try {
      return req(t)
    } catch {
      /* try the next one */
    }
  }
  console.error("playwright not found: set PLAYWRIGHT_MODULE or run `npx playwright --version` once")
  process.exit(2)
}

function withQuery(path) {
  const q = MODE === "live" ? `mode=live&api=${encodeURIComponent(API)}` : "mode=fixtures"
  return `${BASE}${path}${path.includes("?") ? "&" : "?"}${q}`
}

async function engine(path) {
  const r = await fetch(API + path, { method: "POST" })
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status} ${await r.text()}`)
  return r.json()
}

async function measure(page) {
  return page.evaluate((min) => {
    const small = []
    for (const el of document.querySelectorAll('button, a[role="button"]')) {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue
      // Sonner toasts are transient overlays, not page controls.
      if (el.closest("[data-sonner-toaster]")) continue
      if (r.width < min - 0.5 || r.height < min - 0.5) {
        const label = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40)
        small.push(`${label} (${Math.round(r.width)}x${Math.round(r.height)})`)
      }
    }
    return {
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      small,
    }
  }, MIN)
}

async function visitAll(ctx, phase, results) {
  const page = await ctx.newPage()
  let errors = []
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 240))
  })
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 240)}`))
  for (const route of ROUTES) {
    errors = []
    await page.goto(withQuery(route), { waitUntil: "networkidle" })
    await page.waitForTimeout(900)
    const m = await measure(page)
    if (SHOTS) {
      const name = `${MODE}-${phase}-${route.replace(/[/?=]+/g, "_").replace(/^_/, "") || "m"}.png`
      await page.screenshot({ path: join(SHOTS, name), fullPage: true })
    }
    const fails = []
    if (errors.length) fails.push(`${errors.length} console error(s): ${errors.join(" | ")}`)
    if (m.sw > m.iw) fails.push(`horizontal scroll: scrollWidth ${m.sw} > innerWidth ${m.iw}`)
    if (m.small.length) fails.push(`${m.small.length} tap target(s) < ${MIN}px: ${m.small.join(", ")}`)
    results.push({ phase, route, ok: fails.length === 0, fails })
    console.log(`${fails.length ? "FAIL" : "PASS"} [${MODE}/${phase}] ${route}${fails.length ? "\n     " + fails.join("\n     ") : ""}`)
  }
  await page.close()
}

const { chromium } = loadPlaywright()
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const results = []
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  // Start every run from clean browser storage.
  const boot = await ctx.newPage()
  await boot.goto(withQuery("/m"))
  await boot.evaluate(() => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* storage blocked */
    }
  })
  await boot.close()

  // Phase 1: empty program.
  if (MODE === "live") await engine("/demo/reset")
  await visitAll(ctx, "empty", results)

  // Phase 2: routed program.
  if (MODE === "live") {
    await engine("/programs/northgate/parts?use_demo=true")
    await engine("/programs/northgate/route")
  } else {
    // Fixture mode keeps the demo stage in localStorage (store.tsx); drive the real UI once.
    const desk = await ctx.newPage()
    await desk.setViewportSize({ width: 1280, height: 800 })
    await desk.goto(withQuery("/program"), { waitUntil: "networkidle" })
    await desk.getByRole("button", { name: /Load Northgate demo parts list/ }).click()
    await desk.waitForFunction(
      () => {
        const b = [...document.querySelectorAll("button")].find((x) => /Route jobs/.test(x.textContent || ""))
        return b && !b.disabled
      },
      null,
      { timeout: 20000 },
    )
    await desk.getByRole("button", { name: "Route jobs" }).click()
    await desk.waitForTimeout(1500)
    await desk.close()
  }
  await visitAll(ctx, "routed", results)
  await ctx.close()
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\nsmoke_mobile [${MODE}]: ${results.length - failed.length}/${results.length} page checks pass`)
process.exit(failed.length ? 1 : 0)
