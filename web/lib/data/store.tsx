"use client"

// Muster demo data layer. One provider holds the whole demo flow
// (reset → upload → route → fund → shop view) against either the live engine
// or the checked-in fixtures, and persists enough to replay after a reload.

import * as React from "react"
import { toast } from "sonner"
import type {
  Assignment,
  BlockedJob,
  Certification,
  CreditTxn,
  FundResponse,
  GapsResponse,
  Job,
  LedgerResponse,
  Offer,
  PartsUploadResponse,
  ProgramResponse,
  RouteResponse,
  AssignmentsResponse,
  Shop,
  ShopDetailResponse,
  ShopsResponse,
  ShopTraining,
  Snapshot,
  TrainingPackage,
} from "@/lib/api/types"
import { CERT_LABEL } from "@/lib/format"
import { demoIds, fx } from "./fixture-source"

// ---------------------------------------------------------------------------
// Public types

export type Stage = "empty" | "uploaded" | "routed" | "funded"
export type Mode = "live" | "fixtures"
export type OfferDecision = "accepted" | "declined"

export interface DemoState {
  mode: Mode
  stage: Stage
  busy: string | null
  error: string | null
  program: ProgramResponse["program"] | null
  jobs: Job[]
  assignments: Assignment[]
  blocked: BlockedJob[]
  routeStats: RouteResponse["stats"] | null
  solver: string | null
  ledger: LedgerResponse | null
  gaps: GapsResponse | null
  fundResults: Record<string, FundResponse>
  lastFund: FundResponse | null
  demoShopId: string | null
  /** key "shopId:jobId" */
  offerStatus: Record<string, OfferDecision>
  // --- extras (beyond the shared interface) ---
  /** true once the provider has detected the mode and restored the flow. */
  ready: boolean
  /** Name of the uploaded CSV (fixtures mode ignores its contents). */
  fileName: string | null
  /** Package ids funded so far, in order. */
  fundedIds: string[]
  apiUrl: string
}

export interface DemoActions {
  reset(): Promise<void>
  uploadParts(file?: File): Promise<void>
  route(): Promise<void>
  fund(packageId: string): Promise<FundResponse | undefined>
  getShops(): Promise<ShopsResponse>
  getShop(id: string): Promise<ShopDetailResponse>
  setOfferStatus(shopId: string, jobId: string, status: OfferDecision): void
  setMode(m: Mode): void
}

export type DemoContextValue = DemoState & DemoActions

// ---------------------------------------------------------------------------
// Config

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "")
const RAW_MODE = (process.env.NEXT_PUBLIC_DEMO_MODE || "auto").toLowerCase()
const ENV_MODE: "auto" | Mode = RAW_MODE === "live" || RAW_MODE === "fixtures" ? RAW_MODE : "auto"
const PID = "northgate"
const STORAGE_KEY = "muster.demo.v1"
/** Live-mode extras the engine cannot give back after a reload (fund responses, solver). */
const LIVE_CACHE_KEY = "muster.demo.live.v1"
const IDS = demoIds()

export const BUSY = {
  connecting: "Connecting to engine…",
  reset: "Resetting demo…",
  upload: (n?: number) => (n ? `Tagging ${n} lines…` : "Tagging parts list…"),
  route: "Routing jobs…",
  fund: "Funding training…",
  mode: "Switching mode…",
} as const

// ---------------------------------------------------------------------------
// Persistence (every access guarded)

interface Persisted {
  modeOverride: Mode | null
  stage: Stage
  funded: string[]
  offerStatus: Record<string, OfferDecision>
  fileName: string | null
}

function readPersisted(): Persisted | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<Persisted>
    const stages: Stage[] = ["empty", "uploaded", "routed", "funded"]
    return {
      modeOverride: p.modeOverride === "live" || p.modeOverride === "fixtures" ? p.modeOverride : null,
      stage: stages.includes(p.stage as Stage) ? (p.stage as Stage) : "empty",
      funded: Array.isArray(p.funded) ? p.funded.filter((x): x is string => typeof x === "string") : [],
      offerStatus: p.offerStatus && typeof p.offerStatus === "object" ? p.offerStatus : {},
      fileName: typeof p.fileName === "string" ? p.fileName : null,
    }
  } catch {
    return null
  }
}

function writePersisted(p: Persisted) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* storage unavailable: demo still works, just no restore */
  }
}

interface LiveCache {
  solver: string | null
  fundResults: Record<string, FundResponse>
  /** Package ids in the order they were funded. */
  order: string[]
}

function readLiveCache(): LiveCache {
  const empty: LiveCache = { solver: null, fundResults: {}, order: [] }
  try {
    const raw = window.localStorage.getItem(LIVE_CACHE_KEY)
    if (!raw) return empty
    const c = JSON.parse(raw) as Partial<LiveCache>
    return {
      solver: typeof c.solver === "string" ? c.solver : null,
      fundResults: c.fundResults && typeof c.fundResults === "object" ? c.fundResults : {},
      order: Array.isArray(c.order) ? c.order.filter((x): x is string => typeof x === "string") : [],
    }
  } catch {
    return empty
  }
}

function writeLiveCache(c: LiveCache) {
  try {
    window.localStorage.setItem(LIVE_CACHE_KEY, JSON.stringify(c))
  } catch {
    /* storage unavailable */
  }
}

// ---------------------------------------------------------------------------
// HTTP

class ApiError extends Error {
  status: number
  network: boolean
  constructor(status: number, message: string, network = false) {
    super(message)
    this.status = status
    this.network = network
  }
}

async function http<T>(
  method: "GET" | "POST",
  path: string,
  opts: { body?: BodyInit; timeoutMs?: number } = {}
): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30000)
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      body: opts.body,
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError"
    throw new ApiError(0, aborted ? "The engine did not respond in time" : `Cannot reach the engine at ${API_URL}`, true)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText || "error"}`
    try {
      const j = (await res.json()) as { detail?: unknown }
      if (typeof j?.detail === "string") detail = j.detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  return (await res.json()) as T
}

async function probeLive(): Promise<boolean> {
  try {
    const h = await http<{ status?: string }>("GET", "/health", { timeoutMs: 1500 })
    if (h?.status !== "ok") return false
  } catch {
    return false
  }
  try {
    await http("GET", `/programs/${PID}`, { timeoutMs: 2500 })
    return true
  } catch (e) {
    // 4xx (e.g. 404 before seeding) still means the engine is implemented.
    return e instanceof ApiError && !e.network && e.status < 500
  }
}

// ---------------------------------------------------------------------------
// Pure helpers

const round2 = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const latency = () => sleep(250 + Math.floor(Math.random() * 350))

type FlowData = Pick<
  DemoState,
  | "stage"
  | "program"
  | "jobs"
  | "assignments"
  | "blocked"
  | "routeStats"
  | "solver"
  | "ledger"
  | "gaps"
  | "fundResults"
  | "lastFund"
  | "fundedIds"
>

function emptyFlow(program: DemoState["program"]): FlowData {
  return {
    stage: "empty",
    program,
    jobs: [],
    assignments: [],
    blocked: [],
    routeStats: null,
    solver: null,
    ledger: null,
    gaps: null,
    fundResults: {},
    lastFund: null,
    fundedIds: [],
  }
}

function withJobStatus(jobs: Job[], assignments: Assignment[], blocked: BlockedJob[]): Job[] {
  const a = new Set(assignments.map((x) => x.job_id))
  const b = new Set(blocked.map((x) => x.job_id))
  return jobs.map((j) => {
    const status: Job["status"] = a.has(j.id) ? "assigned" : b.has(j.id) ? "blocked" : j.status
    return status === j.status ? j : { ...j, status }
  })
}

/** Minimal Job rows when the engine has no /jobs endpoint (live reload). */
function deriveJobs(assignments: Assignment[], blocked: BlockedJob[]): Job[] {
  const fromA = assignments.map(
    (a) =>
      ({
        id: a.job_id,
        program_id: PID,
        part_no: a.part_no,
        description: a.description,
        qty: 0,
        unit_price_cad: 0,
        est_value_cad: a.value_cad,
        ccv_pct: a.ccv_pct,
        hours_week: a.hours_week,
        material: "steel",
        process_tags: [],
        envelope_mm: [0, 0, 0],
        tolerance_class: "standard",
        required_certs: [],
        controlled: a.controlled,
        tag_source: "cache",
        status: "assigned",
      }) as unknown as Job
  )
  const fromB = blocked.map(
    (b) =>
      ({
        id: b.job_id,
        program_id: PID,
        part_no: b.part_no,
        description: b.description,
        qty: 0,
        unit_price_cad: 0,
        est_value_cad: b.value_cad,
        ccv_pct: 0,
        hours_week: b.hours_week,
        material: "steel",
        process_tags: b.process_tags,
        envelope_mm: [0, 0, 0],
        tolerance_class: "standard",
        required_certs: b.required_certs,
        controlled: false,
        tag_source: "cache",
        status: "blocked",
      }) as unknown as Job
  )
  return [...fromA, ...fromB].sort((x, y) => x.id.localeCompare(y.id))
}

function computeStats(jobCount: number, assignments: Assignment[], blocked: BlockedJob[]): RouteResponse["stats"] {
  const assignedValue = sum(assignments.map((a) => a.value_cad))
  const smeValue = sum(assignments.filter((a) => a.is_sme).map((a) => a.value_cad))
  return {
    jobs: Math.max(jobCount, assignments.length + blocked.length),
    assigned: assignments.length,
    blocked: blocked.length,
    assigned_value_cad: round2(assignedValue),
    sme_share_pct: assignedValue > 0 ? smeValue / assignedValue : 0,
  } as RouteResponse["stats"]
}

function snapshot(ledger: LedgerResponse, assigned: number, blocked: number): Snapshot {
  return {
    assigned,
    blocked,
    credit_total_cad: ledger.credit_total_cad,
    obligation_met_pct: ledger.obligation_met_pct,
    direct_credit_cad: ledger.direct_credit_cad,
    indirect_credit_cad: ledger.indirect_credit_cad,
    smb_achieved_cad: ledger.smb.achieved_cad,
    smb_progress_pct: ledger.smb.progress_pct,
  } as Snapshot
}

const BREAKDOWN_DEFAULTS: { category: string; label: string; multiplier: number }[] = [
  { category: "regular", label: "Regular work", multiplier: 1 },
  { category: "sme_direct", label: "SME direct work", multiplier: 2 },
  { category: "training", label: "Skills and training", multiplier: 5 },
  { category: "indigenous_training", label: "Indigenous workforce development", multiplier: 10 },
]

type BreakdownRow = LedgerResponse["multiplier_breakdown"][number]

/** Append transactions and recompute every ledger total per the docs/api.md invariants. */
function applyTxns(ledger: LedgerResponse, newTxns: CreditTxn[]): LedgerResponse {
  const transactions = [...ledger.transactions, ...newTxns]
  const direct = round2(sum(transactions.filter((t) => t.type === "direct").map((t) => t.credit_cad)))
  const indirect = round2(sum(transactions.filter((t) => t.type !== "direct").map((t) => t.credit_cad)))
  const total = round2(direct + indirect)

  const rows = new Map<string, BreakdownRow>()
  for (const r of ledger.multiplier_breakdown) rows.set(r.category, { ...r })
  for (const d of BREAKDOWN_DEFAULTS) {
    if (!rows.has(d.category))
      rows.set(d.category, { ...d, count: 0, value_cad: 0, credit_cad: 0 } as unknown as BreakdownRow)
  }
  for (const t of newTxns) {
    const r = rows.get(t.category)
    if (!r) continue
    r.count += 1
    r.value_cad = round2(r.value_cad + t.value_cad)
    r.credit_cad = round2(r.credit_cad + t.credit_cad)
  }
  const order = BREAKDOWN_DEFAULTS.map((d) => d.category)
  const rank = (c: string) => (order.includes(c) ? order.indexOf(c) : 99)
  const multiplier_breakdown = [...rows.values()].sort((a, b) => rank(a.category) - rank(b.category))

  const smbAdd = sum(newTxns.filter((t) => t.category === "sme_direct").map((t) => t.value_cad * t.ccv_pct))
  const achieved = round2(ledger.smb.achieved_cad + smbAdd)
  return {
    ...ledger,
    transactions,
    credit_total_cad: total,
    direct_credit_cad: direct,
    indirect_credit_cad: indirect,
    obligation_met_pct: ledger.obligation_cad > 0 ? total / ledger.obligation_cad : 0,
    smb: {
      ...ledger.smb,
      achieved_cad: achieved,
      progress_pct: ledger.smb.target_cad > 0 ? achieved / ledger.smb.target_cad : 0,
    },
    multiplier_breakdown,
  }
}

function nextTxnIds(existing: CreditTxn[], n: number): string[] {
  let max = 0
  for (const t of existing) {
    const m = /(\d+)$/.exec(t.id)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return Array.from({ length: n }, (_, i) => `TX-${String(max + 1 + i).padStart(4, "0")}`)
}

function assignmentTxn(a: Assignment, id: string): CreditTxn {
  return {
    id,
    program_id: PID,
    origin: "assignment",
    ref_id: a.job_id,
    shop_id: a.shop_id,
    type: "direct",
    category: a.category,
    value_cad: a.value_cad,
    ccv_pct: a.ccv_pct,
    multiplier: a.multiplier,
    credit_cad: a.credit_cad,
    flags: ["simplified-demo"],
  } as CreditTxn
}

/**
 * Generic fund derivation (fixtures mode, any package): move unblocked jobs to
 * assignments, append the training txn + new assignment txns, recompute the
 * ledger, and mark the package funded.
 */
function deriveFund(flow: FlowData, fixtureRes: FundResponse): { flow: FlowData; res: FundResponse } {
  const ledger = flow.ledger!
  const gaps = flow.gaps!
  const unblocked = (fixtureRes.unblocked_jobs ?? []).map((a) => ({ ...a, status: "offered" }) as Assignment)
  const unblockedIds = new Set(unblocked.map((a) => a.job_id))

  const assignments = [...flow.assignments.filter((a) => !unblockedIds.has(a.job_id)), ...unblocked]
  const blocked = flow.blocked.filter((b) => !unblockedIds.has(b.job_id))

  const ids = nextTxnIds(ledger.transactions, unblocked.length + 1)
  const existingIds = new Set(ledger.transactions.map((t) => t.id))
  const trainingTxn: CreditTxn = existingIds.has(fixtureRes.training_txn.id)
    ? { ...fixtureRes.training_txn, id: ids[0] }
    : fixtureRes.training_txn
  const newTxns = [trainingTxn, ...unblocked.map((a, i) => assignmentTxn(a, ids[i + 1]))]
  const nextLedger = applyTxns(ledger, newTxns)

  const pkg = { ...fixtureRes.package, status: "funded" } as TrainingPackage
  const suggestions = gaps.suggestions.map((s) => (s.id === pkg.id ? ({ ...s, ...pkg, status: "funded" } as TrainingPackage) : s))
  const gapsBlocked = gaps.blocked.filter((b) => !unblockedIds.has(b.job_id))
  const nextGaps: GapsResponse = {
    ...gaps,
    blocked: gapsBlocked,
    suggestions,
    summary: {
      ...gaps.summary,
      blocked_jobs: gapsBlocked.length,
      blocked_value_cad: round2(sum(gapsBlocked.map((b) => b.value_cad))),
    },
  }

  const before = snapshot(ledger, flow.assignments.length, flow.blocked.length)
  const after = snapshot(nextLedger, assignments.length, blocked.length)
  const jobsCad = round2(sum(unblocked.map((a) => a.credit_cad)))
  const res: FundResponse = {
    ...fixtureRes,
    package: pkg,
    training_txn: trainingTxn,
    unblocked_jobs: unblocked,
    before,
    after,
    still_blocked: blocked.map((b) => b.job_id),
    credit_added: round2(after.credit_total_cad - before.credit_total_cad),
    credit_added_breakdown: { training_cad: trainingTxn.credit_cad, jobs_cad: jobsCad },
  }

  return {
    res,
    flow: {
      ...flow,
      stage: "funded",
      assignments,
      blocked,
      ledger: nextLedger,
      gaps: nextGaps,
      jobs: withJobStatus(flow.jobs, assignments, blocked),
      routeStats: computeStats(flow.jobs.length, assignments, blocked),
      fundResults: { ...flow.fundResults, [pkg.id]: res },
      lastFund: res,
      fundedIds: [...flow.fundedIds, pkg.id],
    },
  }
}

// ---------------------------------------------------------------------------
// Fixture flow (pure, synchronous)

const fxProgram = () => fx<ProgramResponse>("GET", `/programs/${PID}`)?.program ?? null

function fxUpload(flow: FlowData): FlowData {
  const up = fx<PartsUploadResponse>("POST", `/programs/${PID}/parts`)
  if (!up) throw new ApiError(500, "Fixture parts_upload.json is missing")
  return { ...emptyFlow(flow.program), stage: "uploaded", jobs: up.jobs }
}

function fxRoute(flow: FlowData): FlowData {
  const r = fx<RouteResponse>("POST", `/programs/${PID}/route`)
  const ledger = fx<LedgerResponse>("GET", `/programs/${PID}/ledger`)
  const gaps = fx<GapsResponse>("GET", `/programs/${PID}/gaps`)
  if (!r || !ledger || !gaps) throw new ApiError(500, "Routing fixtures are missing")
  return {
    ...flow,
    stage: "routed",
    assignments: r.assignments,
    blocked: r.blocked,
    routeStats: r.stats,
    solver: r.solver,
    ledger,
    gaps,
    jobs: withJobStatus(flow.jobs, r.assignments, r.blocked),
    fundResults: {},
    lastFund: null,
    fundedIds: [],
  }
}

function fxFund(flow: FlowData, packageId: string): { flow: FlowData; res: FundResponse } {
  if (flow.stage !== "routed" && flow.stage !== "funded") throw new ApiError(400, "Route the jobs before funding training")
  if (flow.fundedIds.includes(packageId)) throw new ApiError(409, `${packageId} is already funded`)
  const res = fx<FundResponse>("POST", `/programs/${PID}/training/${packageId}/fund`)
  if (!res) throw new ApiError(404, `Unknown training package ${packageId}`)

  if (packageId === IDS.demoPackageId && flow.fundedIds.length === 0) {
    const asg = fx<AssignmentsResponse>("GET", `/programs/${PID}/assignments`, true)
    const ledger = fx<LedgerResponse>("GET", `/programs/${PID}/ledger`, true)
    const gaps = fx<GapsResponse>("GET", `/programs/${PID}/gaps`, true)
    if (asg && ledger && gaps) {
      const assignments = asg.assignments
      const blocked = gaps.blocked
      return {
        res,
        flow: {
          ...flow,
          stage: "funded",
          assignments,
          blocked,
          ledger,
          gaps,
          jobs: withJobStatus(flow.jobs, assignments, blocked),
          routeStats: computeStats(flow.jobs.length, assignments, blocked),
          fundResults: { ...flow.fundResults, [packageId]: res },
          lastFund: res,
          fundedIds: [...flow.fundedIds, packageId],
        },
      }
    }
  }
  return deriveFund(flow, res)
}

/** Deterministic replay of a persisted fixtures session. */
function replayFixtures(p: Persisted | null): FlowData {
  let flow = emptyFlow(fxProgram())
  if (!p || p.stage === "empty") return flow
  try {
    flow = fxUpload(flow)
    if (p.stage === "uploaded") return flow
    flow = fxRoute(flow)
    for (const id of p.funded) {
      try {
        flow = fxFund(flow, id).flow
      } catch {
        /* skip a package that no longer exists */
      }
    }
    return flow
  } catch {
    return emptyFlow(flow.program)
  }
}

// ---------------------------------------------------------------------------
// Live flow

async function liveJobsOrNull(): Promise<Job[] | null> {
  try {
    const r = await http<{ jobs?: Job[] } | Job[]>("GET", `/programs/${PID}/jobs`)
    if (Array.isArray(r)) return r
    return Array.isArray(r?.jobs) ? r.jobs : null
  } catch {
    return null
  }
}

async function liveRoutedState(jobsHint: Job[] | null): Promise<Omit<FlowData, "stage" | "program" | "solver" | "fundResults" | "lastFund">> {
  const [asg, ledger, gaps, jobsLive] = await Promise.all([
    http<AssignmentsResponse>("GET", `/programs/${PID}/assignments`),
    http<LedgerResponse>("GET", `/programs/${PID}/ledger`),
    http<GapsResponse>("GET", `/programs/${PID}/gaps`),
    jobsHint ? Promise.resolve(jobsHint) : liveJobsOrNull(),
  ])
  const assignments = asg.assignments
  const blocked = gaps.blocked
  const baseJobs = jobsLive && jobsLive.length ? jobsLive : deriveJobs(assignments, blocked)
  const jobs = withJobStatus(baseJobs, assignments, blocked)
  return {
    assignments,
    blocked,
    ledger,
    gaps,
    jobs,
    routeStats: computeStats(jobs.length, assignments, blocked),
    fundedIds: gaps.suggestions.filter((s) => s.status === "funded").map((s) => s.id),
  }
}

async function loadLive(): Promise<FlowData> {
  const prog = await http<ProgramResponse>("GET", `/programs/${PID}`)
  const flow = emptyFlow(prog.program)
  const stage = (["empty", "uploaded", "routed", "funded"] as Stage[]).includes(prog.state as Stage)
    ? (prog.state as Stage)
    : "empty"
  if (stage === "empty") return flow
  if (stage === "uploaded") {
    return { ...flow, stage, jobs: (await liveJobsOrNull()) ?? [] }
  }
  const routed = await liveRoutedState(null)
  // Restore fund responses and the solver saved before the reload, but only for
  // packages the engine still reports as funded.
  const cache = readLiveCache()
  const engineFunded = new Set(routed.fundedIds)
  const fundedIds = [
    ...cache.order.filter((id) => engineFunded.has(id)),
    ...routed.fundedIds.filter((id) => !cache.order.includes(id)),
  ]
  const fundResults: Record<string, FundResponse> = {}
  for (const id of fundedIds) if (cache.fundResults[id]) fundResults[id] = cache.fundResults[id]
  const lastId = [...fundedIds].reverse().find((id) => fundResults[id])
  return {
    ...flow,
    ...routed,
    stage,
    fundedIds,
    fundResults,
    lastFund: lastId ? fundResults[lastId] : null,
    solver: cache.solver,
  }
}

// ---------------------------------------------------------------------------
// Shop detail (fixtures)

function trainingMessage(p: TrainingPackage): string {
  const cert = p.cert_unlock ? (CERT_LABEL[p.cert_unlock] ?? p.cert_unlock) : null
  const n = p.trainees
  const who = cert?.startsWith("CWB") ? (n === 1 ? "welder" : "welders") : n === 1 ? "trainee" : "trainees"
  if (p.status === "funded") {
    return cert ? `${n} ${who} in training for ${cert}` : `${n} ${who} in training`
  }
  return cert ? `Suggested: certify ${n} ${who} to ${cert}` : `Suggested: train ${n} ${who}`
}

function deriveShopDetail(id: string, shops: Shop[], flow: FlowData): ShopDetailResponse {
  const shop = shops.find((s) => s.id === id)
  if (!shop) throw new ApiError(404, `Unknown shop ${id}`)
  const pkgs = (flow.gaps?.suggestions ?? []).filter((s) => s.shop_id === id)
  const pending = new Set(pkgs.filter((p) => p.status === "funded" && p.cert_unlock).map((p) => p.cert_unlock as string))

  const certifications: Certification[] = (shop.cert_summary ?? []).map(
    (c) =>
      ({
        shop_id: id,
        type: c.type,
        status: pending.has(c.type) && c.status === "unknown" ? "pending_training" : c.status,
        source_url: null,
        verified_at: null,
        expires_at: null,
        note: shop.source === "synthetic" ? "Synthetic shop: status is illustrative" : "Public data — unverified",
      }) as Certification
  )
  for (const cert of pending) {
    if (!certifications.some((c) => c.type === cert)) {
      certifications.push({
        shop_id: id,
        type: cert,
        status: "pending_training",
        source_url: null,
        verified_at: null,
        expires_at: null,
        note: "Created by a funded training package (simulated)",
      } as Certification)
    }
  }

  const prime = flow.program?.prime_name ?? "Northgate Land Systems"
  const offers: Offer[] = flow.assignments
    .filter((a) => a.shop_id === id)
    .map(
      (a) =>
        ({
          job_id: a.job_id,
          part_no: a.part_no,
          description: a.description,
          program_id: PID,
          prime_name: prime,
          value_cad: a.value_cad,
          hours_week: a.hours_week,
          multiplier: a.multiplier,
          credit_cad: a.credit_cad,
          reasons: a.reasons,
          status: a.status,
        }) as Offer
    )

  const training: ShopTraining[] = pkgs.map(
    (p) =>
      ({
        package_id: p.id,
        status: p.status,
        category: p.category,
        trainees: p.trainees,
        recipient_example: p.recipient_example,
        cert_unlock: p.cert_unlock,
        capacity_unlock: p.capacity_unlock,
        message: trainingMessage(p),
      }) as ShopTraining
  )

  return { shop, certifications, offers, readiness: [], training } as ShopDetailResponse
}

function fxShopDetail(id: string, flow: FlowData): ShopDetailResponse {
  const afterFund = flow.fundedIds.includes(IDS.demoPackageId)
  const d = fx<ShopDetailResponse>("GET", `/shops/${id}`, afterFund)
  const routed = flow.stage === "routed" || flow.stage === "funded"
  // Before routing there are no jobs, so no offers and nothing "within reach" (matches the engine).
  if (d) return routed ? d : { ...d, offers: [], readiness: [] }
  const shops = fx<ShopsResponse>("GET", "/shops")?.shops ?? []
  return deriveShopDetail(id, shops, flow)
}

function applyOfferStatus(d: ShopDetailResponse, status: Record<string, OfferDecision>): ShopDetailResponse {
  const sid = d.shop.id
  return {
    ...d,
    offers: d.offers.map((o) => {
      const s = status[`${sid}:${o.job_id}`]
      return s ? ({ ...o, status: s } as Offer) : o
    }),
  }
}

// ---------------------------------------------------------------------------
// Provider

function flowOf(s: DemoState): FlowData {
  return {
    stage: s.stage,
    program: s.program,
    jobs: s.jobs,
    assignments: s.assignments,
    blocked: s.blocked,
    routeStats: s.routeStats,
    solver: s.solver,
    ledger: s.ledger,
    gaps: s.gaps,
    fundResults: s.fundResults,
    lastFund: s.lastFund,
    fundedIds: s.fundedIds,
  }
}

const DemoContext = React.createContext<DemoContextValue | null>(null)

function initialState(): DemoState {
  return {
    ...emptyFlow(null),
    mode: ENV_MODE === "live" ? "live" : "fixtures",
    busy: BUSY.connecting,
    error: null,
    demoShopId: IDS.demoShopId,
    offerStatus: {},
    ready: false,
    fileName: null,
    apiUrl: API_URL,
  }
}

export function DemoProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, setState] = React.useState<DemoState>(initialState)
  const stateRef = React.useRef(state)
  const modeOverrideRef = React.useRef<Mode | null>(null)
  const setModeRef = React.useRef<(m: Mode) => void>(() => {})
  /** Bumped on every mode switch; in-flight actions from an older generation drop their result. */
  const genRef = React.useRef(0)

  React.useEffect(() => {
    stateRef.current = state
  }, [state])

  const patch = React.useCallback((p: Partial<DemoState> | ((s: DemoState) => Partial<DemoState>)) => {
    setState((s) => {
      const next = { ...s, ...(typeof p === "function" ? p(s) : p) }
      stateRef.current = next
      return next
    })
  }, [])

  const handleError = React.useCallback(
    (e: unknown, context: string) => {
      const err = e instanceof ApiError ? e : new ApiError(0, e instanceof Error ? e.message : String(e))
      const offline = err.network || err.status >= 500
      const message = `${context}: ${err.message}`
      patch({ error: message, busy: null })
      const inLive = stateRef.current.mode === "live"
      toast.error(context, {
        description: offline && inLive ? `${err.message}. You can keep going in demo mode.` : err.message,
        action:
          offline && inLive
            ? { label: "Switch to demo mode", onClick: () => setModeRef.current("fixtures") }
            : undefined,
        duration: offline ? 10000 : 6000,
      })
    },
    [patch]
  )

  // Detect mode and restore the flow once on mount.
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      const p = readPersisted()
      modeOverrideRef.current = p?.modeOverride ?? null
      // A saved "fixtures" choice is honoured as-is. A saved "live" choice still
      // probes the engine, so a reload with the engine down falls back to demo mode.
      let mode: Mode
      if (p?.modeOverride === "fixtures") mode = "fixtures"
      else if (p?.modeOverride === "live" || ENV_MODE === "auto") {
        mode = (await probeLive()) ? "live" : "fixtures"
        if (mode === "fixtures" && p?.modeOverride === "live") {
          modeOverrideRef.current = null
          toast.message("Live engine not reachable", { description: "Continuing in demo mode with the same steps." })
        }
      } else mode = ENV_MODE
      if (cancelled) return

      const restored = {
        offerStatus: p?.offerStatus ?? {},
        fileName: p?.stage && p.stage !== "empty" ? p.fileName : null,
      }
      if (mode === "fixtures") {
        const flow = replayFixtures(p)
        patch({ ...flow, ...restored, mode, ready: true, busy: null, error: null })
        return
      }
      try {
        const flow = await loadLive()
        if (cancelled) return
        patch({ ...flow, ...restored, mode, ready: true, busy: null, error: null })
      } catch (e) {
        if (cancelled) return
        if (ENV_MODE === "live") {
          patch({ ...emptyFlow(fxProgram()), mode, ready: true, busy: null })
          handleError(e, "Could not load the program from the engine")
          return
        }
        // Engine answered the probe but failed to load: keep going on fixtures.
        modeOverrideRef.current = null
        patch({ ...replayFixtures(p), ...restored, mode: "fixtures", ready: true, busy: null, error: null })
        toast.message("Live engine not responding", { description: "Continuing in demo mode with the same steps." })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [patch, handleError])

  // Persist the replayable parts of the session.
  React.useEffect(() => {
    if (!state.ready) return
    writePersisted({
      modeOverride: modeOverrideRef.current,
      stage: state.stage,
      funded: state.fundedIds,
      offerStatus: state.offerStatus,
      fileName: state.fileName,
    })
  }, [state.ready, state.stage, state.fundedIds, state.offerStatus, state.fileName, state.mode])

  // Live mode: keep fund responses + solver so a reload can restore the Gaps/Scorecard/Shop panels.
  React.useEffect(() => {
    if (!state.ready || state.mode !== "live") return
    if (state.stage !== "routed" && state.stage !== "funded") return
    writeLiveCache({ solver: state.solver, fundResults: state.fundResults, order: state.fundedIds })
  }, [state.ready, state.mode, state.stage, state.solver, state.fundResults, state.fundedIds])


  // ---- actions -----------------------------------------------------------

  const reset = React.useCallback(async () => {
    patch({ busy: BUSY.reset, error: null })
    try {
      let program = stateRef.current.program
      if (stateRef.current.mode === "live") {
        await http("POST", "/demo/reset")
        program = (await http<ProgramResponse>("GET", `/programs/${PID}`)).program
      } else {
        await latency()
        fx("POST", "/demo/reset")
        program = program ?? fxProgram()
      }
      patch({ ...emptyFlow(program), offerStatus: {}, fileName: null, busy: null, error: null })
      toast.success("Demo reset", { description: "Shops and program seeded; no parts uploaded." })
    } catch (e) {
      handleError(e, "Reset failed")
    }
  }, [patch, handleError])

  const uploadParts = React.useCallback(
    async (file?: File) => {
      const s = stateRef.current
      const gen = genRef.current
      const fileName = file?.name ?? null
      try {
        if (s.mode === "live") {
          let lines: number | undefined
          if (file) {
            try {
              lines = (await file.text()).split(/\r?\n/).filter((l) => l.trim()).length - 1
            } catch {
              lines = undefined
            }
          }
          patch({ busy: BUSY.upload(lines && lines > 0 ? lines : undefined), error: null })
          let res: PartsUploadResponse
          if (file) {
            const fd = new FormData()
            fd.append("file", file)
            res = await http<PartsUploadResponse>("POST", `/programs/${PID}/parts`, { body: fd })
          } else {
            res = await http<PartsUploadResponse>("POST", `/programs/${PID}/parts?use_demo=true`)
          }
          if (gen !== genRef.current) return
          patch((cur) => ({
            ...emptyFlow(cur.program),
            stage: "uploaded",
            jobs: res.jobs,
            fileName,
            offerStatus: {},
            busy: null,
          }))
          toast.success(`Tagged ${res.count} parts lines`, { description: fileName ?? "Northgate demo parts list" })
        } else {
          const count = fx<PartsUploadResponse>("POST", `/programs/${PID}/parts`)?.count
          patch({ busy: BUSY.upload(count), error: null })
          await latency()
          await latency()
          if (gen !== genRef.current) return
          const flow = fxUpload(flowOf(stateRef.current))
          patch({ ...flow, fileName, offerStatus: {}, busy: null })
          toast.success(`Tagged ${flow.jobs.length} parts lines`, {
            description: fileName ? `${fileName} (demo mode uses the Northgate list)` : "Northgate demo parts list",
          })
        }
      } catch (e) {
        if (gen !== genRef.current) return
        handleError(e, "Upload failed")
      }
    },
    [patch, handleError]
  )

  const route = React.useCallback(async () => {
    const s = stateRef.current
    const gen = genRef.current
    patch({ busy: s.jobs.length ? `Routing ${s.jobs.length} jobs…` : BUSY.route, error: null })
    try {
      if (s.mode === "live") {
        const r = await http<RouteResponse>("POST", `/programs/${PID}/route`)
        const [ledger, gaps] = await Promise.all([
          http<LedgerResponse>("GET", `/programs/${PID}/ledger`),
          http<GapsResponse>("GET", `/programs/${PID}/gaps`),
        ])
        if (gen !== genRef.current) return
        patch((cur) => {
          const baseJobs = cur.jobs.length ? cur.jobs : deriveJobs(r.assignments, r.blocked)
          return {
            stage: "routed",
            assignments: r.assignments,
            blocked: r.blocked,
            routeStats: r.stats,
            solver: r.solver,
            ledger,
            gaps,
            jobs: withJobStatus(baseJobs, r.assignments, r.blocked),
            fundResults: {},
            lastFund: null,
            fundedIds: [],
            busy: null,
          }
        })
      } else {
        await latency()
        await latency()
        if (gen !== genRef.current) return
        const flow = fxRoute(flowOf(stateRef.current))
        patch({ ...flow, busy: null })
      }
    } catch (e) {
      if (gen !== genRef.current) return
      handleError(e, "Routing failed")
    }
  }, [patch, handleError])

  const fund = React.useCallback(
    async (packageId: string): Promise<FundResponse | undefined> => {
      const s = stateRef.current
      const gen = genRef.current
      patch({ busy: BUSY.fund, error: null })
      try {
        if (s.mode === "live") {
          const res = await http<FundResponse>("POST", `/programs/${PID}/training/${encodeURIComponent(packageId)}/fund`)
          const routed = await liveRoutedState(s.jobs.length ? s.jobs : null)
          if (gen !== genRef.current) return undefined
          patch((cur) => ({
            ...routed,
            stage: "funded",
            fundResults: { ...cur.fundResults, [packageId]: res },
            lastFund: res,
            fundedIds: cur.fundedIds.includes(packageId) ? cur.fundedIds : [...cur.fundedIds, packageId],
            busy: null,
          }))
          return res
        }
        await latency()
        await latency()
        if (gen !== genRef.current) return undefined
        const { flow, res } = fxFund(flowOf(stateRef.current), packageId)
        patch({ ...flow, busy: null })
        return res
      } catch (e) {
        if (gen !== genRef.current) return undefined
        handleError(e, "Funding failed")
        return undefined
      }
    },
    [patch, handleError]
  )

  const getShops = React.useCallback(async (): Promise<ShopsResponse> => {
    if (stateRef.current.mode === "live") {
      try {
        return await http<ShopsResponse>("GET", "/shops")
      } catch (e) {
        handleError(e, "Could not load shops")
      }
    } else {
      await sleep(250)
    }
    return fx<ShopsResponse>("GET", "/shops") ?? ({ shops: [] } as unknown as ShopsResponse)
  }, [handleError])

  const getShop = React.useCallback(
    async (id: string): Promise<ShopDetailResponse> => {
      const s = stateRef.current
      if (s.mode === "live") {
        try {
          const d = await http<ShopDetailResponse>("GET", `/shops/${encodeURIComponent(id)}`)
          return applyOfferStatus(d, stateRef.current.offerStatus)
        } catch (e) {
          handleError(e, "Could not load this shop")
        }
      } else {
        await latency()
      }
      return applyOfferStatus(fxShopDetail(id, flowOf(stateRef.current)), stateRef.current.offerStatus)
    },
    [handleError]
  )

  const setOfferStatus = React.useCallback(
    (shopId: string, jobId: string, status: OfferDecision) => {
      patch((cur) => ({ offerStatus: { ...cur.offerStatus, [`${shopId}:${jobId}`]: status } }))
    },
    [patch]
  )

  const setMode = React.useCallback(
    (m: Mode) => {
      const gen = ++genRef.current
      modeOverrideRef.current = m
      const cur = stateRef.current
      if (m === "fixtures") {
        // Keep the presenter's place: replay the same step (and funded packages) on fixtures.
        const flow = replayFixtures({
          modeOverride: "fixtures",
          stage: cur.stage,
          funded: cur.fundedIds,
          offerStatus: cur.offerStatus,
          fileName: cur.fileName,
        })
        patch({
          ...flow,
          mode: m,
          offerStatus: flow.stage === "empty" ? {} : cur.offerStatus,
          fileName: flow.stage === "empty" ? null : cur.fileName,
          error: null,
          busy: null,
        })
        toast.success("Demo mode", { description: "Using checked-in fixtures; your place in the demo is kept." })
        return
      }
      // Live: the engine is reset so its state matches the (empty) flow shown.
      patch({ ...emptyFlow(cur.program), mode: m, offerStatus: {}, fileName: null, error: null, busy: BUSY.mode })
      void (async () => {
        try {
          await http("POST", "/demo/reset", { timeoutMs: 5000 })
          const prog = await http<ProgramResponse>("GET", `/programs/${PID}`)
          if (gen !== genRef.current) return
          patch({ program: prog.program, busy: null })
          toast.success("Connected to the live engine", { description: API_URL })
        } catch (e) {
          if (gen !== genRef.current) return
          handleError(e, "Could not reach the live engine")
        }
      })()
    },
    [patch, handleError]
  )

  React.useEffect(() => {
    setModeRef.current = setMode
  }, [setMode])

  // demoShopId: fixtures → index.json; live → the shop whose package unblocks the most jobs.
  const demoShopId = React.useMemo(() => {
    if (state.mode === "live" && state.gaps?.suggestions?.length) {
      const best = [...state.gaps.suggestions].sort(
        (a, b) => (b.blocked_job_ids?.length ?? 0) - (a.blocked_job_ids?.length ?? 0)
      )[0]
      if (best?.shop_id) return best.shop_id
    }
    return IDS.demoShopId
  }, [state.mode, state.gaps])

  const value = React.useMemo<DemoContextValue>(
    () => ({
      ...state,
      demoShopId,
      reset,
      uploadParts,
      route,
      fund,
      getShops,
      getShop,
      setOfferStatus,
      setMode,
    }),
    [state, demoShopId, reset, uploadParts, route, fund, getShops, getShop, setOfferStatus, setMode]
  )

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export function useDemo(): DemoContextValue {
  const ctx = React.useContext(DemoContext)
  if (!ctx) throw new Error("useDemo must be used inside <DemoProvider>")
  return ctx
}

/** Demo ids from data/fixtures/index.json. */
export const DEMO_IDS = IDS
