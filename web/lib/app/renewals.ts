// Compliance wallet logic (docs/app-spec.md §2.4). Owner: Agent C.
//
// renewalFor(cert, ctx) turns one certification (with its best-known dates)
// into a Renewal: the act-by deadline, the stage, the official rule text with
// its source, and the work and ITB credit that depend on it.
//
// Pure: no React, no storage, no network. Rules come from
// data/rules/renewals.json (bundled at build time). T (Today) and P (prime
// feed) import renewalFor with this exact signature.
//
// Stage rules (§2.4):
//   act_by = expires_at − act_by_days
//   lapsed       today > expires_at
//   urgent       today ≥ act_by − 30
//   window_open  today ≥ act_by − remind_days
//   ok           otherwise
//   unknown      no date, or the shop doesn't hold it ("Not held")
//
// days_left counts calendar days to act_by (the deadline to act); once the
// certificate has lapsed it counts to expires_at, so it is negative.
//
// Keep this file free of path aliases and non-erasable TypeScript so
// renewals.test.ts can run it with plain `node --test` (type stripping).

import type { Assignment, CertWithDates, Job, Renewal, RenewalRule, RenewalStage } from "./types"
import { addDays, daysBetween, parseAppDate, toISODate } from "./today"
import { certIsHeld } from "../format"
import rulesFile from "../../../data/rules/renewals.json"

// ---------------------------------------------------------------------------
// Rules

export type RuleFlag = "verified" | "assumption"

export interface RenewalSource {
  label: string
  url: string
  supports: string
}

/** One row of data/rules/renewals.json (RenewalRule plus the wallet's extra fields). */
export interface RenewalRuleFull extends RenewalRule {
  label: string
  act_by_flag: RuleFlag
  act_by_note?: string
  remind_flag: RuleFlag
  processing_business_days?: number
  verb: string
  consequence: string
  source_label: string
  sources: RenewalSource[]
  registry_label: string | null
  flag_note?: string
  used_by?: string
}

interface RulesFile {
  version: number
  as_of: string
  defaults: { urgent_days: number; urgent_flag: RuleFlag; remind_days: number; remind_flag: RuleFlag }
  rules: RenewalRuleFull[]
}

const FILE = rulesFile as unknown as RulesFile

export const RENEWAL_RULES: readonly RenewalRuleFull[] = FILE.rules
export const RENEWAL_DEFAULTS = FILE.defaults
export const RENEWALS_AS_OF = FILE.as_of
/** Days before act-by when a renewal turns "urgent" (spec: 30). */
export const URGENT_DAYS = FILE.defaults.urgent_days

/** Fallback for a cert type with no rule (never expected for docs/api.md §1 types). */
const FALLBACK_RULE: RenewalRuleFull = {
  cert_type: "*",
  label: "Certification",
  act_by_days: 0,
  act_by_flag: "assumption",
  remind_days: FILE.defaults.remind_days,
  remind_flag: "assumption",
  text: "No renewal rule on file. Read the expiry off the certificate.",
  verb: "renew",
  consequence: "Jobs that require it can't be routed to you once it lapses.",
  flag: "assumption",
  source_url: "",
  source_label: "",
  sources: [],
  registry_url: null,
  registry_label: null,
}

/** The rule for a cert type. "NADCAP:HEAT_TREAT" matches "NADCAP:*". */
export function ruleFor(certType: string): RenewalRuleFull {
  const exact = RENEWAL_RULES.find((r) => r.cert_type === certType)
  if (exact) return exact
  const wild = RENEWAL_RULES.find((r) => r.cert_type.endsWith(":*") && certType.startsWith(r.cert_type.slice(0, -1)))
  return wild ?? { ...FALLBACK_RULE, cert_type: certType }
}

// ---------------------------------------------------------------------------
// Work at risk

/**
 * Assigned jobs at this shop that depend on the cert (declined offers are not at risk). For a
 * certificate still in training (pending_training) these are the jobs waiting on it.
 */
export function jobsDependingOn(
  certType: string,
  ctx: { shopId: string; jobsById: Record<string, Job>; assignments: Assignment[] }
): Assignment[] {
  return ctx.assignments.filter((a) => {
    if (a.shop_id !== ctx.shopId || a.status === "declined") return false
    if (certType === "CGP") return a.controlled || ctx.jobsById[a.job_id]?.controlled === true
    const job = ctx.jobsById[a.job_id]
    return !!job && (job.required_certs as readonly string[]).includes(certType)
  })
}

// ---------------------------------------------------------------------------
// renewalFor

export function stageFor(today: Date, expiresAt: string | null, actBy: string | null, remindDays: number): RenewalStage {
  if (!expiresAt) return "unknown"
  if (daysBetween(today, expiresAt) < 0) return "lapsed"
  const toActBy = daysBetween(today, actBy ?? expiresAt)
  if (toActBy <= URGENT_DAYS) return "urgent"
  if (toActBy <= remindDays) return "window_open"
  return "ok"
}

export function renewalFor(
  cert: CertWithDates,
  ctx: { today: Date; shopId: string; jobsById: Record<string, Job>; assignments: Assignment[] }
): Renewal {
  const rule = ruleFor(cert.type)
  const expiry = parseAppDate(cert.expires_at)
  const expiresAt = expiry ? toISODate(expiry) : null
  // "Not held" never shows a stage (a self-declared date does not make it held). A certificate whose
  // welders are still in training (pending_training) is not held yet, so it never gets a renewal stage.
  const held = certIsHeld(cert.status)
  const actByDays = rule.act_by_days ?? 0
  const remindDays = rule.remind_days ?? FILE.defaults.remind_days
  const actBy = held && expiresAt ? toISODate(addDays(expiresAt, -actByDays)) : null
  const stage: RenewalStage = held ? stageFor(ctx.today, expiresAt, actBy, remindDays) : "unknown"

  let daysLeft: number | null = null
  if (held && expiresAt && actBy) daysLeft = stage === "lapsed" ? daysBetween(ctx.today, expiresAt) : daysBetween(ctx.today, actBy)

  // Held: the jobs at risk if it lapses. Welders still in training (pending_training): the offered
  // jobs waiting on it (C3-11), so the wallet can say "Needed for NG-031, NG-032, NG-033". Either
  // way these are this shop's live (not declined) assignments that require the certificate.
  const training = cert.status === "pending_training"
  const risky = held || training ? jobsDependingOn(cert.type, ctx) : []
  const flag: RuleFlag = rule.flag === "verified" && rule.act_by_flag === "verified" ? "verified" : "assumption"

  return {
    cert_type: cert.type,
    status: cert.status,
    expires_at: held ? expiresAt : null,
    act_by: actBy,
    days_left: daysLeft,
    stage,
    action: rule.text,
    consequence: held ? rule.consequence : null,
    source_url: rule.source_url,
    registry_url: rule.registry_url ?? null,
    flag,
    jobs_at_risk: risky.map((a) => a.job_id),
    value_at_risk_cad: round2(risky.reduce((s, a) => s + (a.value_cad || 0), 0)),
    credit_at_risk_cad: round2(risky.reduce((s, a) => s + (a.credit_cad || 0), 0)),
    date_basis: cert.date_basis,
  }
}

/** Renewals for every cert, soonest deadline first; "Not held" and undated rows last. */
export function renewalsFor(
  certs: CertWithDates[],
  ctx: { today: Date; shopId: string; jobsById: Record<string, Job>; assignments: Assignment[] }
): Renewal[] {
  return sortRenewals(certs.map((c) => renewalFor(c, ctx)))
}

const STAGE_ORDER: Record<RenewalStage, number> = { lapsed: 0, urgent: 1, window_open: 2, ok: 3, unknown: 4 }

export function sortRenewals(list: Renewal[]): Renewal[] {
  return [...list].sort((a, b) => {
    const ah = a.status !== "unknown" || a.date_basis === "shop-declared" ? 0 : 1
    const bh = b.status !== "unknown" || b.date_basis === "shop-declared" ? 0 : 1
    if (ah !== bh) return ah - bh
    const ad = a.act_by ?? a.expires_at
    const bd = b.act_by ?? b.expires_at
    if (ad && bd && ad !== bd) return ad < bd ? -1 : 1
    if (!!ad !== !!bd) return ad ? -1 : 1
    if (STAGE_ORDER[a.stage] !== STAGE_ORDER[b.stage]) return STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]
    return a.cert_type.localeCompare(b.cert_type)
  })
}

/** Stages that need the shop's attention (Today cards, prime feed). */
export function needsAttention(r: Renewal): boolean {
  return r.stage === "urgent" || r.stage === "window_open" || r.stage === "lapsed"
}

// ---------------------------------------------------------------------------
// Display helpers (shared with Today and the prime feed)

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "2026-10-17" → "Oct 17" (adds the year when it differs from `today`). */
export function shortDate(iso: string | null, today?: Date): string {
  const d = parseAppDate(iso)
  if (!d) return "—"
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  return today && d.getFullYear() !== today.getFullYear() ? `${base}, ${d.getFullYear()}` : base
}

/** Credit to 2 decimals under $10M ("$5.06M", "$1.68M"), else 1 ("$12.4M"). */
export function fmtCredit(n: number): string {
  if (!Number.isFinite(n)) return "—"
  const a = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  if (a >= 1e9) return `${sign}$${trim((a / 1e9).toFixed(2))}B`
  if (a >= 1e6) return `${sign}$${trim((a / 1e6).toFixed(a >= 1e7 ? 1 : 2))}M`
  if (a >= 1e3) return `${sign}$${trim((a / 1e3).toFixed(0))}K`
  return `${sign}$${Math.round(a)}`
}

/** Work value, one decimal ("$2.8M"). */
export function fmtWork(n: number): string {
  if (!Number.isFinite(n)) return "—"
  const a = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  if (a >= 1e9) return `${sign}$${trim((a / 1e9).toFixed(1))}B`
  if (a >= 1e6) return `${sign}$${trim((a / 1e6).toFixed(1))}M`
  if (a >= 1e3) return `${sign}$${trim((a / 1e3).toFixed(0))}K`
  return `${sign}$${Math.round(a)}`
}

/** Short action phrase for a cert type, e.g. "file renewal". */
export function renewalVerb(certType: string): string {
  return ruleFor(certType).verb
}

/** Short name for a cert type ("CGP", "CPCSC L1", "Nadcap heat treat"). */
export function certShortName(certType: string): string {
  const map: Record<string, string> = {
    CGP: "CGP",
    CPCSC_L1: "CPCSC L1",
    ISO9001: "ISO 9001",
    AS9100: "AS9100",
    "NADCAP:HEAT_TREAT": "Nadcap heat treat",
    "NADCAP:CHEM_PROCESSING": "Nadcap chem processing",
    "NADCAP:COATINGS": "Nadcap coatings",
    "CWB_W47.1": "CWB W47.1",
    CWB_WELDER_TICKET: "CWB welder ticket",
  }
  return map[certType] ?? certType.replace(/_/g, " ")
}

/** "NG-004 · $2.8M work · $5.06M Northgate credit" or null when nothing is at risk. */
export function riskLine(r: Renewal, prime = "Northgate"): string | null {
  if (!r.jobs_at_risk.length) return null
  const jobs = r.jobs_at_risk.length <= 2 ? r.jobs_at_risk.join(", ") : `${r.jobs_at_risk.length} jobs`
  return `${jobs} · ${fmtWork(r.value_at_risk_cad)} work · ${fmtCredit(r.credit_at_risk_cad)} ${prime} credit`
}

/**
 * One-line summary for Today cards and the prime feed:
 * "CGP · file renewal by Oct 17 · NG-004 · $2.8M work · $5.06M Northgate credit at risk"
 */
export function renewalSummary(r: Renewal, today?: Date, prime = "Northgate"): string {
  const name = certShortName(r.cert_type)
  const risk = riskLine(r, prime)
  let when: string
  if (r.stage === "lapsed") when = `lapsed ${shortDate(r.expires_at, today)}`
  else if (r.act_by && typeof r.days_left === "number" && r.days_left < 0) when = `overdue since ${shortDate(r.act_by, today)} · act now`
  else if (r.act_by) when = `${renewalVerb(r.cert_type)} by ${shortDate(r.act_by, today)}`
  else when = "date unknown"
  return risk ? `${name} · ${when} · ${risk} at risk` : `${name} · ${when}`
}

function trim(s: string): string {
  return s.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1")
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
