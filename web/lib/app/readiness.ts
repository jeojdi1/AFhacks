// Readiness roadmap logic (docs/app-spec.md §2.5) and the trainee-seat rules
// (§2.8). Pure functions over the shop detail, the gaps report and the actions
// store; the steps themselves live in data/rules/readiness_steps.json.

import type {
  FundResponse,
  GapKind,
  GapsResponse,
  ShopDetailResponse,
  ShopTraining,
  TrainingPackage,
} from "@/lib/api/types"
import rules from "../../../data/rules/readiness_steps.json"
import { STATIC_SITE } from "@/lib/base-path"
import { isWeldingTrade, tradeForRequirement, type Trade } from "@/lib/trades"
import type { FundingRequestRec, ReadinessStep } from "./types"

// ---------------------------------------------------------------------------
// Steps

export interface ReadinessStepDef extends ReadinessStep {
  /** A prime-funded training package can pay for this step. */
  fundable: boolean
}

export interface RequirementDef {
  title: string
  kind: string
  summary: string
  source_url: string | null
  registry_url: string | null
  steps: ReadinessStepDef[]
}

export interface OtherFunding {
  id: string
  name: string
  applies_to_province: string
  text: string
  source_url: string
  flag: "verified" | "inferred" | "assumption"
  stacking: string
}

export interface SeatStage {
  id: string
  label: string
  detail: string
}

interface RulesFile {
  requirements: Record<string, RequirementDef>
  process_default: RequirementDef
  other_funding: OtherFunding[]
  welder_ticket: { cert_type: string; text: string; source_url: string; flag: string; note: string }
  seat_stages: SeatStage[]
  seat_demo: { stage_after_funding: string; test_date_weeks_after_funding: number; flag: string; note: string }
}

const R = rules as unknown as RulesFile

/**
 * Enforce "no cost or time without a source": a step without source_url never
 * shows cost_stated or time_stated, whatever the JSON says.
 */
export function safeStep(s: ReadinessStepDef): ReadinessStepDef {
  if (s.source_url) return s
  return { ...s, cost_stated: null, time_stated: null }
}

/**
 * Steps for an operator certification of another trade (IPC J-STD-001 / IPC-A-610 /
 * IPC/WHMA-A-620) that readiness_steps.json does not list: the trade's credential, no cost
 * and no time (nothing is invented; flag "assumption").
 */
function tradeCertDef(requirement: string, trade: Trade): RequirementDef {
  return {
    title: trade.credential ?? requirement.replace(/_/g, " "),
    kind: "operator_cert",
    summary: `Operators earn this on a course, then the shop holds it through its certified ${trade.workers}. These steps are suggestions, not rules.`,
    source_url: null,
    registry_url: null,
    steps: [
      {
        label: `Train and certify your ${trade.workers}`,
        detail: trade.credential
          ? `${trade.credential}. A prime-funded training package can pay for the course.`
          : "A prime-funded training package can pay for the course.",
        source_url: null,
        time_stated: null,
        cost_stated: null,
        flag: "assumption",
        fundable: true,
      },
      {
        label: "Declare it on your profile",
        detail: "Add the certificate and its expiry date so Northgate's match counts it.",
        source_url: null,
        time_stated: null,
        cost_stated: null,
        flag: "assumption",
        fundable: false,
      },
    ],
  }
}

/** Steps for a cert type (NADCAP:* share one entry) or, for a process tag, the generic capacity steps. */
export function requirementDef(requirement: string, kind?: GapKind | null): RequirementDef | null {
  const key = requirement.startsWith("NADCAP:") ? "NADCAP" : requirement
  const trade = tradeForRequirement(requirement)
  const other = trade && !isWeldingTrade(trade) ? trade : null
  let def = R.requirements[key] ?? (kind === "capacity" || kind === "process" || !requirement.match(/^[A-Z]/) ? R.process_default : null)
  if (!def && other && other.certs.includes(requirement)) def = tradeCertDef(requirement, other)
  if (!def) return null
  let steps = def.steps.map((s) => safeStep({ ...s, fundable: Boolean(s.fundable) }))
  // Capacity for another trade: name the workers and their training on the fundable step.
  if (def === R.process_default && other && other.credential) {
    steps = steps.map((s) => (s.fundable ? { ...s, detail: `${s.detail} For ${other.workers}: ${other.credential}.` } : s))
  }
  return { ...def, steps }
}

export function otherFunding(): OtherFunding[] {
  return R.other_funding
}

export const welderTicketRule = R.welder_ticket
export const seatStages: SeatStage[] = R.seat_stages
export const seatDemo = R.seat_demo

/**
 * Seat stages for a package's trade. Welding (or an unknown trade) keeps the CWB test and
 * ticket stages from readiness_steps.json; another trade gets the same stages with a test or
 * course date and a certificate instead of a CWB ticket.
 */
export function seatStagesFor(trade: Trade | null | undefined): SeatStage[] {
  if (!trade || isWeldingTrade(trade)) return seatStages
  return seatStages.map((s) => {
    if (s.id === "test_booked") return { ...s, detail: "Your test or course completion date is set." }
    if (s.id === "passed") return { ...s, detail: "You passed the test for your certificate." }
    if (s.id === "ticket_issued") {
      return { ...s, label: "Certificate issued", detail: "Your certificate is issued and your shop can put you on the jobs." }
    }
    return s
  })
}

// ---------------------------------------------------------------------------
// Grow items

export type GrowTier = "one_gap" | "in_training"
export type FundingState = "none" | "requested" | "funded"

export interface GrowItem {
  requirement: string
  kind: GapKind
  /** Job ids this requirement unlocks (or unlocked, once funded). */
  jobs: string[]
  value_cad: number
  tier: GrowTier
  /** The prime-fundable training package for it, if Shieldworks proposed one. */
  pkg: TrainingPackage | null
  training: ShopTraining | null
  request: FundingRequestRec | null
  funding: FundingState
}

export interface GrowInput {
  shopId: string
  detail: ShopDetailResponse | null
  gaps: GapsResponse | null
  fundResults: Record<string, FundResponse>
  fundedIds: string[]
  fundingRequests: Record<string, FundingRequestRec>
}

/** The training package at this shop that closes `requirement`, if any. */
export function packageFor(gaps: GapsResponse | null, shopId: string, requirement: string): TrainingPackage | null {
  return (
    gaps?.suggestions.find(
      (p) => p.shop_id === shopId && (p.gap?.requirement === requirement || p.cert_unlock === requirement)
    ) ?? null
  )
}

function requestFor(
  reqs: Record<string, FundingRequestRec>,
  shopId: string,
  requirement: string,
  pkgId: string | null
): FundingRequestRec | null {
  if (pkgId && reqs[pkgId]) return reqs[pkgId]
  return Object.values(reqs).find((r) => r.shop_id === shopId && r.requirement === requirement) ?? null
}

export function isFunded(
  pkg: TrainingPackage | null,
  input: Pick<GrowInput, "fundResults" | "fundedIds">,
  training?: ShopTraining | null,
  request?: FundingRequestRec | null
): boolean {
  if (training?.status === "funded" || request?.status === "funded") return true
  if (!pkg) return false
  return pkg.status === "funded" || input.fundedIds.includes(pkg.id) || Boolean(input.fundResults[pkg.id])
}

/** Jobs a package unlocked (after funding) or will unlock. */
export function packageJobs(pkg: TrainingPackage, fundResults: Record<string, FundResponse>): { jobs: string[]; value: number } {
  const fr = fundResults[pkg.id]
  const mine = fr?.unblocked_jobs.filter((a) => a.shop_id === pkg.shop_id) ?? []
  if (mine.length) return { jobs: mine.map((a) => a.job_id), value: mine.reduce((s, a) => s + a.value_cad, 0) }
  return { jobs: pkg.blocked_job_ids, value: pkg.unblocks_value_cad }
}

function item(
  input: GrowInput,
  requirement: string,
  kind: GapKind,
  jobs: string[],
  value: number,
  pkg: TrainingPackage | null
): GrowItem {
  const training =
    input.detail?.training.find((t) => (pkg && t.package_id === pkg.id) || t.cert_unlock === requirement) ?? null
  const request = requestFor(input.fundingRequests, input.shopId, requirement, pkg?.id ?? training?.package_id ?? null)
  const funded = isFunded(pkg, input, training, request)
  return {
    requirement,
    kind,
    jobs,
    value_cad: value,
    tier: funded ? "in_training" : "one_gap",
    pkg,
    training,
    request,
    funding: funded ? "funded" : request ? "requested" : "none",
  }
}

/**
 * Readiness items for the Grow tab: the shop's one-gap requirements (GET
 * /shops/{id} readiness[]), plus any requirement with a training package for
 * this shop that is no longer in readiness because it was funded.
 */
export function buildGrowItems(input: GrowInput): GrowItem[] {
  const out: GrowItem[] = []
  const seen = new Set<string>()
  for (const r of input.detail?.readiness ?? []) {
    const pkg = packageFor(input.gaps, input.shopId, r.requirement)
    out.push(item(input, r.requirement, r.kind, r.jobs_unlocked, r.value_cad, pkg))
    seen.add(r.requirement)
  }
  const pkgs = (input.gaps?.suggestions ?? []).filter((p) => p.shop_id === input.shopId)
  for (const pkg of pkgs) {
    const req = pkg.gap?.requirement ?? pkg.cert_unlock
    if (!req || seen.has(req)) continue
    const { jobs, value } = packageJobs(pkg, input.fundResults)
    out.push(item(input, req, pkg.gap?.kind ?? "cert", jobs, value, pkg))
    seen.add(req)
  }
  // Funded packages known only from the shop's training[] (gaps not loaded yet).
  for (const tr of input.detail?.training ?? []) {
    const req = tr.cert_unlock
    if (!req || seen.has(req)) continue
    out.push(item(input, req, "cert", [], 0, null))
    seen.add(req)
  }
  return out.sort((a, b) => (a.tier === b.tier ? 0 : a.tier === "one_gap" ? -1 : 1))
}

/** The Grow item for one requirement (the stepper page). */
export function growItemFor(input: GrowInput, requirement: string): GrowItem | null {
  return buildGrowItems(input).find((i) => i.requirement === requirement) ?? null
}

/** Trainee seat link: /m/trainee/TP-01?seat=1 */
export function seatHref(packageId: string, seat = 1): string {
  return `/m/trainee/${encodeURIComponent(packageId)}?seat=${seat}`
}

/** /m/shops/syn-012/grow/CWB_W47.1 */
export function growHref(shopId: string, requirement?: string): string {
  const base = `/m/shops/${encodeURIComponent(shopId)}/grow`
  return requirement ? `${base}/${requirementSegment(requirement)}` : base
}

/**
 * GitHub Pages export only: a dotted last segment ("CWB_W47.1") reads as a file extension, so the
 * static-export client fetches "CWB_W47.1.txt" (404) and falls back to a full reload. There the
 * Grow route carries dots as "~" ("CWB_W47~1"). No requirement key contains "~".
 */
export function requirementSlug(requirement: string): string {
  return requirement.replace(/\./g, "~")
}

/** The Grow route segment for a requirement: encoded, and dot-free on the static site. */
export function requirementSegment(requirement: string): string {
  return encodeURIComponent(STATIC_SITE ? requirementSlug(requirement) : requirement)
}

/** Undoes requirementSlug on the static site ("CWB_W47~1" → "CWB_W47.1"); unchanged elsewhere. */
export function requirementUnslug(v: string): string {
  return STATIC_SITE ? v.replace(/~/g, ".") : v
}

/** The requirement a Grow route param names (undoes requirementSegment). */
export function requirementFromParam(v: string): string {
  return requirementUnslug(decodeParam(v))
}

/** Route params can arrive percent-encoded ("NADCAP%3AHEAT_TREAT"); decode once, safely. */
export function decodeParam(v: string): string {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}
