// "Can we do it?": the offer card's fit checklist (docs/app-spec.md §2.3, T3).
// Pure logic, no React. Owner: Agent O.
//
// Mirrors the engine's hard filters (docs/api.md: process, envelope, certs,
// controlled_cgp, cpcsc, capacity) plus a material check. A routed offer
// normally passes every filter; the checklist shows the shop *why*, and flags
// anything that changed since routing (an expired certification, load taken by
// other accepted work).

import { COUNTING_CERT_STATUSES, type CertStatus } from "@/lib/api/types"
import { CERT_LABEL, MATERIAL_LABEL, PROCESS_LABEL, label } from "@/lib/format"
import type { CertWithDates, Job, Shop } from "./types"

export type FitResult = "pass" | "fail" | "warn"

export type FitKind = "process" | "material" | "envelope" | "cert" | "controlled" | "capacity"

export interface FitItem {
  /** Stable key for React lists ("process", "cert:CPCSC_L1", ...). */
  key: string
  kind: FitKind
  result: FitResult
  /** Short line: "Processes: sheet metal, welding, painting". */
  label: string
  /** Supporting detail: "All 3 are in your profile". */
  detail: string
  /** For cert rows: the certification status (verified / declared / unknown / pending_training). */
  status?: CertStatus
  /** True when the number behind this row is a demo assumption (hours per week). */
  assumption?: boolean
}

export interface FitOptions {
  /**
   * Weekly hours the shop confirmed in its capacity check-in (T7). When given,
   * the capacity row uses it instead of the profile figure and says so.
   */
  confirmedCapacityHours?: number | null
  /** Jobs the shop has already accepted (for the capacity detail line). */
  acceptedCount?: number
}

/** Capacity share at or above which the capacity row turns amber. */
const CAPACITY_WARN_SHARE = 0.9

const counts = (s: CertStatus | undefined): boolean => !!s && COUNTING_CERT_STATUSES.includes(s)

function sortedDesc(xs: readonly number[]): number[] {
  return [...xs].map(Number).sort((a, b) => b - a)
}

/** docs/api.md: a job fits if its sorted dimensions are each ≤ the shop's sorted dimensions. */
export function envelopeFits(job: readonly number[], shop: readonly number[]): boolean {
  if (job.length !== 3 || shop.length !== 3) return false
  const j = sortedDesc(job)
  const s = sortedDesc(shop)
  return j.every((d, i) => d <= s[i])
}

function mm(xs: readonly number[]): string {
  return `${xs.map((x) => Math.round(Number(x)).toLocaleString("en-US")).join(" × ")} mm`
}

function list(xs: string[]): string {
  return xs.join(", ")
}

const certName = (c: string) => CERT_LABEL[c] ?? label({}, c)
const statusWord: Record<CertStatus, string> = {
  verified: "verified",
  declared: "declared by your shop",
  pending_training: "pending training",
  unknown: "not held",
}

/**
 * Build the "Can we do it?" checklist for one offered job.
 *
 * @param job                the job (useDemo().jobs / bundle.jobsById)
 * @param shop               the shop profile (bundle.shop)
 * @param certs              the shop's certifications with dates (bundle.certs)
 * @param acceptedLoadHours  weekly hours of the shop's *other* accepted jobs
 *                           (this job's hours are added here)
 */
export function fitChecklist(
  job: Job,
  shop: Shop,
  certs: CertWithDates[],
  acceptedLoadHours: number,
  opts: FitOptions = {}
): FitItem[] {
  const items: FitItem[] = []
  const certBy = new Map(certs.map((c) => [c.type as string, c]))

  // 1. Process: job.process_tags ⊆ shop.processes
  const tags = job.process_tags ?? []
  const missing = tags.filter((p) => !shop.processes.includes(p))
  items.push({
    key: "process",
    kind: "process",
    result: missing.length ? "fail" : "pass",
    label: `Processes: ${list(tags.map((p) => label(PROCESS_LABEL, p).toLowerCase()))}`,
    detail: missing.length
      ? `Not in your profile: ${list(missing.map((p) => label(PROCESS_LABEL, p).toLowerCase()))}`
      : tags.length === 1
        ? "In your shop profile"
        : tags.length === 2
          ? "Both are in your shop profile"
          : `All ${tags.length} are in your shop profile`,
  })

  // 2. Material
  const matOk = (shop.materials as string[]).includes(job.material)
  items.push({
    key: "material",
    kind: "material",
    result: matOk ? "pass" : "warn",
    label: `Material: ${label(MATERIAL_LABEL, job.material).toLowerCase()}`,
    detail: matOk ? "You already work this material" : "Not listed in your profile; check you can source and work it",
  })

  // 3. Envelope (sorted-dimension comparison)
  const envOk = envelopeFits(job.envelope_mm, shop.max_envelope_mm)
  items.push({
    key: "envelope",
    kind: "envelope",
    result: envOk ? "pass" : "fail",
    label: `Part size: ${mm(job.envelope_mm)}`,
    detail: envOk ? `Fits your largest work envelope (${mm(shop.max_envelope_mm)})` : `Larger than your work envelope (${mm(shop.max_envelope_mm)})`,
  })

  // 4. Each required certification
  for (const ct of job.required_certs ?? []) {
    const c = certBy.get(ct)
    const st: CertStatus = c?.status ?? "unknown"
    const ok = counts(st)
    items.push({
      key: `cert:${ct}`,
      kind: "cert",
      result: ok ? "pass" : "fail",
      status: st,
      label: certName(ct),
      detail: `Required · yours is ${statusWord[st]}`,
    })
  }

  // 5. Controlled → CGP
  if (job.controlled) {
    const c = certBy.get("CGP")
    const st: CertStatus = c?.status ?? "unknown"
    const ok = counts(st)
    items.push({
      key: "controlled",
      kind: "controlled",
      result: ok ? "pass" : "fail",
      status: st,
      label: "Controlled goods: CGP registration",
      detail: ok
        ? `Controlled job · your CGP registration is ${statusWord[st]}`
        : "Controlled job · only CGP-registered shops may take it",
    })
  }

  // 6. Capacity after accepting
  const confirmed = opts.confirmedCapacityHours
  const cap = typeof confirmed === "number" && confirmed >= 0 ? confirmed : shop.capacity_hours_week
  const after = Math.max(0, acceptedLoadHours) + job.hours_week
  const share = cap > 0 ? after / cap : Infinity
  const capResult: FitResult = after > cap ? "fail" : share >= CAPACITY_WARN_SHARE ? "warn" : "pass"
  const n = opts.acceptedCount ?? null
  const already =
    acceptedLoadHours > 0
      ? `${fmtHours(acceptedLoadHours)} h/wk already accepted${n ? ` (${n} job${n === 1 ? "" : "s"})` : ""} + ${fmtHours(job.hours_week)} h/wk for this job`
      : `${fmtHours(job.hours_week)} h/wk for this job; nothing else accepted yet`
  items.push({
    key: "capacity",
    kind: "capacity",
    result: capResult,
    label: `Your load after accepting: ${fmtHours(after)} / ${fmtHours(cap)} h/wk`,
    detail: `${already} · ${typeof confirmed === "number" ? "capacity from your check-in" : "capacity from your shop profile"}`,
    assumption: true,
  })

  return items
}

function fmtHours(h: number): string {
  return Math.round(h).toLocaleString("en-US")
}

/** "fail" if any row fails, else "warn" if any row warns, else "pass". */
export function fitSummary(items: FitItem[]): FitResult {
  if (items.some((i) => i.result === "fail")) return "fail"
  if (items.some((i) => i.result === "warn")) return "warn"
  return "pass"
}
