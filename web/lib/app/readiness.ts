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

/** Steps for a cert type (NADCAP:* share one entry) or, for a process tag, the generic capacity steps. */
export function requirementDef(requirement: string, kind?: GapKind | null): RequirementDef | null {
  const key = requirement.startsWith("NADCAP:") ? "NADCAP" : requirement
  const def = R.requirements[key] ?? (kind === "capacity" || kind === "process" || !requirement.match(/^[A-Z]/) ? R.process_default : null)
  if (!def) return null
  return { ...def, steps: def.steps.map((s) => safeStep({ ...s, fundable: Boolean(s.fundable) })) }
}

export function otherFunding(): OtherFunding[] {
  return R.other_funding
}

export const welderTicketRule = R.welder_ticket
export const seatStages: SeatStage[] = R.seat_stages
export const seatDemo = R.seat_demo

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
  return requirement ? `${base}/${encodeURIComponent(requirement)}` : base
}

/** Route params can arrive percent-encoded ("NADCAP%3AHEAT_TREAT"); decode once, safely. */
export function decodeParam(v: string): string {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}
