"use client"

// Shieldworks demo data layer. One provider holds the whole demo flow
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
import { CERT_LABEL, fmtMoney } from "@/lib/format"
import { demoIds, fx } from "./fixture-source"
import { c } from "@/lib/ui/copy"
import { STATIC_SITE } from "@/lib/base-path"

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
  /**
   * Live, and the engine could not be reached at load with no earlier live flow saved in this
   * browser: the empty flow on screen is not a fact. Views show "Can't reach Shieldworks right now"
   * instead of their empty-step copy. Cleared as soon as the engine answers (or on demo data).
   */
  loadFailed: boolean
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
  /**
   * Replace every offer answer at once (live: the actions store mirrors the engine's current
   * decisions, so an undo, reset or reseed elsewhere clears rows setOfferStatus never could).
   */
  replaceOfferStatus(next: Record<string, OfferDecision>): void
  setMode(m: Mode): void
}

/** A declined job sent to another qualified synthetic shop (demo; credit stays counted as placed). */
export interface Reoffer {
  job_id: string
  shop_id: string
  shop_name: string | null
  from_shop_id: string | null
  at: string
}

export interface DemoReoffers {
  /**
   * Re-offers made from this browser, by job id. Live ones also come back from the engine as
   * `reoffered` events (lib/search/reoffers.ts merges both). Cleared when the flow restarts.
   */
  reoffers: Record<string, Reoffer>
  /**
   * POST /programs/{id}/jobs/{job}/reoffer {shop_id} in live mode; a local record in demo mode.
   * Never changes assignments, credit or the promise %. null (with a toast) on failure.
   */
  reofferJob(jobId: string, shopId: string, shopName?: string | null, fromShopId?: string | null): Promise<Reoffer | null>
}

export type DemoContextValue = DemoState & DemoActions & DemoReoffers

// ---------------------------------------------------------------------------
// Config

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "")
const RAW_MODE = (process.env.NEXT_PUBLIC_DEMO_MODE || "auto").toLowerCase()
const ENV_MODE: "auto" | Mode = RAW_MODE === "live" || RAW_MODE === "fixtures" ? RAW_MODE : "auto"
const PID = "northgate"

// ---------------------------------------------------------------------------
// Runtime overrides (?api=<url>, ?mode=live|fixtures|auto), kept in sessionStorage
// so client navigation and reloads keep them. Without an override nothing changes.

const SESSION_API_KEY = "muster.override.api"
const SESSION_MODE_KEY = "muster.override.mode"
/** Resolved on the client at mount; module scope so http() needs no plumbing. */
let apiBase = API_URL
let envMode: "auto" | Mode = ENV_MODE
let modeOverridden = false

function validApi(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    const clean = `${u.origin}${u.pathname}`.replace(/\/+$/, "")
    if (clean === API_URL) return clean
    if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return null
    if (u.username || u.password) return null
    return clean
  } catch {
    return null
  }
}

function validMode(raw: string | null | undefined): "auto" | Mode | null {
  const m = (raw || "").trim().toLowerCase()
  return m === "live" || m === "fixtures" || m === "auto" ? m : null
}

function sessionGet(k: string): string | null {
  try {
    return window.sessionStorage.getItem(k)
  } catch {
    return null
  }
}

function sessionSet(k: string, v: string) {
  try {
    window.sessionStorage.setItem(k, v)
  } catch {
    /* storage unavailable: override lasts until the next full reload */
  }
}

/** Read URL query then sessionStorage; apply to apiBase/envMode. Client only. */
function resolveOverrides() {
  // Static GitHub Pages build: demo data only, so ?mode= and ?api= are ignored (no engine to reach).
  if (STATIC_SITE) return
  let q: URLSearchParams | null = null
  try {
    q = new URLSearchParams(window.location.search)
  } catch {
    q = null
  }
  const qApi = validApi(q?.get("api"))
  if (qApi) sessionSet(SESSION_API_KEY, qApi)
  const qMode = validMode(q?.get("mode"))
  if (qMode) sessionSet(SESSION_MODE_KEY, qMode)
  const api = qApi ?? validApi(sessionGet(SESSION_API_KEY))
  const mode = qMode ?? validMode(sessionGet(SESSION_MODE_KEY))
  apiBase = api ?? API_URL
  envMode = mode ?? ENV_MODE
  modeOverridden = mode !== null
}
const STORAGE_KEY = "muster.demo.v1"
/** Live-mode extras the engine cannot give back after a reload (fund responses, solver). */
const LIVE_CACHE_KEY = "muster.demo.live.v1"
/** Last flow read from the live engine: what a reload shows while the engine is unreachable. */
const LIVE_FLOW_KEY = "muster.demo.liveflow.v1"
const IDS = demoIds()

export const BUSY = {
  connecting: "Connecting to engine…",
  reset: c("busy.reset"),
  // Callers still pass the line count; the §8.1 label no longer shows it.
  upload: (n?: number): string => {
    void n
    return c("busy.upload")
  },
  route: c("busy.route"),
  fund: c("busy.fund"),
  mode: "Switching mode…",
} as const

// ---------------------------------------------------------------------------
// Persistence (every access guarded)

interface Persisted {
  modeOverride: Mode | null
  stage: Stage
  funded: string[]
  /** Only written for demo data: live offer answers come from the engine (the actions store). */
  offerStatus: Record<string, OfferDecision>
  fileName: string | null
  /** The mode the page last ran in, so an "auto" reload during an engine outage stays live. */
  lastMode: Mode | null
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
      lastMode: p.lastMode === "live" || p.lastMode === "fixtures" ? p.lastMode : null,
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

function readLiveFlow(): FlowData | null {
  try {
    const raw = window.localStorage.getItem(LIVE_FLOW_KEY)
    if (!raw) return null
    const f = JSON.parse(raw) as Partial<FlowData>
    const stages: Stage[] = ["empty", "uploaded", "routed", "funded"]
    if (!f || !stages.includes(f.stage as Stage)) return null
    if (!Array.isArray(f.jobs) || !Array.isArray(f.assignments) || !Array.isArray(f.blocked) || !Array.isArray(f.fundedIds)) {
      return null
    }
    return {
      ...emptyFlow(f.program ?? null),
      ...f,
      fundResults: f.fundResults && typeof f.fundResults === "object" ? f.fundResults : {},
    } as FlowData
  } catch {
    return null
  }
}

function writeLiveFlow(f: FlowData) {
  try {
    window.localStorage.setItem(LIVE_FLOW_KEY, JSON.stringify(f))
  } catch {
    /* storage unavailable or full: an outage reload shows an empty live page instead */
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
  opts: { body?: BodyInit; json?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30000)
  let res: Response
  try {
    res = await fetch(`${apiBase}${path}`, {
      method,
      body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
      signal: ctrl.signal,
      headers:
        opts.json !== undefined
          ? { Accept: "application/json", "Content-Type": "application/json" }
          : { Accept: "application/json" },
      cache: "no-store",
    })
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError"
    throw new ApiError(0, aborted ? "The engine did not respond in time" : `Cannot reach the engine at ${apiBase}`, true)
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

/** GET /health when the page decides between live and demo data. */
const PROBE_HEALTH_MS = 4500
/**
 * Flow reads (the load probe and the engine watcher): at least as patient as the phone's
 * actions store (lib/app/api.ts, 5-10 s), so a slow engine never leaves the laptop on an empty
 * step under a Live pill while the phone, reading the same engine, shows the real data.
 */
const FLOW_READ_MS = 6000

async function probeLive(): Promise<boolean> {
  try {
    // Generous on purpose: a slow engine (or Wi-Fi) must not drop an "auto" page to demo data
    // for the whole session. A dead host refuses the connection at once, so this rarely waits.
    const h = await http<{ status?: string }>("GET", "/health", { timeoutMs: PROBE_HEALTH_MS })
    if (h?.status !== "ok") return false
  } catch {
    return false
  }
  try {
    await http("GET", `/programs/${PID}`, { timeoutMs: FLOW_READ_MS })
    return true
  } catch (e) {
    // 4xx (e.g. 404 before seeding) still means the engine is implemented.
    return e instanceof ApiError && !e.network && e.status < 500
  }
}

// ---------------------------------------------------------------------------
// Pure helpers

/** "Claude read all 40 lines" (or "Claude read 38 lines · 2 read by keyword rules") plus "· 1 line needs review". */
function taggerSummary(res: PartsUploadResponse): string {
  const t = (res.tagger ?? {}) as Record<string, number>
  const counts = res.jobs.reduce<Record<string, number>>((m, j) => {
    m[j.tag_source] = (m[j.tag_source] ?? 0) + 1
    return m
  }, {})
  const src = (k: string) => (typeof t[k] === "number" ? t[k] : (counts[k] ?? 0))
  const parts: string[] = []
  const claude = src("llm") + src("cache")
  parts.push(
    src("rules") > 0
      ? c("program.toast.taggedMixed", { llm: claude, rules: src("rules") })
      : c("program.toast.tagged", { n: claude })
  )
  const review = res.jobs.filter((j) => j.tag_warning).length
  if (review > 0) parts.push(`${review} line${review === 1 ? "" : "s"} need${review === 1 ? "s" : ""} review`)
  return parts.join(" · ")
}

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

/**
 * Rebuild FundResponses the browser never saw (fresh context, or a package funded
 * elsewhere) from engine data, so /gaps, the scorecard and the shop page show the
 * funded state. The ledger is ordered: each training txn is followed by the
 * assignment txns of the jobs it unblocked. Walks packages newest-first so each
 * "before" is the previous package's "after". Marked synthetic (no animation).
 */
function synthesizeFunds(
  routed: Pick<FlowData, "assignments" | "blocked" | "ledger" | "gaps">,
  fundedIds: string[],
  known: Record<string, FundResponse>
): Record<string, FundResponse> {
  const { ledger, gaps } = routed
  if (!ledger || !gaps || fundedIds.every((id) => known[id])) return known
  const txns = ledger.transactions
  const byJob = new Map(routed.assignments.map((a) => [a.job_id, a]))
  const out: Record<string, FundResponse> = { ...known }

  let after: Snapshot = snapshot(ledger, routed.assignments.length, routed.blocked.length)
  for (const id of [...fundedIds].reverse()) {
    const pkg = gaps.suggestions.find((x) => x.id === id)
    const ti = txns.findIndex((t) => t.origin === "training" && t.ref_id === id)
    const existing = out[id]
    if (existing) {
      after = existing.before
      continue
    }
    if (!pkg || ti < 0) continue
    const trainingTxn = txns[ti]
    const unblocked: Assignment[] = []
    for (let i = ti + 1; i < txns.length && txns[i].origin !== "training"; i++) {
      const a = txns[i].origin === "assignment" ? byJob.get(txns[i].ref_id) : undefined
      if (a) unblocked.push(a)
    }
    const jobsCad = round2(sum(unblocked.map((a) => a.credit_cad)))
    const trainingCad = round2(trainingTxn.credit_cad)
    const added = round2(trainingCad + jobsCad)
    const smbLess = sum(unblocked.filter((a) => a.category === "sme_direct").map((a) => a.value_cad * a.ccv_pct))
    const creditBefore = round2(after.credit_total_cad - added)
    const smbBefore = round2(after.smb_achieved_cad - smbLess)
    const before: Snapshot = {
      assigned: after.assigned - unblocked.length,
      blocked: after.blocked + unblocked.length,
      credit_total_cad: creditBefore,
      obligation_met_pct: ledger.obligation_cad > 0 ? creditBefore / ledger.obligation_cad : 0,
      direct_credit_cad: round2(after.direct_credit_cad - jobsCad),
      indirect_credit_cad: round2(after.indirect_credit_cad - trainingCad),
      smb_achieved_cad: smbBefore,
      smb_progress_pct: ledger.smb.target_cad > 0 ? smbBefore / ledger.smb.target_cad : 0,
    } as Snapshot
    const n = unblocked.length
    const res = {
      program_id: PID,
      package_id: id,
      package: pkg,
      before,
      after,
      unblocked_jobs: unblocked,
      still_blocked: routed.blocked.map((b) => b.job_id),
      training_txn: trainingTxn,
      credit_added: added,
      credit_added_breakdown: { training_cad: trainingCad, jobs_cad: jobsCad },
      headline:
        `${fmtMoney(pkg.est_cost_cad, { compact: true })} training → ${fmtMoney(pkg.est_credit_cad, { compact: true })} credit ` +
        `(${pkg.multiplier}x) + ${n} job${n === 1 ? "" : "s"} unblocked (+${fmtMoney(jobsCad, { compact: true })} credit)`,
      synthetic: true,
    } as FundResponse
    out[id] = res
    after = before
  }
  return out
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
  const cached: Record<string, FundResponse> = {}
  for (const id of fundedIds) if (cache.fundResults[id]) cached[id] = cache.fundResults[id]
  const fundResults = synthesizeFunds(routed, fundedIds, cached)
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

/**
 * Fixtures /shops is the pre-fund snapshot. Apply each funded package's unlocks
 * (extra weekly hours, the certification now in training) so the Network page
 * agrees with the shop page and with live mode.
 */
function withFundedUnlocks(list: ShopsResponse, flow: FlowData): ShopsResponse {
  const pkgs = (flow.gaps?.suggestions ?? []).filter((p) => flow.fundedIds.includes(p.id))
  if (pkgs.length === 0) return list
  return {
    ...list,
    shops: list.shops.map((shop) => {
      const mine = pkgs.filter((p) => p.shop_id === shop.id)
      if (mine.length === 0) return shop
      let hours = shop.capacity_hours_week
      let certs = [...(shop.cert_summary ?? [])]
      for (const p of mine) {
        hours += sum(Object.values(p.capacity_unlock ?? {}).map((h) => Number(h) || 0))
        if (p.cert_unlock) {
          const cert = p.cert_unlock
          const has = certs.find((c) => c.type === cert)
          if (!has) certs = [...certs, { type: cert, status: "pending_training" } as (typeof certs)[number]]
          else if (has.status === "unknown")
            certs = certs.map((c) => (c.type === cert ? ({ ...c, status: "pending_training" } as typeof c) : c))
        }
      }
      return { ...shop, capacity_hours_week: hours, cert_summary: certs }
    }),
  }
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
// Live: what the engine holds, in words, and a fingerprint to spot changes made elsewhere

/** One plain line for the "Connected to the live engine" toast. */
function liveSummary(flow: FlowData): string {
  if (flow.stage === "empty") return "No parts list on the engine yet."
  if (flow.stage === "uploaded") return `${flow.jobs.length} parts lines read, not matched yet.`
  const funded = flow.fundedIds.length ? ` · ${flow.fundedIds.join(", ")} funded` : ""
  return `${flow.assignments.length} jobs matched · ${flow.blocked.length} stuck${funded}`
}

/** Everything the laptop draws from the engine flow; equal fingerprints mean nothing to redraw. */
function flowFingerprint(f: Pick<FlowData, "stage" | "jobs" | "assignments" | "blocked" | "fundedIds" | "ledger">): string {
  return JSON.stringify([
    f.stage,
    f.jobs.length,
    f.assignments.map((a) => `${a.job_id}>${a.shop_id}`).sort(),
    f.blocked.map((b) => b.job_id).sort(),
    [...f.fundedIds].sort(),
    f.ledger ? Math.round(f.ledger.credit_total_cad) : null,
  ])
}

/** Event kinds that change the program flow (the rest are shop answers, handled by the actions store). */
const FLOW_EVENT_KINDS = new Set(["routed", "package_funded"])
/** How often the laptop checks whether another screen reset, reseeded or funded on the shared engine. */
const ENGINE_WATCH_MS = 4000

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
    loadFailed: false,
    fileName: null,
    apiUrl: API_URL,
  }
}

const REOFFER_KEY = "muster.reoffers.v1"

/** Re-offers saved by this browser (bad or missing data → none). */
function readReoffers(): Record<string, Reoffer> {
  try {
    const raw = window.localStorage.getItem(REOFFER_KEY)
    const p = raw ? (JSON.parse(raw) as unknown) : null
    if (!p || typeof p !== "object") return {}
    const out: Record<string, Reoffer> = {}
    for (const [k, v] of Object.entries(p as Record<string, Partial<Reoffer>>)) {
      if (v && typeof v.shop_id === "string" && typeof v.at === "string")
        out[k] = { job_id: k, shop_id: v.shop_id, shop_name: v.shop_name ?? null, from_shop_id: v.from_shop_id ?? null, at: v.at }
    }
    return out
  } catch {
    return {}
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
    (e: unknown, context: string, extra?: string) => {
      const err = e instanceof ApiError ? e : new ApiError(0, e instanceof Error ? e.message : String(e))
      const offline = err.network || err.status >= 500
      const message = `${context}: ${err.message}`
      patch({ error: message, busy: null })
      const inLive = stateRef.current.mode === "live"
      toast.error(context, {
        // One toast per context: repeated failures (e.g. every tab switch while offline) replace it.
        id: `store-error:${context}`,
        description: extra
          ? `${err.message.replace(/[.\s]*$/, "")}. ${extra}`
          : offline && inLive
            ? `${err.message}. You can keep going in demo mode.`
            : err.message,
        action:
          offline && inLive
            ? { label: "Switch to demo mode", onClick: () => setModeRef.current("fixtures") }
            : undefined,
        duration: offline ? 10000 : 6000,
      })
    },
    [patch]
  )

  /**
   * Live mode: a 409 (already funded) or 400 (not routed yet) means the engine
   * changed under the page (another tab, a script, make reset-demo). Reload the
   * flow from the engine so the page stops contradicting it. Returns true when it did.
   */
  const resyncIfStale = React.useCallback(
    async (e: unknown, context: string, gen: number): Promise<boolean> => {
      if (stateRef.current.mode !== "live" || !(e instanceof ApiError) || (e.status !== 409 && e.status !== 400)) {
        return false
      }
      handleError(e, context, "The engine changed elsewhere. Page refreshed.")
      try {
        const flow = await loadLive()
        if (gen !== genRef.current) return true
        patch((cur) => ({
          ...flow,
          busy: null,
          error: null,
          loadFailed: false,
          offerStatus: flow.stage === "empty" ? {} : cur.offerStatus,
          fileName: flow.stage === "empty" ? null : cur.fileName,
        }))
      } catch {
        /* engine unreachable now: the error toast above already offers demo mode */
      }
      return true
    },
    [patch, handleError]
  )

  /**
   * Live, engine unreachable at load: the page stays live and shows the last live flow
   * (or an empty live page). The engine watcher reloads the flow on its first answer,
   * and the actions store sends anything queued meanwhile.
   */
  const offlineLoadRef = React.useRef(false)

  // Detect mode and restore the flow once on mount.
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      resolveOverrides()
      const saved = readPersisted()
      // A runtime ?mode= override beats the saved switcher choice.
      const p = saved && modeOverridden ? { ...saved, modeOverride: null } : saved
      modeOverrideRef.current = p?.modeOverride ?? null
      // Only an explicit "Demo data" choice (switcher or ?mode=fixtures) means fixtures.
      // Live asked for (switcher, ?mode=live, env live, or an "auto" page that last ran
      // live) stays live through an engine outage instead of silently dropping to demo data.
      const liveWanted =
        p?.modeOverride === "live" ||
        (p?.modeOverride !== "fixtures" && (envMode === "live" || (envMode === "auto" && p?.lastMode === "live")))
      let mode: Mode
      if (STATIC_SITE || p?.modeOverride === "fixtures") mode = "fixtures"
      else if (liveWanted) mode = "live"
      else if (envMode === "auto") mode = (await probeLive()) ? "live" : "fixtures"
      else mode = envMode
      if (cancelled) return

      const fileName = p?.stage && p.stage !== "empty" ? p.fileName : null
      if (mode === "fixtures") {
        const flow = replayFixtures(p)
        patch({ ...flow, offerStatus: p?.offerStatus ?? {}, fileName, mode, apiUrl: apiBase, ready: true, loadFailed: false, busy: null, error: null })
        return
      }
      // Live: offer answers always come from the engine (the actions store mirrors them in),
      // never from an earlier session's localStorage.
      try {
        // A short probe first, so a dead host never leaves the page on "Connecting" for 30 s.
        if (liveWanted && !(await probeLive())) throw new ApiError(0, "Engine not reachable", true)
        const flow = await loadLive()
        if (cancelled) return
        offlineLoadRef.current = false
        patch({ ...flow, offerStatus: {}, fileName, mode, apiUrl: apiBase, ready: true, loadFailed: false, busy: null, error: null })
      } catch {
        if (cancelled) return
        const cached = readLiveFlow()
        offlineLoadRef.current = true
        patch({
          ...(cached ?? emptyFlow(null)),
          offerStatus: {},
          fileName: cached && cached.stage !== "empty" ? fileName : null,
          mode: "live",
          apiUrl: apiBase,
          ready: true,
          // Nothing saved from an earlier live load: the empty flow is a placeholder, not a fact.
          loadFailed: !cached,
          busy: null,
          error: null,
        })
        toast.message("Not connected to the live engine", {
          id: "engine-offline",
          description: cached
            ? "Showing the last live data. Shieldworks reconnects on its own and sends anything waiting."
            : "Shieldworks reconnects on its own and sends anything waiting.",
          action: { label: "Use demo data", onClick: () => setModeRef.current("fixtures") },
          duration: 10000,
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [patch])

  // Persist the replayable parts of the session.
  React.useEffect(() => {
    if (!state.ready) return
    writePersisted({
      modeOverride: modeOverrideRef.current,
      stage: state.stage,
      funded: state.fundedIds,
      // Live answers belong to the engine: never persist them, or a reseed/reset elsewhere
      // would come back from localStorage as stale "Answered" rows.
      offerStatus: state.mode === "live" ? {} : state.offerStatus,
      fileName: state.fileName,
      lastMode: state.mode,
    })
  }, [state.ready, state.stage, state.fundedIds, state.offerStatus, state.fileName, state.mode])

  // Live: keep the last engine flow so a reload during an outage still shows it.
  React.useEffect(() => {
    if (!state.ready || state.mode !== "live" || state.busy) return
    // Hydrated from the snapshot while offline: nothing new to save until the engine answers.
    if (offlineLoadRef.current) return
    writeLiveFlow(flowOf(stateRef.current))
  }, [
    state.ready,
    state.mode,
    state.busy,
    state.stage,
    state.program,
    state.jobs,
    state.assignments,
    state.blocked,
    state.ledger,
    state.gaps,
    state.fundResults,
    state.fundedIds,
  ])

  // Live mode: keep fund responses + solver so a reload can restore the Gaps/Scorecard/Shop panels.
  React.useEffect(() => {
    if (!state.ready || state.mode !== "live") return
    if (state.stage !== "routed" && state.stage !== "funded") return
    writeLiveCache({ solver: state.solver, fundResults: state.fundResults, order: state.fundedIds })
  }, [state.ready, state.mode, state.stage, state.solver, state.fundResults, state.fundedIds])


  // Live: another client (a phone's "Fill with demo activity", a script, another laptop)
  // can reset, reseed, re-route or fund the shared engine. Every few seconds, while the tab
  // is visible and no step is running, read the program state and the new events. When the
  // engine's stage or counts differ from the page, the event log restarted (reset/upload),
  // or a routed/funded event arrived, reload the flow exactly as on mount. The page only
  // redraws when the reloaded flow differs, so this tab's own steps never cause a toast.
  const seqRef = React.useRef<number | null>(null)
  /** routed_at of the engine's latest routing; undefined until the first read. */
  const routedAtRef = React.useRef<string | null | undefined>(undefined)
  React.useEffect(() => {
    if (!state.ready || state.mode !== "live") {
      seqRef.current = null
      routedAtRef.current = undefined
      return
    }
    let stopped = false
    let running = false
    const check = async () => {
      if (stopped || running || document.visibilityState !== "visible") return
      const s0 = stateRef.current
      if (s0.busy || s0.mode !== "live") return
      running = true
      const gen = genRef.current
      try {
        const since = seqRef.current
        const [prog, ev, acts] = await Promise.all([
          http<ProgramResponse>("GET", `/programs/${PID}`, { timeoutMs: FLOW_READ_MS }),
          http<{ last_seq?: number; has_more?: boolean; events?: { kind?: string }[] }>(
            "GET",
            `/programs/${PID}/events?since=${since ?? 0}&limit=100`,
            { timeoutMs: FLOW_READ_MS }
          ).catch(() => null),
          http<{ routed_at?: string | null }>("GET", `/programs/${PID}/actions`, { timeoutMs: FLOW_READ_MS }).catch(() => null),
        ])
        if (stopped || gen !== genRef.current) return
        const lastSeq = typeof ev?.last_seq === "number" ? ev.last_seq : null
        // A reset + reseed can land last_seq on (or past) our watermark; a new routed_at gives it away.
        const routedAt = acts ? (acts.routed_at ?? null) : undefined
        const rerouted = routedAt !== undefined && routedAtRef.current !== undefined && routedAt !== routedAtRef.current
        if (routedAt !== undefined) routedAtRef.current = routedAt
        // The first answer after an offline load: always reload the flow from the engine.
        const reconnected = offlineLoadRef.current
        const engineReset = (since !== null && lastSeq !== null && lastSeq < since) || rerouted
        const flowEvent =
          since !== null && (!!ev?.has_more || (ev?.events ?? []).some((e) => FLOW_EVENT_KINDS.has(String(e?.kind))))
        const cur = stateRef.current
        const routedLike = prog.state === "routed" || prog.state === "funded"
        const countsDiffer =
          prog.state !== cur.stage ||
          (prog.counts?.jobs ?? cur.jobs.length) !== cur.jobs.length ||
          (routedLike &&
            ((prog.counts?.assigned ?? cur.assignments.length) !== cur.assignments.length ||
              (prog.counts?.blocked ?? cur.blocked.length) !== cur.blocked.length))
        if (!engineReset && !flowEvent && !countsDiffer && !reconnected) {
          if (lastSeq !== null) seqRef.current = lastSeq
          return
        }
        const flow = await loadLive()
        const now = stateRef.current
        // A step started meanwhile: leave the watermark so the next check looks again.
        if (stopped || gen !== genRef.current || now.busy || now.mode !== "live") return
        if (lastSeq !== null) seqRef.current = lastSeq
        if (reconnected) {
          offlineLoadRef.current = false
          patch((c2) => ({
            ...flow,
            error: null,
            loadFailed: false,
            offerStatus: {},
            fileName: flow.stage === "empty" ? null : c2.fileName,
          }))
          toast.success("Connected to the live engine", { id: "engine-offline", description: liveSummary(flow) })
          return
        }
        const changed = flowFingerprint(flow) !== flowFingerprint(now)
        if (!changed) {
          // Same flow, but the engine restarted its log: old offer answers no longer apply
          // (the actions store mirrors the engine's current answers back in).
          if (engineReset && Object.keys(now.offerStatus).length) patch({ offerStatus: {} })
          return
        }
        patch((c2) => ({
          ...flow,
          error: null,
          offerStatus: engineReset || flow.stage === "empty" ? {} : c2.offerStatus,
          fileName: flow.stage === "empty" ? null : c2.fileName,
        }))
        toast.info("Updated from the live engine", {
          id: "engine-sync",
          description: `Another screen changed the demo. ${liveSummary(flow)}`,
        })
      } catch {
        /* engine unreachable: the header pill shows "Engine offline"; try again next tick */
      } finally {
        running = false
      }
    }
    void check()
    const id = window.setInterval(() => void check(), ENGINE_WATCH_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") void check()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      stopped = true
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [state.ready, state.mode, patch])

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
      patch({ ...emptyFlow(program), offerStatus: {}, fileName: null, loadFailed: false, busy: null, error: null })
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
            res = await http<PartsUploadResponse>("POST", `/programs/${PID}/parts`, { body: fd, timeoutMs: 20000 })
          } else {
            res = await http<PartsUploadResponse>("POST", `/programs/${PID}/parts?use_demo=true`, { timeoutMs: 15000 })
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
          toast.success(`Parts list loaded: ${res.count} lines`, {
            description: `${fileName ?? "Northgate demo parts list"} · ${taggerSummary(res)}`,
          })
        } else {
          const up = fx<PartsUploadResponse>("POST", `/programs/${PID}/parts`)
          const count = up?.count
          patch({ busy: BUSY.upload(count), error: null })
          await latency()
          await latency()
          if (gen !== genRef.current) return
          const flow = fxUpload(flowOf(stateRef.current))
          patch({ ...flow, fileName, offerStatus: {}, busy: null })
          toast.success(`Parts list loaded: ${flow.jobs.length} lines`, {
            description: `${fileName ? `${fileName} (demo mode uses the Northgate list)` : "Northgate demo parts list"}${
              up ? ` · ${taggerSummary(up)}` : ""
            }`,
          })
        }
      } catch (e) {
        if (gen !== genRef.current) return
        if (await resyncIfStale(e, "Upload failed", gen)) return
        handleError(e, "Upload failed")
      }
    },
    [patch, handleError, resyncIfStale]
  )

  const route = React.useCallback(async () => {
    const s = stateRef.current
    const gen = genRef.current
    patch({ busy: BUSY.route, error: null })
    try {
      if (s.mode === "live") {
        const r = await http<RouteResponse>("POST", `/programs/${PID}/route`, { timeoutMs: 10000 })
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
      if (await resyncIfStale(e, "Routing failed", gen)) return
      handleError(e, "Routing failed")
    }
  }, [patch, handleError, resyncIfStale])

  const fund = React.useCallback(
    async (packageId: string): Promise<FundResponse | undefined> => {
      const s = stateRef.current
      const gen = genRef.current
      patch({ busy: BUSY.fund, error: null })
      try {
        if (s.mode === "live") {
          const res = await http<FundResponse>(
            "POST",
            `/programs/${PID}/training/${encodeURIComponent(packageId)}/fund`,
            { timeoutMs: 10000 }
          )
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
        if (await resyncIfStale(e, "Funding failed", gen)) return undefined
        handleError(e, "Funding failed")
        return undefined
      }
    },
    [patch, handleError, resyncIfStale]
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
    const list = fx<ShopsResponse>("GET", "/shops") ?? ({ shops: [] } as unknown as ShopsResponse)
    return withFundedUnlocks(list, flowOf(stateRef.current))
  }, [handleError])

  const getShop = React.useCallback(
    async (id: string): Promise<ShopDetailResponse> => {
      const s = stateRef.current
      if (s.mode === "live") {
        try {
          // Live offer status is the engine's; the phone/laptop overlay the engine's answers
          // (actions store) on top, never an earlier session's local ones.
          return await http<ShopDetailResponse>("GET", `/shops/${encodeURIComponent(id)}`)
        } catch (e) {
          handleError(e, "Could not load this shop")
        }
      } else {
        await latency()
      }
      const fxDetail = fxShopDetail(id, flowOf(stateRef.current))
      return s.mode === "fixtures" ? applyOfferStatus(fxDetail, stateRef.current.offerStatus) : fxDetail
    },
    [handleError]
  )

  // Re-offers made here, kept in localStorage so a reload keeps them (demo data has no other
  // record). A restarted flow (reset, new parts list) clears them; consumers also drop any
  // made before the latest routing (lib/search/reoffers.ts).
  const [reoffers, setReoffersState] = React.useState<Record<string, Reoffer>>({})
  const setReoffers = React.useCallback((next: Record<string, Reoffer> | ((cur: Record<string, Reoffer>) => Record<string, Reoffer>)) => {
    setReoffersState((cur) => {
      const value = typeof next === "function" ? next(cur) : next
      try {
        if (Object.keys(value).length) window.localStorage.setItem(REOFFER_KEY, JSON.stringify(value))
        else window.localStorage.removeItem(REOFFER_KEY)
      } catch {
        /* storage blocked: kept for this visit only */
      }
      return value
    })
  }, [])
  const [reoffersLoaded, setReoffersLoaded] = React.useState(false)
  if (state.ready && !reoffersLoaded) {
    // Once, after the provider restored the flow (never during SSR or hydration).
    setReoffersLoaded(true)
    setReoffersState(readReoffers())
  }
  const [reofferStage, setReofferStage] = React.useState<Stage>(state.stage)
  if (reofferStage !== state.stage) {
    setReofferStage(state.stage)
    if (reoffersLoaded && (state.stage === "empty" || state.stage === "uploaded") && Object.keys(reoffers).length) setReoffers({})
  }

  const reofferJob = React.useCallback(
    async (jobId: string, shopId: string, shopName?: string | null, fromShopId?: string | null): Promise<Reoffer | null> => {
      const s = stateRef.current
      const gen = genRef.current
      let rec: Reoffer = { job_id: jobId, shop_id: shopId, shop_name: shopName ?? null, from_shop_id: fromShopId ?? null, at: new Date().toISOString() }
      try {
        if (s.mode === "live") {
          const key =
            typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `reoffer-${Date.now()}-${Math.random()}`
          const res = await http<{ reoffer?: Partial<Reoffer> }>(
            "POST",
            `/programs/${PID}/jobs/${encodeURIComponent(jobId)}/reoffer`,
            { json: { shop_id: shopId, idempotency_key: key }, timeoutMs: 10000 }
          )
          const r = res.reoffer ?? {}
          rec = {
            job_id: r.job_id ?? jobId,
            shop_id: r.shop_id ?? shopId,
            shop_name: r.shop_name ?? rec.shop_name,
            from_shop_id: r.from_shop_id ?? rec.from_shop_id,
            at: r.at ?? rec.at,
          }
        } else {
          // Demo data: nothing to send. Recorded here so the declined job leaves the lists.
          await latency()
        }
        if (gen !== genRef.current) return null
        setReoffers((cur) => ({ ...cur, [jobId]: rec }))
        return rec
      } catch (e) {
        if (gen !== genRef.current) return null
        const msg = e instanceof Error ? e.message : "Request failed"
        toast.error(`Couldn't offer ${jobId}`, { description: msg })
        return null
      }
    },
    [setReoffers]
  )

  const setOfferStatus = React.useCallback(
    (shopId: string, jobId: string, status: OfferDecision) => {
      patch((cur) => ({ offerStatus: { ...cur.offerStatus, [`${shopId}:${jobId}`]: status } }))
    },
    [patch]
  )

  const replaceOfferStatus = React.useCallback(
    (next: Record<string, OfferDecision>) => {
      // Returns the same state when nothing changed, so a mirror effect never loops.
      setState((cur) => {
        const keys = Object.keys(cur.offerStatus)
        const same = keys.length === Object.keys(next).length && keys.every((k) => cur.offerStatus[k] === next[k])
        if (same) return cur
        const updated = { ...cur, offerStatus: { ...next } }
        stateRef.current = updated
        return updated
      })
    },
    []
  )

  const setMode = React.useCallback(
    (m: Mode) => {
      // Static GitHub Pages build: there is no engine, so Live is never offered or entered.
      if (STATIC_SITE && m === "live") return
      const gen = ++genRef.current
      offlineLoadRef.current = false
      modeOverrideRef.current = m
      // Keep an active ?mode= override in step with the switcher so a reload agrees.
      if (modeOverridden) sessionSet(SESSION_MODE_KEY, m)
      const cur = stateRef.current
      if (m === "fixtures") {
        // Keep the presenter's place: replay the same step (and funded packages) on fixtures.
        const flow = replayFixtures({
          modeOverride: "fixtures",
          stage: cur.stage,
          funded: cur.fundedIds,
          offerStatus: cur.offerStatus,
          fileName: cur.fileName,
          lastMode: "live",
        })
        patch({
          ...flow,
          mode: m,
          offerStatus: flow.stage === "empty" ? {} : cur.offerStatus,
          fileName: flow.stage === "empty" ? null : cur.fileName,
          loadFailed: false,
          error: null,
          busy: null,
        })
        toast.success("Demo mode", { description: "Using checked-in fixtures; your place in the demo is kept." })
        return
      }
      // Live: load what the shared engine has now. Never reset it here: phones and other
      // laptops read the same engine, and switching the data source must not wipe them.
      // The page keeps showing demo data (busy) until the engine answers.
      patch({ error: null, busy: BUSY.mode })
      void (async () => {
        try {
          const flow = await loadLive()
          if (gen !== genRef.current) return
          patch((now) => ({
            ...flow,
            mode: m,
            // Offer answers come from the engine (mirrored by the actions store), not demo data.
            offerStatus: {},
            fileName: flow.stage === "empty" ? null : now.fileName,
            loadFailed: false,
            error: null,
            busy: null,
          }))
          toast.success("Connected to the live engine", { description: liveSummary(flow) })
        } catch (e) {
          if (gen !== genRef.current) return
          // Stay on demo data (the flow on screen never changed).
          modeOverrideRef.current = "fixtures"
          if (modeOverridden) sessionSet(SESSION_MODE_KEY, "fixtures")
          handleError(e, "Could not reach the live engine", "Still on demo data.")
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
      replaceOfferStatus,
      setMode,
      reoffers,
      reofferJob,
    }),
    [state, demoShopId, reset, uploadParts, route, fund, getShops, getShop, setOfferStatus, replaceOfferStatus, setMode, reoffers, reofferJob]
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
