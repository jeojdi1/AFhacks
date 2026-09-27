// The 5-step story (docs/ux-simplification.md §1, §3.2, §3.3).
//
// Step state comes only from pathname + useDemo().stage, never component-local state:
// exactly one step is "current" (or none), and only on the page it names.

import type { Stage } from "@/lib/data/store"
import { c } from "./copy"

export type StepKey = "parts" | "matches" | "credit" | "gap" | "shop"

export interface StepDef {
  key: StepKey
  n: 1 | 2 | 3 | 4 | 5
  label: string
}

export const STEPS: StepDef[] = [
  { key: "parts", n: 1, label: c("nav.step1") },
  { key: "matches", n: 2, label: c("nav.step2") },
  { key: "credit", n: 3, label: c("nav.step3") },
  { key: "gap", n: 4, label: c("nav.step4") },
  { key: "shop", n: 5, label: c("nav.step5") },
]

export function stepByKey(key: StepKey): StepDef {
  return STEPS.find((s) => s.key === key) ?? STEPS[0]
}

const ORDER: Stage[] = ["empty", "uploaded", "routed", "funded"]

/** stage ≥ s */
export function atLeast(stage: Stage, s: Stage): boolean {
  return ORDER.indexOf(stage) >= ORDER.indexOf(s)
}

/** Shop id from /shops/<id>, or null. */
export function shopIdFromPath(pathname: string): string | null {
  const m = /^\/shops\/([^/?#]+)/.exec(pathname)
  return m ? decodeURIComponent(m[1]) : null
}

/** True for discovered (real, public-data) shop profiles: /shops/pub-*. */
export function isPublicShopPath(pathname: string): boolean {
  return (shopIdFromPath(pathname) ?? "").startsWith("pub-")
}

/** The Shops directory ("extra", no step): /network and /shops/pub-*. */
export function isDirectoryPath(pathname: string): boolean {
  return pathname === "/network" || pathname.startsWith("/network/") || isPublicShopPath(pathname)
}

/** The demo shop's page (step 5). With no known demo shop, any non-public shop page counts. */
export function isDemoShopPath(pathname: string, demoShopId: string | null): boolean {
  const id = shopIdFromPath(pathname)
  if (!id || id.startsWith("pub-")) return false
  return demoShopId ? id === demoShopId : true
}

/** The step the current page names, or null (landing, directory, other pages). */
export function currentStep(pathname: string, stage: Stage, demoShopId: string | null): StepKey | null {
  if (pathname === "/program" || pathname.startsWith("/program/")) return atLeast(stage, "routed") ? "matches" : "parts"
  if (pathname.startsWith("/scorecard")) return "credit"
  if (pathname.startsWith("/gaps")) return "gap"
  if (isDemoShopPath(pathname, demoShopId)) return "shop"
  return null
}

export function stepDone(key: StepKey, stage: Stage, anyAccepted: boolean): boolean {
  switch (key) {
    case "parts":
      return atLeast(stage, "uploaded")
    case "matches":
    case "credit":
      return atLeast(stage, "routed")
    case "gap":
      return stage === "funded"
    case "shop":
      return stage === "funded" && anyAccepted
  }
}

export function stepHref(key: StepKey, demoShopId: string | null): string {
  switch (key) {
    case "parts":
      return "/program"
    case "matches":
      return "/program#map"
    case "credit":
      return "/scorecard"
    case "gap":
      return "/gaps"
    case "shop":
      return demoShopId ? `/shops/${demoShopId}` : "/network"
  }
}

/** First step that isn't done, else step 5. */
export function firstOpenStep(stage: Stage, demoShopId: string | null, anyAccepted = false): { key: StepKey; href: string } {
  const open = STEPS.find((s) => !stepDone(s.key, stage, anyAccepted)) ?? STEPS[4]
  return { key: open.key, href: stepHref(open.key, demoShopId) }
}

export type NextAction = "upload" | "route" | "scrollFund" | "run"

export interface NextStepSpec {
  label: string
  href?: string
  /**
   * upload / route: call the store action; scrollFund: scroll to #fund-TP-01 and focus its button;
   * run: upload + route in one click (RunDemoButton), staying on the page.
   */
  action?: NextAction
}

/** Scroll target for the gaps page's Fund button (Agent D renders id="fund-TP-01"). */
export const FUND_TARGET_ID = "fund-TP-01"

/**
 * The page's one "Next step →" (§3.3). `opts.blocked` fills "Fix the {blocked} stuck jobs →".
 */
export function nextStep(
  pathname: string,
  stage: Stage,
  demoShopId: string | null,
  opts?: { blocked?: number; anyAccepted?: boolean; packageId?: string }
): NextStepSpec {
  const routed = atLeast(stage, "routed")
  const funded = stage === "funded"
  const shopHref = stepHref("shop", demoShopId)

  if (pathname === "/") {
    if (stage === "empty" || stage === "uploaded") return { label: c("run.start"), action: "run", href: "/program#map" }
    return { label: c("run.continue"), href: firstOpenStep(stage, demoShopId, opts?.anyAccepted).href }
  }
  if (pathname === "/program" || pathname.startsWith("/program/")) {
    if (stage === "empty") return { label: c("program.next.load"), action: "upload" }
    if (stage === "uploaded") return { label: c("program.next.match"), action: "route" }
    return { label: c("program.next.credit"), href: "/scorecard" }
  }
  if (pathname.startsWith("/scorecard")) {
    if (!routed) return { label: c("run.loadAndMatch"), action: "run" }
    if (funded) return { label: c("score.next.funded"), href: shopHref }
    const blocked = opts?.blocked
    // Without a count: "Fix the stuck jobs →".
    return { label: c("score.next", { blocked: blocked ?? "" }).replace(/\s{2,}/g, " "), href: "/gaps" }
  }
  if (pathname.startsWith("/gaps")) {
    if (!routed) return { label: c("run.loadAndMatch"), action: "run" }
    if (funded) return { label: c("gaps.next.shop"), href: shopHref }
    return { label: c("gaps.next.fund"), action: "scrollFund" }
  }
  if (isDemoShopPath(pathname, demoShopId)) {
    if (!routed) return { label: c("run.loadAndMatch.shop"), action: "run" }
    const id = shopIdFromPath(pathname)
    return { label: c("shop.next"), href: `/m/shops/${id}` }
  }
  // Directory (/network, /shops/pub-*) and anything else.
  return { label: c("net.next"), href: firstOpenStep(stage, demoShopId, opts?.anyAccepted).href }
}

/** Scroll to the Fund button (id FUND_TARGET_ID or a button inside it) and focus it. Never funds. */
export function scrollToFund(): boolean {
  if (typeof document === "undefined") return false
  const target = document.getElementById(FUND_TARGET_ID)
  if (!target) return false
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" })
  const btn: HTMLElement | null =
    target instanceof HTMLButtonElement ? target : target.querySelector<HTMLElement>("button:not([disabled])")
  btn?.focus({ preventScroll: true })
  return true
}

// ---------------------------------------------------------------------------
// Keeping ?mode= and ?story= on internal links

const KEEP = ["mode", "story"] as const

function mergeParams(href: string, search: string): string {
  if (!search || !href.startsWith("/")) return href
  let current: URLSearchParams
  try {
    current = new URLSearchParams(search)
  } catch {
    return href
  }
  const keep = KEEP.filter((k) => current.get(k) !== null)
  if (!keep.length) return href
  const hashAt = href.indexOf("#")
  const hash = hashAt >= 0 ? href.slice(hashAt) : ""
  const noHash = hashAt >= 0 ? href.slice(0, hashAt) : href
  const qAt = noHash.indexOf("?")
  const path = qAt >= 0 ? noHash.slice(0, qAt) : noHash
  const params = new URLSearchParams(qAt >= 0 ? noHash.slice(qAt + 1) : "")
  for (const k of keep) if (!params.has(k)) params.set(k, current.get(k) as string)
  const qs = params.toString()
  return `${path}${qs ? `?${qs}` : ""}${hash}`
}

/** Keeps ?mode and ?story from window.location on an internal href. Server: returns href unchanged. */
export function withParams(href: string): string {
  if (typeof window === "undefined") return href
  return mergeParams(href, window.location.search)
}

// Hydration-safe render hook: useWithParams() in ./use-with-params (client-only module).
export { mergeParams }
