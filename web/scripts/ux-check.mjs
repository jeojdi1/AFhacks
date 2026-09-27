#!/usr/bin/env node
// Desktop UX acceptance checks (docs/ux-simplification.md §9.4, automated part).
//
// Drives the desktop story in headless Chrome, in ?mode=fixtures with the engine (:8000 and
// --block) blocked, at 1280x720:
//   /  → Start the demo → /program → /scorecard → /gaps → Fund training (fixtures only)
//   → /scorecard (after) → /shops/syn-012 → /network → /shops/pub-001
// then repeats every page with Story mode off (?story=0) for the §10.2 labels, and at 390 px
// for horizontal scroll and the current step pill.
//
// Checks (numbered as in §9.4):
//   1  [data-story-banner] visible, bottom <= 720 px (story pages + directory)
//   2  exactly one [aria-current="step"] on story pages, none on /network and /shops/pub-*;
//      nothing in the story bar is brand red
//   3  no bare acronym (ITB|SMB|SME|CCV|CGP|CWB|CPCSC|NAICS) in visible text, except inside
//      abbr/<Term>, right after "(" (plain label first), or an allow-listed phrase
//   4  retired strings absent in Story mode
//   5  numbers unchanged (36, 4, $36.1M, 90%, 22 / $57.5M, 11.5%, 36% / after: $67.1M, 13.4%,
//      +$480K, +$9.1M / gaps: $96K, $480K, $5.1M, $9.1M + the exact fund headline)
//   6  /?mode=fixtures stays on / with "Demo data"; after Start the demo the URL keeps mode=fixtures
//   7  /gaps before funding: the Fund training button's bottom <= 720 px
//   8  scorecard: 13.4% sits where 11.5% sat (±2 px); multiplier chart at final width by 600 ms
//   9  390 px: scrollWidth <= innerWidth on every page; current step pill inside the viewport
//   10 §10.2 labels present on their screens in both Story modes
//
// Usage (against a production build on YOUR port; never the live demo's 3000/8000):
//   cd web && npm run build && npx next start -p 3301
//   node web/scripts/ux-check.mjs --base http://localhost:3301 [--shots <dir>] [--only 1,2,5]
//
// Fixtures mode only touches this browser's storage: nothing is sent to any engine.
// Playwright is not a project dependency: $PLAYWRIGHT_MODULE, `playwright`, then the npx cache.
// Chrome: $CHROME_PATH (default: the macOS Google Chrome app). Exit code 1 if any check fails.

import { createRequire } from "node:module"
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "1"])
    return acc
  }, [])
)
if (!args.base) {
  console.error("usage: node web/scripts/ux-check.mjs --base http://localhost:<your-port> [--shots dir] [--only 1,2,...]")
  process.exit(2)
}
const BASE = args.base.replace(/\/+$/, "")
const SHOTS = args.shots || null
const ONLY = args.only ? new Set(String(args.only).split(",").map((s) => Number(s.trim()))) : null
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const BLOCK = [/localhost:8000/, /127\.0\.0\.1:8000/, ...(args.block ? [new RegExp(args.block)] : [])]
const BRAND_RED = "rgb(180, 35, 24)" // --brand #b42318

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, "..", "..", "data", "fixtures")
function fixture(name) {
  try {
    return JSON.parse(readFileSync(join(FIXTURES, name), "utf8"))
  } catch {
    return null
  }
}
const FUND_HEADLINE = fixture("fund_TP-01.json")?.headline ?? "$96K training → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)"
const DEMO_SHOP = fixture("index.json")?.demo_shop_id ?? "syn-012"

const ACRONYM = /\b(ITB|SMB|SME|CCV|CGP|CWB|CPCSC|NAICS)\b/g
const ALLOW = [
  "Simplified ITB rules for demo",
  "Canada's ITB rule, simplified for this demo",
  "ITB model terms",
  "ITB is run by the Defence Investment Agency",
  FUND_HEADLINE,
  "CSA W47.1",
  // §5.5 keeps the shop's readiness heading verbatim for the video (CWB W47.1 has a tooltip).
  "Get CWB W47.1",
]
const RETIRED = [
  "Demo mode · fixtures",
  "Claude (cached)",
  "PRIME SIDE",
  "SHOP SIDE",
  "Program: Northgate work package",
  "Gaps & Training",
  "ITB Scorecard",
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

// ---------------------------------------------------------------------------
// Results

const results = []
function record(check, where, ok, detail = "") {
  if (ONLY && !ONLY.has(check)) return
  results.push({ check, where, ok, detail })
  const tag = ok === "warn" ? "WARN" : ok ? "PASS" : "FAIL"
  console.log(`${tag} #${check} ${where}${detail ? ` — ${detail}` : ""}`)
}

function url(path, extra = "") {
  const [p, hash] = path.split("#")
  const q = `mode=fixtures${extra ? `&${extra}` : ""}`
  return `${BASE}${p}${p.includes("?") ? "&" : "?"}${q}${hash ? `#${hash}` : ""}`
}

async function settle(page, ms = 1200) {
  await page.waitForLoadState("load")
  await page.waitForTimeout(ms)
}

async function shot(page, name) {
  if (!SHOTS) return
  await page.screenshot({ path: join(SHOTS, `${name.replace(/[^a-z0-9_-]+/gi, "_")}.png`) })
}

// ---------------------------------------------------------------------------
// In-page probes

/** Visible text of the page (not toasts, not sr-only, not collapsed/hidden). */
async function visibleText(page) {
  return page.evaluate(() => {
    const out = []
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement
      if (!el || !n.textContent.trim()) continue
      if (el.closest("script,style,noscript,[data-sonner-toaster],[hidden],[aria-hidden='true']")) continue
      const r = el.getBoundingClientRect()
      if (r.width <= 1 || r.height <= 1) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue
      if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue
      out.push(n.textContent)
    }
    return out.join(" ").replace(/\s+/g, " ")
  })
}

async function bareAcronyms(page, allow) {
  return page.evaluate(
    ({ src, allow }) => {
      const re = new RegExp(src, "g")
      const bad = []
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const el = n.parentElement
        if (!el) continue
        if (el.closest("script,style,noscript,[data-sonner-toaster],[hidden],[aria-hidden='true'],abbr,[data-term]")) continue
        const r = el.getBoundingClientRect()
        if (r.width <= 1 || r.height <= 1) continue
        if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue
        // Judge against the enclosing block's text so allow-listed phrases split across nodes still match.
        const block = el.closest("p,li,td,th,h1,h2,h3,h4,button,a,label,span,div") ?? el
        let ctx = (block.textContent || "").replace(/\s+/g, " ")
        for (const a of allow) ctx = ctx.split(a).join(" ".repeat(a.length))
        ctx = ctx.replace(/\b(TP|NG)-\d+\b/g, (m) => " ".repeat(m.length))
        let m
        re.lastIndex = 0
        while ((m = re.exec(ctx))) {
          const before = ctx.slice(0, m.index)
          // "plain label (ACRONYM)" / "(CWB W47.1)": allowed right after "(" with a label before it.
          if (/\S\s*\($/.test(before)) continue
          const snippet = ctx.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).trim()
          bad.push(snippet)
        }
      }
      return [...new Set(bad)].slice(0, 12)
    },
    { src: ACRONYM.source, allow }
  )
}

async function storyBarRed(page, red) {
  return page.evaluate((red) => {
    const bar = document.querySelector("[data-story-bar]")
    if (!bar) return ["(no [data-story-bar])"]
    const hits = []
    for (const el of [bar, ...bar.querySelectorAll("*")]) {
      const cs = getComputedStyle(el)
      for (const prop of ["color", "backgroundColor", "borderTopColor", "fill", "stroke"]) {
        if (cs[prop] === red) hits.push(`${el.tagName.toLowerCase()}.${prop}: ${(el.textContent || "").trim().slice(0, 30)}`)
      }
    }
    return hits.slice(0, 5)
  }, red)
}

async function boxOf(page, selector) {
  const loc = page.locator(selector).first()
  if (!(await loc.count())) return null
  if (!(await loc.isVisible())) return null
  return loc.boundingBox()
}

/** Top of the first element in <main> whose own text is exactly `text` (not the story bar). */
async function topOfText(page, text) {
  return page.evaluate((text) => {
    const main = document.querySelector("main") ?? document.body
    for (const el of main.querySelectorAll("*")) {
      if (el.children.length) continue
      if ((el.textContent || "").trim() === text) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) return r.top + window.scrollY
      }
    }
    return null
  }, text)
}

/** Widths of the multiplier chart's bars (hook [data-mult-bar], else the chart's svg paths/rects). */
async function chartWidths(page) {
  return page.evaluate(() => {
    const hooked = [...document.querySelectorAll("[data-mult-bar]")]
    const els = hooked.length
      ? hooked
      : [
          ...document.querySelectorAll(
            "[data-multiplier-chart] path, [data-multiplier-chart] rect, [data-testid^='multiplier'] path, [data-testid^='multiplier'] rect, [data-testid^='multiplier'] [style*='width']"
          ),
        ]
    return { hooked: hooked.length > 0, widths: els.map((e) => Math.round(e.getBoundingClientRect().width)) }
  })
}

// ---------------------------------------------------------------------------
// Per-page assertions

const STORY_PAGES = new Set(["/program", "/scorecard", "/gaps", `/shops/${DEMO_SHOP}`])
const DIRECTORY_PAGES = new Set(["/network", "/shops/pub-001"])

const NUMBERS = {
  "/program": ["36", "4", "$36.1M", "90%", "22"],
  "/scorecard": ["$57.5M", "11.5%", "36%"],
  "/scorecard@funded": ["$67.1M", "13.4%", "+$480K", "+$9.1M"],
  "/gaps": ["$96K", "$480K", "$5.1M", "$9.1M"],
  "/gaps@funded": [FUND_HEADLINE],
}

const LABELS = {
  all: ["fictional", "Simplified ITB rules for demo", "Data: Statistics Canada ODBus (Open Government Licence)"],
  "/program": ["Synthetic", "never stores drawings"],
  "/scorecard": ["Simplified ITB rules for demo", "assumption"],
  // §10.2 "example (not affiliated)"; §5.4 and the demo script write "(example, not affiliated)".
  "/gaps": [["example (not affiliated)", "example, not affiliated"], "assumption"],
  [`/shops/${DEMO_SHOP}`]: ["Synthetic"],
  "/network": ["Synthetic", "public data"],
  "/shops/pub-001": ["Public data — unverified — not affiliated"],
}

function hasToken(text, token) {
  if (/^\d+$/.test(token)) return new RegExp(`(^|[^\\d.,$])${token}([^\\d.,%]|$)`).test(text)
  return text.includes(token)
}

async function checkPage(page, path, { stage, story }) {
  const where = `${path}${stage === "funded" ? " (funded)" : ""}${story ? "" : " [story off]"}`
  const text = await visibleText(page)

  if (story) {
    // 1
    if (STORY_PAGES.has(path) || DIRECTORY_PAGES.has(path)) {
      const b = await boxOf(page, "[data-story-banner]")
      record(1, where, !!b && b.y + b.height <= 720, b ? `banner bottom ${Math.round(b.y + b.height)} px` : "no visible [data-story-banner]")
    }
    // 2
    const cur = await page.locator('[aria-current="step"]').count()
    if (STORY_PAGES.has(path)) record(2, where, cur === 1, `${cur} current step(s)`)
    if (DIRECTORY_PAGES.has(path)) record(2, where, cur === 0, `${cur} current step(s)`)
    const red = await storyBarRed(page, BRAND_RED)
    record(2, `${where} story bar colour`, red.length === 0, red.length ? `brand red: ${red.join("; ")}` : "no brand red")
    // 3
    const bare = await bareAcronyms(page, ALLOW)
    record(3, where, bare.length === 0, bare.length ? `bare acronyms: ${bare.map((s) => `"${s}"`).join(" | ")}` : "")
    // 4
    const found = RETIRED.filter((s) => text.toLowerCase().includes(s.toLowerCase()))
    record(4, where, found.length === 0, found.length ? `found: ${found.join(", ")}` : "")
    // 5
    const after = stage === "funded" ? NUMBERS[`${path}@funded`] : null
    // Gaps after funding keeps its before numbers and adds the headline; the scorecard swaps them.
    const want = after ? (path === "/gaps" ? [...NUMBERS[path], ...after] : after) : (NUMBERS[path] ?? [])
    if (want.length) {
      const missing = want.filter((t) => !hasToken(text, t))
      record(5, where, missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : want.join(" "))
    }
  }
  // 10 (both Story modes)
  const labels = [...LABELS.all, ...(LABELS[path] ?? [])]
  const lower = text.toLowerCase()
  // A label may be a list of accepted spellings (any one passes).
  const missingLabels = labels.filter((l) => ![l].flat().some((v) => lower.includes(v.toLowerCase())))
  record(10, where, missingLabels.length === 0, missingLabels.length ? `missing: ${missingLabels.map((l) => [l].flat()[0]).join(" | ")}` : "")
}

// ---------------------------------------------------------------------------
// Flow

const { chromium } = loadPlaywright()
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
for (const re of BLOCK) await ctx.route(re, (r) => r.abort())
const page = await ctx.newPage()
const pageErrors = []
page.on("pageerror", (e) => pageErrors.push(`${page.url()}: ${e.message.slice(0, 200)}`))

try {
  // 6: landing keeps ?mode and reads "Demo data"
  await page.goto(`${BASE}/?mode=fixtures`)
  await settle(page, 1500)
  await shot(page, "01-landing")
  const landed = new URL(page.url())
  const pill = await page.getByText("Demo data", { exact: true }).first().isVisible().catch(() => false)
  record(6, "/?mode=fixtures", landed.pathname === "/" && pill, `landed on ${landed.pathname}${landed.search}; pill "Demo data" ${pill ? "shown" : "missing"}`)

  // Start the demo (landing), else fall back to Load + Match on /program so later checks still run.
  const start = page.locator("[data-run-demo]", { hasText: /Start the demo/ }).first()
  if (landed.pathname === "/" && (await start.count())) {
    await start.click()
    await page.waitForURL(/\/program/, { timeout: 20000 }).catch(() => {})
    await settle(page, 800)
    record(6, "after Start the demo", page.url().includes("mode=fixtures") && page.url().includes("/program"), page.url().replace(BASE, ""))
  } else {
    record(6, "after Start the demo", false, "no Start the demo button on /; falling back to Load + Match on /program")
    await page.goto(url("/program"))
    await settle(page)
    const load = page.getByRole("button", { name: /Load Northgate/ }).first()
    if (await load.count()) {
      await load.click()
      await page.getByRole("button", { name: /Match jobs|Route/ }).first().waitFor({ timeout: 15000 }).catch(() => {})
    }
    const match = page.getByRole("button", { name: /Match jobs to shops|Route jobs/ }).first()
    if (await match.count()) await match.click()
    await page.waitForTimeout(3500)
  }

  // /program (routed)
  await page.goto(url("/program"))
  await settle(page)
  await shot(page, "02-program-routed")
  await checkPage(page, "/program", { stage: "routed", story: true })

  // /scorecard (before funding)
  await page.goto(url("/scorecard"))
  await settle(page, 1500)
  await shot(page, "03-scorecard")
  await checkPage(page, "/scorecard", { stage: "routed", story: true })
  const topBefore = await topOfText(page, "11.5%")

  // /gaps (before funding) + 7
  await page.goto(url("/gaps"))
  await settle(page)
  await shot(page, "04-gaps")
  await checkPage(page, "/gaps", { stage: "routed", story: true })
  const fundBtn = page.getByRole("button", { name: /^Fund training$/ }).first()
  const fb = (await fundBtn.count()) ? await fundBtn.boundingBox() : null
  record(7, "/gaps", !!fb && fb.y + fb.height <= 720, fb ? `Fund training bottom ${Math.round(fb.y + fb.height)} px` : "no Fund training button")

  // Fund TP-01 (fixtures only)
  if (fb) {
    await fundBtn.click()
    await page.getByText(FUND_HEADLINE, { exact: false }).first().waitFor({ timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1200)
    await shot(page, "05-fund-moment")
    await checkPage(page, "/gaps", { stage: "funded", story: true })
  }

  // /scorecard after funding + 8
  await page.goto(url("/scorecard"))
  await page.waitForLoadState("load")
  await page.waitForTimeout(600)
  const early = await chartWidths(page)
  await page.waitForTimeout(1600)
  const late = await chartWidths(page)
  await shot(page, "06-scorecard-funded")
  await checkPage(page, "/scorecard", { stage: "funded", story: true })
  const topAfter = await topOfText(page, "13.4%")
  record(
    8,
    "/scorecard 11.5% → 13.4% position",
    topBefore !== null && topAfter !== null && Math.abs(topBefore - topAfter) <= 2,
    `11.5% top ${topBefore === null ? "not found" : Math.round(topBefore)} · 13.4% top ${topAfter === null ? "not found" : Math.round(topAfter)}`
  )
  if (!early.widths.length) record(8, "/scorecard chart at 600 ms", "warn", "no chart hook ([data-mult-bar] or [data-testid^=multiplier] svg)")
  else
    record(
      8,
      "/scorecard chart at 600 ms",
      early.widths.join(",") === late.widths.join(","),
      `${early.hooked ? "[data-mult-bar]" : "svg"} widths @600ms ${early.widths.join(",")} vs @2.2s ${late.widths.join(",")}`
    )

  // Shop side and directory
  for (const [i, p] of [`/shops/${DEMO_SHOP}`, "/network", "/shops/pub-001"].entries()) {
    await page.goto(url(p))
    await settle(page)
    await shot(page, `0${7 + i}-${p}`)
    await checkPage(page, p, { stage: "funded", story: true })
  }

  // 10 with Story mode off
  const ALL = ["/program", "/scorecard", "/gaps", `/shops/${DEMO_SHOP}`, "/network", "/shops/pub-001"]
  for (const p of ALL) {
    await page.goto(url(p, "story=0"))
    await settle(page, 900)
    await checkPage(page, p, { stage: "funded", story: false })
  }

  // 9 at 390 px (Story mode back on)
  await page.setViewportSize({ width: 390, height: 844 })
  for (const p of ["/", ...ALL]) {
    await page.goto(url(p, "story=1"))
    await settle(page, 900)
    const m = await page.evaluate(() => {
      const cur = document.querySelector('[aria-current="step"]')
      const r = cur?.getBoundingClientRect()
      return {
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
        cur: r ? { left: r.left, right: r.right } : null,
      }
    })
    const inView = !m.cur || (m.cur.left >= -1 && m.cur.right <= m.iw + 1)
    const needPill = STORY_PAGES.has(p)
    record(
      9,
      `${p} @390`,
      m.sw <= m.iw && inView && (!needPill || m.cur !== null),
      `scrollWidth ${m.sw} / innerWidth ${m.iw}${m.cur ? `; current pill ${Math.round(m.cur.left)}–${Math.round(m.cur.right)}` : needPill ? "; no current pill" : ""}`
    )
    await shot(page, `390-${p}`)
  }
} finally {
  await browser.close()
}

const fails = results.filter((r) => r.ok === false)
const warns = results.filter((r) => r.ok === "warn")
if (pageErrors.length) console.log(`\n${pageErrors.length} uncaught page error(s):\n  ${pageErrors.slice(0, 5).join("\n  ")}`)
console.log(`\nux-check: ${results.length - fails.length - warns.length}/${results.length} passed${warns.length ? `, ${warns.length} warning(s)` : ""}, ${fails.length} failed`)
const byCheck = {}
for (const r of results) {
  byCheck[r.check] ??= { pass: 0, total: 0 }
  byCheck[r.check].total++
  if (r.ok === true) byCheck[r.check].pass++
}
console.log(
  Object.entries(byCheck)
    .map(([k, v]) => `#${k} ${v.pass}/${v.total}`)
    .join("  ")
)
process.exit(fails.length || pageErrors.length ? 1 : 0)
