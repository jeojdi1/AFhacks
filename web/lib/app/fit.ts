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
import { certPlain } from "@/lib/ui/plain"
import { tradeForCert, workersText } from "@/lib/trades"
import type { CapacityCheckin, CertWithDates, Job, ProcessTag, Shop } from "./types"

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

/** One of the shop's other accepted jobs, for the capacity row. */
export interface AcceptedJobLoad {
  job_id: string
  hours_week: number
  process_tags: readonly string[]
  /** When the shop accepted it (its decision's `at`); null when unknown (treated as booked before any check-in). */
  accepted_at: string | null
}

export interface FitOptions {
  /**
   * The shop's capacity check-in (T7): FREE hours per week for new work, not counting
   * work already booked ("Hours you could take on new work, not hours already booked").
   * When given, the capacity row compares this job (plus jobs accepted after the check-in)
   * with those free hours, per process when the check-in has by_process.
   */
  confirmedCapacity?: Pick<CapacityCheckin, "hours_week" | "by_process" | "confirmed_at"> | null
  /** Weekly free hours from a check-in, without its details (older callers). */
  confirmedCapacityHours?: number | null
  /** The shop's other accepted jobs (needed to count work accepted after the check-in). */
  acceptedJobs?: readonly AcceptedJobLoad[]
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

const certShortName = (c: string) => CERT_LABEL[c] ?? label({}, c)
/** "Welding certification (CWB W47.1)": never a bare acronym (docs/ux-simplification.md §2). */
const certName = (c: string) => {
  const p = certPlain(c)
  return p.first || certShortName(c)
}
const statusWord: Record<CertStatus, string> = {
  verified: "verified",
  declared: "declared by your shop",
  pending_training: "pending training",
  unknown: "not held",
  expired: "lapsed (renew it to qualify)",
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
    // pending_training counts for matching (CLAUDE.md §1.1 decision 4), but the workers are not
    // qualified yet: flag it, never show it as held. The cert's trade names them ("Welders",
    // "Electronics assemblers").
    const training = st === "pending_training"
    items.push({
      key: `cert:${ct}`,
      kind: "cert",
      result: training ? "warn" : ok ? "pass" : "fail",
      status: st,
      label: certName(ct),
      detail: training
        ? `${upperFirst(workersText(tradeForCert(ct)))} in training (paid by Northgate): start after they qualify`
        : `Required · yours is ${statusWord[st]}`,
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
      label: "Controlled part: security-cleared (Controlled Goods)",
      detail: ok
        ? `Controlled job · your Controlled Goods registration is ${statusWord[st]}`
        : "Controlled job · only security-cleared (Controlled Goods) shops may take it",
    })
  }

  // 6. Capacity
  items.push(capacityItem(job, shop, acceptedLoadHours, opts))

  return items
}

function capacityItem(job: Job, shop: Shop, acceptedLoadHours: number, opts: FitOptions): FitItem {
  const checkin =
    opts.confirmedCapacity && typeof opts.confirmedCapacity.hours_week === "number" && opts.confirmedCapacity.hours_week >= 0
      ? opts.confirmedCapacity
      : typeof opts.confirmedCapacityHours === "number" && opts.confirmedCapacityHours >= 0
        ? { hours_week: opts.confirmedCapacityHours, by_process: null, confirmed_at: null as string | null }
        : null
  const grade = (after: number, cap: number): FitResult => (after > cap ? "fail" : cap > 0 && after / cap >= CAPACITY_WARN_SHARE ? "warn" : "pass")

  if (checkin) {
    // Free hours already leave out booked work, so only this job, plus jobs accepted AFTER the
    // check-in, count against them. Per process when the check-in says hours per process: a
    // welding + sheet-metal job is compared with the free welding + sheet-metal hours.
    const by = checkin.by_process ?? null
    const tags = job.process_tags ?? []
    const procs: string[] = by ? tags.filter((p) => typeof by[p as ProcessTag] === "number") : []
    const perProcess = procs.length > 0
    const free = perProcess ? procs.reduce((sum, p) => sum + (by?.[p as ProcessTag] ?? 0), 0) : checkin.hours_week
    const since = checkin.confirmed_at
    const newer = (opts.acceptedJobs ?? []).filter(
      (a) =>
        !!since &&
        !!a.accepted_at &&
        a.accepted_at > since &&
        (!perProcess || a.process_tags.some((p) => procs.includes(p)))
    )
    const newerHours = newer.reduce((sum, a) => sum + Math.max(0, a.hours_week), 0)
    const after = newerHours + job.hours_week
    const scope = perProcess ? ` (${list(procs.map((p) => label(PROCESS_LABEL, p).toLowerCase()))})` : ""
    const parts = [
      `${fmtHours(job.hours_week)} h/wk for this job`,
      newerHours > 0
        ? `+ ${fmtHours(newerHours)} h/wk accepted since your check-in (${newer.length} job${newer.length === 1 ? "" : "s"})`
        : null,
    ].filter(Boolean)
    return {
      key: "capacity",
      kind: "capacity",
      result: grade(after, free),
      label: `Hours needed: ${fmtHours(after)} of your ${fmtHours(free)} free h/wk${scope}`,
      detail: `${parts.join(" ")} · free hours from your check-in; work booked before it is already left out`,
      assumption: true,
    }
  }

  // No check-in: this job plus everything accepted against the profile capacity.
  const cap = shop.capacity_hours_week
  const after = Math.max(0, acceptedLoadHours) + job.hours_week
  const n = opts.acceptedCount ?? null
  const already =
    acceptedLoadHours > 0
      ? `${fmtHours(acceptedLoadHours)} h/wk already accepted${n ? ` (${n} job${n === 1 ? "" : "s"})` : ""} + ${fmtHours(job.hours_week)} h/wk for this job`
      : `${fmtHours(job.hours_week)} h/wk for this job; nothing else accepted yet`
  return {
    key: "capacity",
    kind: "capacity",
    result: grade(after, cap),
    label: `Your load after accepting: ${fmtHours(after)} / ${fmtHours(cap)} h/wk`,
    detail: `${already} · capacity from your shop profile`,
    assumption: true,
  }
}

function fmtHours(h: number): string {
  return Math.round(h).toLocaleString("en-US")
}

// Leaves acronyms alone ("AS9100", "CNC"): only "Welding …" → "welding …".
const lowerFirst = (x: string) => (x && !/^[A-Z0-9]{2}/.test(x) ? x.charAt(0).toLowerCase() + x.slice(1) : x)
const upperFirst = (x: string) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x)
const CERT_BY_LABEL = new Map(Object.entries(CERT_LABEL).map(([k, v]) => [v.toLowerCase(), k]))

/** Suffix plainReason puts after a pending_training certificate's workers ("…: welders in training"). */
export const IN_TRAINING = "in training"

/** True if a plainReason() line is about workers still in training (for the clock icon). */
export function isInTrainingReason(text: string): boolean {
  return text.endsWith(` ${IN_TRAINING}`) || text.includes(` ${IN_TRAINING},`) || text.includes(` ${IN_TRAINING} and `)
}

/**
 * An engine "why you" reason in plain words for the phone (docs/ux-simplification.md §2):
 *   "SME: 2x direct credit"            → "Small business: your work counts double (2×) for Northgate"
 *   "Welding + sheet metal + CWB W47.1" → "Welding, sheet metal and welding certification (CWB W47.1)"
 * A certificate the shop only has as pending_training says "welders in training" (or its own
 * trade's workers, e.g. "electronics assemblers in training"), never held.
 */
export function plainReason(r: string, certs: CertWithDates[] = [], prime = "Northgate", reader: "shop" | "prime" = "shop"): string {
  // The defence company reads the same reasons about the shop, addressed to itself.
  if (/^SME: 2x/i.test(r)) return reader === "prime" ? "Small business: its work counts double (2×) toward what you owe" : `Small business: your work counts double (2×) for ${prime}`
  if (/^Large firm: 1x/i.test(r)) return reader === "prime" ? "Its work counts 1× toward what you owe" : `Your work counts 1× toward what ${prime} owes`
  if (/^Only qualified shop in range/i.test(r)) return "The only qualified shop in range (counts 1×)"
  if (/^CGP-registered/i.test(r)) return "Security-cleared (Controlled Goods) for this controlled part"
  if (!r.includes(" + ")) return r
  const status = new Map(certs.map((c) => [c.type as string, c.status]))
  const parts = r.split(" + ").map((part) => {
    const ct = CERT_BY_LABEL.get(part.trim().toLowerCase())
    if (!ct) return lowerFirst(part.trim())
    const p = certPlain(ct)
    const short = certShortName(ct)
    const name = p.first !== p.label && p.label !== short ? `${lowerFirst(p.label)} (${short})` : short
    return status.get(ct) === "pending_training" ? `${name}: ${workersText(tradeForCert(ct))} ${IN_TRAINING}` : name
  })
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]
  return upperFirst(joined)
}

/** "fail" if any row fails, else "warn" if any row warns, else "pass". */
export function fitSummary(items: FitItem[]): FitResult {
  if (items.some((i) => i.result === "fail")) return "fail"
  if (items.some((i) => i.result === "warn")) return "warn"
  return "pass"
}
