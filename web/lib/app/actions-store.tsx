"use client"

// Shop-side actions (decide an offer, ask for funding, confirm capacity,
// declare a certificate expiry) and the program's activity events, in both
// demo modes. Spec: docs/app-spec.md §2.1 "Actions-store behaviour".
//
// Live mode (engine with the §6 endpoints):
//   POST with an idempotency_key → merge the response. Network error → queue in
//   localStorage `muster.app.v1.outbox`, show it optimistically ("Will send"),
//   flush on `online`, on visibility, and at startup. 4xx → drop + toast.
//   Poll /programs/northgate/events every 3 s while visible and re-read
//   /programs/northgate/actions when new events arrive.
// Fixture mode (or a live engine without the §6 endpoints):
//   apply locally, append an AppEvent shaped like the engine's, persist to
//   localStorage `muster.app.v1`, and sync other tabs through the `storage`
//   event. The demo flow itself (reset/upload/route/fund) is mirrored from other
//   tabs through `muster.demo.v1`, so a phone window and a laptop window in the
//   same browser stay on the same step without an engine.
// Both: stage empty/uploaded clears decisions, requests and events (capacity
//   and certificate declarations belong to the shop and are kept). Accepted and
//   declined decisions are mirrored into useDemo().setOfferStatus().

import * as React from "react"
import { toast } from "sonner"
import { useDemo, type DemoContextValue, type OfferDecision } from "@/lib/data/store"
import { fx } from "@/lib/data/fixture-source"
import { CERT_LABEL, PROCESS_LABEL } from "@/lib/format"
import { CERT_TYPES, PROCESS_TAGS, type ShopListItem, type ShopsResponse } from "@/lib/api/types"
import { AppApiError, appFetch, appPaths, appApi, newIdempotencyKey } from "./api"
import { addDays, appToday, parseAppDate, toISODate } from "./today"
import { t } from "./strings"
import {
  APP_PROGRAM_ID,
  CAPACITY_MAX_HOURS,
  CERT_NUMBER_MAX,
  DECISION_NOTE_MAX,
  HORIZON_WEEKS,
  QUESTION_CODES,
  REASON_CODES,
  type AppEvent,
  type CapacityCheckin,
  type CapacityInput,
  type CapacityRequest,
  type CapacityResult,
  type CertDeclaration,
  type CertDeclareRequest,
  type CertDeclareResponse,
  type DecisionInput,
  type DecisionRequest,
  type DecisionResponse,
  type EventKind,
  type EventsResponse,
  type FundingRequestRec,
  type FundingRequestResponse,
  type HoursByProcess,
  type OfferDecisionRec,
  type ProgramActionsResponse,
  type ShopActions,
} from "./types"

// ---------------------------------------------------------------------------
// Public interface

export interface AppActions {
  ready: boolean
  /** key `${shopId}:${jobId}` */
  decisions: Record<string, OfferDecisionRec>
  /** key package_id */
  fundingRequests: Record<string, FundingRequestRec>
  /** key shop_id */
  capacity: Record<string, CapacityCheckin>
  /** shop_id → cert_type → declaration */
  declaredCerts: Record<string, Record<string, CertDeclaration>>
  /** newest last */
  events: AppEvent[]
  routedAt: string | null
  /** outbox size (actions saved on this device, not yet sent) */
  pending: number
  lastSyncAt: string | null
  decideOffer(shopId: string, jobId: string, input: DecisionInput): Promise<OfferDecisionRec | null>
  requestFunding(shopId: string, requirement: string): Promise<FundingRequestRec | null>
  confirmCapacity(shopId: string, input: CapacityInput): Promise<CapacityResult | null>
  declareCertExpiry(shopId: string, certType: string, expiresAt: string, certNumber?: string): Promise<CertDeclaration | null>
  // --- extras ---
  /** "engine": live with the §6 endpoints; "local": fixtures, or a live engine without them. */
  source: "engine" | "local"
  /** false when the browser is offline or the engine stopped answering. */
  online: boolean
  /** Re-read actions (and flush the outbox); also asks open pages to reload their data. */
  refresh(): Promise<void>
}

export const APP_STORAGE_KEY = "muster.app.v1"
export const APP_OUTBOX_KEY = "muster.app.v1.outbox"
const LIVE_CACHE_KEY = "muster.app.v1.live"
/** Written when a tab takes a demo step itself (not when it mirrors one). */
const STEP_KEY = "muster.app.v1.step"
/** Window event fired by refresh(); pages reload their data when they hear it. */
export const APP_REFRESH_EVENT = "muster:app-refresh"
const POLL_MS = 3000
const MAX_EVENTS = 300

export const decisionKey = (shopId: string, jobId: string) => `${shopId}:${jobId}`

/** Subscribe to Refresh taps (FreshnessStamp). Returns an unsubscribe function. */
export function onAppRefresh(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(APP_REFRESH_EVENT, fn)
  return () => window.removeEventListener(APP_REFRESH_EVENT, fn)
}

// ---------------------------------------------------------------------------
// Shop directory (fixture shops.json: same ids as the seeded engine)

let shopMap: Map<string, ShopListItem> | null = null
/** Name, label and profile of a seeded shop by id, or null. */
export function shopInfo(id: string): ShopListItem | null {
  if (!shopMap) {
    shopMap = new Map((fx<ShopsResponse>("GET", "/shops")?.shops ?? []).map((s) => [s.id, s]))
  }
  return shopMap.get(id) ?? null
}

// ---------------------------------------------------------------------------
// Data + storage (every access guarded)

interface AppData {
  decisions: Record<string, OfferDecisionRec>
  fundingRequests: Record<string, FundingRequestRec>
  capacity: Record<string, CapacityCheckin>
  declaredCerts: Record<string, Record<string, CertDeclaration>>
  events: AppEvent[]
  routedAt: string | null
}

const EMPTY: AppData = { decisions: {}, fundingRequests: {}, capacity: {}, declaredCerts: {}, events: [], routedAt: null }

function obj<T>(v: unknown): Record<string, T> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, T>) : {}
}

function sanitize(raw: unknown): AppData {
  const p = obj<unknown>(raw)
  return {
    decisions: obj<OfferDecisionRec>(p.decisions),
    fundingRequests: obj<FundingRequestRec>(p.fundingRequests),
    capacity: obj<CapacityCheckin>(p.capacity),
    declaredCerts: obj<Record<string, CertDeclaration>>(p.declaredCerts),
    events: Array.isArray(p.events) ? (p.events as AppEvent[]).filter((e) => e && typeof e.seq === "number") : [],
    routedAt: typeof p.routedAt === "string" ? p.routedAt : null,
  }
}

function readJSON(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJSON(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* storage unavailable: state lives for this tab only */
  }
}

const readLocal = (): AppData => sanitize(readJSON(APP_STORAGE_KEY))

let storageChecked: boolean | null = null
/** localStorage usable (false in some private modes and sandboxed previews). */
function storageOk(): boolean {
  if (storageChecked !== null) return storageChecked
  try {
    const k = "muster.app.v1.probe"
    window.localStorage.setItem(k, "1")
    window.localStorage.removeItem(k)
    storageChecked = true
  } catch {
    storageChecked = false
  }
  return storageChecked
}

const TAB_ID = typeof window === "undefined" ? "server" : Math.random().toString(36).slice(2, 10)
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** A demo step taken in one tab (fixture mode), so other tabs can mirror it. */
interface DemoStep {
  stage: string
  funded: string[]
  tab: string
  at: string
}

interface OutboxItem {
  /** = idempotency_key */
  key: string
  kind: "decision" | "funding" | "capacity" | "cert"
  shopId: string
  path: string
  body: DecisionRequest | { requirement: string; idempotency_key: string } | CapacityRequest | CertDeclareRequest
  jobId?: string
  packageId?: string
  certType?: string
  queuedAt: string
}

function readOutbox(): OutboxItem[] {
  const v = readJSON(APP_OUTBOX_KEY)
  return Array.isArray(v) ? (v as OutboxItem[]).filter((x) => x && typeof x.key === "string" && typeof x.path === "string") : []
}

const nowIso = () => new Date().toISOString()

// ---------------------------------------------------------------------------
// Record builders (shared by the local store and the optimistic overlay)

function decisionRec(shopId: string, jobId: string, body: DecisionRequest, at: string, pending = false): OfferDecisionRec {
  return {
    shop_id: shopId,
    job_id: jobId,
    decision: body.decision,
    reason_code: body.decision === "declined" ? body.reason_code : null,
    question_code: body.decision === "question" ? body.question_code : null,
    note: body.note,
    at,
    idempotency_key: body.idempotency_key,
    ...(pending ? { pending: true } : {}),
  }
}

function capacityRec(shopId: string, body: CapacityRequest, at: string, pending = false): CapacityCheckin {
  const byProcess = body.by_process && Object.keys(body.by_process).length ? body.by_process : null
  const hours = body.hours_week ?? Object.values(byProcess ?? {}).reduce((a, b) => a + (b ?? 0), 0)
  return {
    shop_id: shopId,
    hours_week: hours,
    by_process: byProcess,
    horizon_weeks: body.horizon_weeks,
    confirmed_at: at,
    used_in_routing: false,
    ...(pending ? { pending: true } : {}),
  }
}

function declarationRec(shopId: string, certType: string, body: CertDeclareRequest, at: string, pending = false): CertDeclaration {
  return {
    shop_id: shopId,
    type: certType as CertDeclaration["type"],
    expires_at: body.expires_at,
    cert_number: body.cert_number,
    status: "declared",
    declared_at: at,
    note: "Shop-declared; not used for routing until reviewed",
    ...(pending ? { pending: true } : {}),
  }
}

function withoutKey<T>(m: Record<string, T>, k: string): Record<string, T> {
  if (!(k in m)) return m
  const next = { ...m }
  delete next[k]
  return next
}

/** Apply queued/in-flight calls optimistically on top of engine data. */
function overlay(base: AppData, items: OutboxItem[]): AppData {
  if (!items.length) return base
  let d = base
  for (const it of items) {
    if (it.kind === "decision" && it.jobId) {
      const body = it.body as DecisionRequest
      const k = decisionKey(it.shopId, it.jobId)
      d =
        body.decision === "undo"
          ? { ...d, decisions: withoutKey(d.decisions, k) }
          : { ...d, decisions: { ...d.decisions, [k]: decisionRec(it.shopId, it.jobId, body, it.queuedAt, true) } }
    } else if (it.kind === "funding" && it.packageId) {
      if (d.fundingRequests[it.packageId] && !d.fundingRequests[it.packageId].pending) continue
      const req = (it.body as { requirement: string }).requirement
      d = {
        ...d,
        fundingRequests: {
          ...d.fundingRequests,
          [it.packageId]: { package_id: it.packageId, shop_id: it.shopId, requirement: req, status: "requested", at: it.queuedAt, pending: true },
        },
      }
    } else if (it.kind === "capacity") {
      d = { ...d, capacity: { ...d.capacity, [it.shopId]: capacityRec(it.shopId, it.body as CapacityRequest, it.queuedAt, true) } }
    } else if (it.kind === "cert" && it.certType) {
      const dec = declarationRec(it.shopId, it.certType, it.body as CertDeclareRequest, it.queuedAt, true)
      d = { ...d, declaredCerts: { ...d.declaredCerts, [it.shopId]: { ...(d.declaredCerts[it.shopId] ?? {}), [it.certType]: dec } } }
    }
  }
  return d
}

function fromProgramActions(r: ProgramActionsResponse, events: AppEvent[]): AppData {
  const decisions: AppData["decisions"] = {}
  for (const x of r.decisions ?? []) decisions[decisionKey(x.shop_id, x.job_id)] = x
  const fundingRequests: AppData["fundingRequests"] = {}
  for (const x of r.funding_requests ?? []) fundingRequests[x.package_id] = x
  const capacity: AppData["capacity"] = {}
  for (const x of Array.isArray(r.capacity) ? r.capacity : []) capacity[x.shop_id] = x
  const declaredCerts: AppData["declaredCerts"] = {}
  for (const x of r.declared_certs ?? []) declaredCerts[x.shop_id] = { ...(declaredCerts[x.shop_id] ?? {}), [x.type]: x }
  return { decisions, fundingRequests, capacity, declaredCerts, events, routedAt: r.routed_at ?? null }
}

/**
 * GET /events from `since`, following `has_more` (docs/api.md §6: "If has_more, call
 * again at once"). The engine keeps up to 2000 events; one call returns at most 500.
 */
async function fetchEvents(api: string, since: number): Promise<EventsResponse> {
  let res = await appApi.getEvents(api, since, 500)
  const events = [...res.events]
  for (let page = 0; res.has_more === true && res.events.length > 0 && page < 8; page++) {
    res = await appApi.getEvents(api, events[events.length - 1].seq, 500)
    events.push(...res.events)
  }
  return { ...res, events }
}

function appendEvents(list: AppEvent[], add: AppEvent[]): AppEvent[] {
  if (!add.length) return list
  const seen = new Set(list.map((e) => e.seq))
  const merged = [...list, ...add.filter((e) => !seen.has(e.seq))].sort((a, b) => a.seq - b.seq)
  return merged.length > MAX_EVENTS ? merged.slice(merged.length - MAX_EVENTS) : merged
}

// ---------------------------------------------------------------------------
// Validation (client side, both modes; the engine re-checks in live mode)

function validateDecision(input: DecisionInput): string | null {
  if (input.decision === "declined" && !(input.reason_code && REASON_CODES.includes(input.reason_code))) return t("error.reasonRequired")
  if (input.decision === "question" && !(input.question_code && QUESTION_CODES.includes(input.question_code)))
    return t("error.questionRequired")
  if (input.note && input.note.length > DECISION_NOTE_MAX) return t("error.noteTooLong")
  return null
}

function capacityBody(input: CapacityInput, key: string): CapacityRequest | string {
  if (!HORIZON_WEEKS.includes(input.horizon_weeks)) return t("error.horizon")
  const byProcess: HoursByProcess = {}
  for (const [k, v] of Object.entries(input.by_process ?? {})) {
    if (!(PROCESS_TAGS as readonly string[]).includes(k)) return `Unknown process '${k}'`
    if (typeof v !== "number" || v < 0 || v > CAPACITY_MAX_HOURS) return t("error.hoursRange")
    byProcess[k as keyof HoursByProcess] = v
  }
  const hasByProcess = Object.keys(byProcess).length > 0
  const hours = input.hours_week ?? (hasByProcess ? Object.values(byProcess).reduce((a, b) => a + (b ?? 0), 0) : null)
  if (hours === null || typeof hours !== "number" || Number.isNaN(hours) || hours < 0 || hours > CAPACITY_MAX_HOURS) return t("error.hoursRange")
  return { hours_week: hours, by_process: hasByProcess ? byProcess : null, horizon_weeks: input.horizon_weeks, idempotency_key: key }
}

function validateCert(certType: string, expiresAt: string, certNumber?: string): string | null {
  if (!(CERT_TYPES as readonly string[]).includes(certType)) return t("error.unknownCert", { cert: certType })
  const d = /^\d{4}-\d{2}-\d{2}$/.test(expiresAt) ? parseAppDate(expiresAt) : null
  if (!d || toISODate(d) !== expiresAt) return t("error.badDate")
  const limit = addDays(appToday(), 3653)
  if (d > limit) return t("error.badDate")
  if (certNumber && certNumber.length > CERT_NUMBER_MAX) return t("error.certNumber")
  return null
}

function fail(msg: string): null {
  toast.error(t("error.actionFailed"), { description: msg })
  return null
}

// ---------------------------------------------------------------------------
// Local (fixture-mode) event builders, same shape as the engine's

type Demo = DemoContextValue

function shopName(demo: Demo, shopId: string): string {
  return demo.assignments.find((a) => a.shop_id === shopId)?.shop_name ?? shopInfo(shopId)?.name ?? shopId
}

function reqLabel(req: string): string {
  return CERT_LABEL[req] ?? PROCESS_LABEL[req] ?? req
}

function makeEvent(list: AppEvent[], e: Omit<AppEvent, "seq" | "ts"> & { ts?: string }): AppEvent {
  const seq = list.reduce((m, x) => Math.max(m, x.seq), 0) + 1
  return { ts: e.ts ?? nowIso(), ...e, seq }
}

function routedEvent(demo: Demo, list: AppEvent[], ts: string): AppEvent {
  const prime = demo.program?.prime_name ?? "Northgate Land Systems"
  return makeEvent(list, {
    ts,
    kind: "routed",
    shop_id: null,
    shop_name: null,
    job_id: null,
    package_id: null,
    value_cad: demo.routeStats?.assigned_value_cad ?? null,
    credit_cad: demo.ledger?.credit_total_cad ?? null,
    message: t("event.routed", { prime, count: demo.routeStats?.assigned ?? demo.assignments.length }),
    payload: { assigned: demo.routeStats?.assigned ?? demo.assignments.length, blocked: demo.routeStats?.blocked ?? demo.blocked.length },
  })
}

function fundedEvent(demo: Demo, list: AppEvent[], packageId: string): AppEvent {
  const res = demo.fundResults[packageId]
  const pkg = res?.package ?? demo.gaps?.suggestions.find((s) => s.id === packageId)
  const unblocked = res?.unblocked_jobs ?? []
  return makeEvent(list, {
    kind: "package_funded",
    shop_id: pkg?.shop_id ?? null,
    shop_name: pkg?.shop_name ?? null,
    job_id: null,
    package_id: packageId,
    value_cad: unblocked.reduce((a, x) => a + x.value_cad, 0) || (pkg?.unblocks_value_cad ?? null),
    credit_cad: res?.credit_added ?? pkg?.est_credit_cad ?? null,
    message: res?.headline || t("event.package_funded", { package: packageId, count: unblocked.length || (pkg?.blocked_job_ids.length ?? 0) }),
    payload: { unblocked_job_ids: unblocked.map((a) => a.job_id) },
  })
}

// ---------------------------------------------------------------------------
// Provider

const Ctx = React.createContext<AppActions | null>(null)

export function AppActionsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const demo = useDemo()
  const demoRef = React.useRef(demo)
  React.useEffect(() => {
    demoRef.current = demo
  }, [demo])

  /** Engine data (live) or the persisted local data (fixtures). */
  const [base, setBase] = React.useState<AppData>(EMPTY)
  const baseRef = React.useRef<AppData>(EMPTY)
  const [outbox, setOutbox] = React.useState<OutboxItem[]>([])
  const outboxRef = React.useRef<OutboxItem[]>([])
  const [inflight, setInflight] = React.useState<OutboxItem[]>([])
  const [loaded, setLoaded] = React.useState(false)
  /** null until probed; false when the live engine has no §6 endpoints. */
  const [supported, setSupported] = React.useState<boolean | null>(null)
  const [online, setOnline] = React.useState(true)
  const [lastSyncAt, setLastSyncAt] = React.useState<string | null>(null)
  const lastSeqRef = React.useRef(0)
  const flushingRef = React.useRef(false)
  const syncingRef = React.useRef(false)
  /** flushOutbox, for syncLive (the two callbacks refer to each other). */
  const flushRef = React.useRef<(() => Promise<void>) | null>(null)

  const live = demo.ready && demo.mode === "live"
  const local = demo.ready && (demo.mode === "fixtures" || supported === false)
  const useEngine = live && supported === true
  const useEngineRef = React.useRef(useEngine)
  React.useEffect(() => {
    useEngineRef.current = useEngine
  }, [useEngine])

  const putBase = React.useCallback((d: AppData) => {
    baseRef.current = d
    setBase(d)
  }, [])

  const putOutbox = React.useCallback((items: OutboxItem[]) => {
    outboxRef.current = items
    setOutbox(items)
    writeJSON(APP_OUTBOX_KEY, items)
  }, [])

  /** Read-modify-write of the local store; writes only when fn changed something. */
  const mutateLocal = React.useCallback(
    (fn: (d: AppData) => AppData): AppData => {
      const fresh = storageOk() ? readLocal() : baseRef.current
      const next = fn(fresh)
      if (next !== fresh) writeJSON(APP_STORAGE_KEY, next)
      putBase(next)
      setLastSyncAt(nowIso())
      return next
    },
    [putBase]
  )

  // ---- load on mode change --------------------------------------------------

  React.useEffect(() => {
    if (!demo.ready) return
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      putOutbox(readOutbox())
      if (demo.mode === "fixtures") {
        setSupported(null)
        putBase(readLocal())
        setLastSyncAt(nowIso())
        setLoaded(true)
        return
      }
      // Live: probe the events endpoint; fall back to local actions if it is missing.
      try {
        const [ev, acts] = await Promise.all([fetchEvents(demo.apiUrl, 0), appApi.getProgramActions(demo.apiUrl)])
        if (cancelled) return
        lastSeqRef.current = ev.last_seq
        putBase(fromProgramActions(acts, appendEvents([], ev.events)))
        writeJSON(LIVE_CACHE_KEY, { data: fromProgramActions(acts, appendEvents([], ev.events)), at: nowIso() })
        setSupported(true)
        setOnline(true)
        setLastSyncAt(nowIso())
      } catch (e) {
        if (cancelled) return
        if (e instanceof AppApiError && e.routeMissing) {
          setSupported(false)
          putBase(readLocal())
          setLastSyncAt(nowIso())
        } else {
          // Engine unreachable right now: show the last engine snapshot, keep trying.
          const cached = obj<unknown>(readJSON(LIVE_CACHE_KEY))
          putBase(sanitize(cached.data))
          setLastSyncAt(typeof cached.at === "string" ? cached.at : null)
          setOnline(false)
          setSupported(true)
        }
      }
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [demo.ready, demo.mode, demo.apiUrl, putBase, putOutbox])

  // ---- live sync ----------------------------------------------------------------

  const syncLive = React.useCallback(
    async (full = false) => {
      if (!useEngineRef.current || syncingRef.current) return
      syncingRef.current = true
      const api = demoRef.current.apiUrl
      let reached = false
      try {
        const since = full ? 0 : lastSeqRef.current
        let ev = await fetchEvents(api, since)
        // last_seq < since: the engine was reset (docs/api.md §6). Drop local events and
        // re-read from since=0, or events written after the reset are lost for good.
        const engineReset = !full && ev.last_seq < lastSeqRef.current
        if (engineReset) ev = await fetchEvents(api, 0)
        // Read the program's actions on every poll (the engine memoizes the view per
        // revision): a reset + re-route between two polls can bring last_seq back to, or
        // past, ours, so an empty or ordinary-looking page of events can hide a replaced
        // log (C3-6). A new routed_at gives it away; then re-read the whole event list.
        const acts = await appApi.getProgramActions(api)
        const rerouted = !full && !engineReset && (acts.routed_at ?? null) !== baseRef.current.routedAt
        if (rerouted) ev = await fetchEvents(api, 0)
        const changed = full || engineReset || rerouted || ev.events.length > 0
        if (changed) {
          const events = full || engineReset || rerouted ? appendEvents([], ev.events) : appendEvents(baseRef.current.events, ev.events)
          const data = fromProgramActions(acts, events)
          putBase(data)
          writeJSON(LIVE_CACHE_KEY, { data, at: nowIso() })
        }
        lastSeqRef.current = ev.last_seq
        setOnline(true)
        setLastSyncAt(nowIso())
        reached = true
      } catch (e) {
        if (e instanceof AppApiError && e.network) setOnline(false)
      } finally {
        syncingRef.current = false
      }
      // The engine answered: send anything queued while it was down. The browser "online" event
      // never fires when only the engine (not the phone's network) was unreachable (Q11).
      if (reached && !flushingRef.current && (outboxRef.current.length > 0 || readOutbox().length > 0)) {
        void flushRef.current?.()
      }
    },
    [putBase]
  )

  const mergeResponseEvent = React.useCallback(
    (event: AppEvent | null | undefined) => {
      if (!event || typeof event.seq !== "number") return
      putBase({ ...baseRef.current, events: appendEvents(baseRef.current.events, [event]) })
    },
    [putBase]
  )

  /** Merge a successful POST response into engine data. */
  const mergeResponse = React.useCallback(
    (it: OutboxItem, res: unknown) => {
      const d = baseRef.current
      if (it.kind === "decision" && it.jobId) {
        const r = res as DecisionResponse
        const k = decisionKey(it.shopId, it.jobId)
        const decisions = r.decision?.decision === "undo" || !r.decision ? withoutKey(d.decisions, k) : { ...d.decisions, [k]: r.decision }
        putBase({ ...d, decisions })
        mergeResponseEvent(r.event)
      } else if (it.kind === "funding") {
        const r = res as FundingRequestResponse
        if (r.request) putBase({ ...d, fundingRequests: { ...d.fundingRequests, [r.request.package_id]: r.request } })
        mergeResponseEvent(r.event)
      } else if (it.kind === "capacity") {
        const r = res as CapacityResult
        if (r.capacity) putBase({ ...d, capacity: { ...d.capacity, [it.shopId]: r.capacity } })
        mergeResponseEvent(r.event)
      } else if (it.kind === "cert") {
        const r = res as CertDeclareResponse
        if (r.declaration)
          putBase({
            ...d,
            declaredCerts: { ...d.declaredCerts, [it.shopId]: { ...(d.declaredCerts[it.shopId] ?? {}), [r.declaration.type]: r.declaration } },
          })
        mergeResponseEvent(r.event)
      }
    },
    [putBase, mergeResponseEvent]
  )

  const flushOutbox = React.useCallback(async () => {
    if (!useEngineRef.current || flushingRef.current) return
    const queue = readOutbox()
    if (!queue.length) {
      if (outboxRef.current.length) putOutbox([])
      return
    }
    flushingRef.current = true
    let rest = [...queue]
    try {
      for (const it of queue) {
        try {
          const res = await appFetch<unknown>(demoRef.current.apiUrl, it.path, { json: it.body })
          mergeResponse(it, res)
          rest = rest.filter((x) => x.key !== it.key)
        } catch (e) {
          if (e instanceof AppApiError && (e.network || e.status >= 500)) {
            setOnline(false)
            break
          }
          rest = rest.filter((x) => x.key !== it.key)
          toast.error(t("error.actionFailed"), { description: e instanceof AppApiError ? e.detail : String(e) })
        }
      }
    } finally {
      putOutbox(rest)
      flushingRef.current = false
    }
    if (rest.length < queue.length) void syncLive(false)
  }, [mergeResponse, putOutbox, syncLive])
  React.useEffect(() => {
    flushRef.current = flushOutbox
  }, [flushOutbox])

  // Poll while visible; flush on startup, online and visibility.
  React.useEffect(() => {
    if (!useEngine) return
    void flushOutbox()
    const tick = () => {
      if (document.visibilityState === "visible") void syncLive(false)
    }
    const id = window.setInterval(tick, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void flushOutbox()
        void syncLive(false)
      }
    }
    const onOnline = () => {
      setOnline(true)
      void flushOutbox()
      void syncLive(false)
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("online", onOnline)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("online", onOnline)
    }
  }, [useEngine, flushOutbox, syncLive])

  // Browser online/offline (both modes).
  React.useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    if (typeof navigator !== "undefined" && navigator.onLine === false) queueMicrotask(off)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
    }
  }, [])

  // ---- cross-tab sync (storage events) -----------------------------------------

  const bridgingRef = React.useRef(false)
  const bridgeDemo = React.useCallback(async (): Promise<void> => {
    // Mirror another tab's demo step (reset/upload/route/fund) in fixture mode.
    if (bridgingRef.current) return
    bridgingRef.current = true
    const cur = () => demoRef.current
    const waitFor = async (pred: () => boolean) => {
      for (let i = 0; i < 80 && !pred(); i++) await sleep(50)
    }
    try {
      let doneAt: string | null = null
      // Loop so a step taken while we were mirroring the previous one is not missed.
      for (let round = 0; round < 6; round++) {
        // Let this tab finish its own running step first.
        for (let i = 0; i < 40 && cur().busy; i++) await sleep(150)
        const d0 = cur()
        if (!d0.ready || d0.mode !== "fixtures" || d0.busy) return
        const step = obj<unknown>(readJSON(STEP_KEY)) as Partial<DemoStep>
        if (typeof step.stage !== "string" || step.tab === TAB_ID || step.at === doneAt) return
        doneAt = step.at ?? null
        const stage = step.stage
        const funded = Array.isArray(step.funded) ? step.funded.filter((x): x is string => typeof x === "string") : []
        if (stage === "empty") {
          if (cur().stage !== "empty") {
            await cur().reset()
            await waitFor(() => cur().stage === "empty" && !cur().busy)
          }
          continue
        }
        if (stage === "uploaded") {
          if (cur().stage !== "uploaded") {
            await cur().uploadParts()
            await waitFor(() => cur().stage === "uploaded" && !cur().busy)
          }
          continue
        }
        // routed / funded
        const reRouted = stage === "routed" && cur().stage === "funded" && funded.length === 0
        if (cur().stage === "empty") {
          await cur().uploadParts()
          await waitFor(() => cur().stage === "uploaded" && !cur().busy)
        }
        if (cur().stage === "uploaded" || reRouted) {
          await cur().route()
          await waitFor(() => cur().stage === "routed" && !cur().busy)
        }
        for (const id of funded) {
          if (cur().fundedIds.includes(id)) continue
          await cur().fund(id)
          await waitFor(() => cur().fundedIds.includes(id) && !cur().busy)
        }
      }
    } finally {
      bridgingRef.current = false
    }
  }, [])

  // Publish this tab's own demo steps (fixture mode) for other tabs to mirror.
  const stepInitRef = React.useRef(false)
  React.useEffect(() => {
    if (!demo.ready || demo.mode !== "fixtures" || demo.busy) return
    if (!stepInitRef.current) {
      // First settled state after load is restored, not a new step.
      stepInitRef.current = true
      return
    }
    if (bridgingRef.current) return
    const prev = obj<unknown>(readJSON(STEP_KEY)) as Partial<DemoStep>
    const same =
      prev.stage === demo.stage &&
      Array.isArray(prev.funded) &&
      prev.funded.length === demo.fundedIds.length &&
      prev.funded.every((x, i) => x === demo.fundedIds[i])
    if (same) return
    writeJSON(STEP_KEY, { stage: demo.stage, funded: demo.fundedIds, tab: TAB_ID, at: nowIso() } satisfies DemoStep)
  }, [demo.ready, demo.mode, demo.busy, demo.stage, demo.fundedIds])

  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea && typeof window !== "undefined" && e.storageArea !== window.localStorage) return
      if (e.key === APP_STORAGE_KEY || e.key === null) {
        if (!useEngineRef.current) {
          putBase(readLocal())
          setLastSyncAt(nowIso())
        }
      }
      if (e.key === APP_OUTBOX_KEY) {
        const items = readOutbox()
        outboxRef.current = items
        setOutbox(items)
      }
      if (e.key === STEP_KEY) void bridgeDemo()
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [putBase, bridgeDemo])

  // ---- program lifecycle ------------------------------------------------------

  const prevStageRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!demo.ready || !loaded) return
    const prev = prevStageRef.current
    prevStageRef.current = demo.stage
    if (useEngine) {
      // The engine clears and emits on its own; just re-read after a step.
      if (prev !== null && prev !== demo.stage) void syncLive(true)
      return
    }
    if (!local) return
    // A step mirrored from another tab: that tab already wrote the events.
    if (bridgingRef.current) return
    const d = demoRef.current
    const firstRun = prev === null
    const enteredRouted = prev === "empty" || prev === "uploaded"
    mutateLocal((cur) => {
      let n = cur
      if (d.stage === "empty" || d.stage === "uploaded") {
        if (n.events.length || n.routedAt || Object.keys(n.decisions).length || Object.keys(n.fundingRequests).length) {
          n = { ...n, decisions: {}, fundingRequests: {}, events: [], routedAt: null }
        }
        return n
      }
      const hasRouted = n.events.some((e) => e.kind === "routed")
      if (enteredRouted && !hasRouted) {
        // This tab just routed: a new routing cycle starts clean.
        const ts = nowIso()
        n = { ...n, decisions: {}, fundingRequests: {}, routedAt: ts, events: [routedEvent(d, [], ts)] }
      } else if (firstRun && !hasRouted && !n.events.length) {
        // Restored a routed session that predates this store: record when we saw it.
        const ts = nowIso()
        n = { ...n, routedAt: n.routedAt ?? ts, events: [routedEvent(d, [], ts)] }
      }
      for (const id of d.fundedIds) {
        if (!n.events.some((e) => e.kind === "package_funded" && e.package_id === id)) {
          n = { ...n, events: appendEvents(n.events, [fundedEvent(d, n.events, id)]) }
        }
      }
      return n
    })
  }, [demo.ready, demo.stage, demo.fundedIds, loaded, local, useEngine, mutateLocal, syncLive])

  // ---- visible data -------------------------------------------------------------

  const data = React.useMemo(() => {
    const d = overlay(base, [...outbox, ...inflight])
    // Funding requests read "funded" once the package is funded.
    const funded = new Set(demo.fundedIds)
    for (const s of demo.gaps?.suggestions ?? []) if (s.status === "funded") funded.add(s.id)
    let fr = d.fundingRequests
    for (const [pid, r] of Object.entries(fr)) {
      if (funded.has(pid) && r.status !== "funded") fr = { ...fr, [pid]: { ...r, status: "funded" } }
    }
    return fr === d.fundingRequests ? d : { ...d, fundingRequests: fr }
  }, [base, outbox, inflight, demo.fundedIds, demo.gaps])

  // Mirror accepted/declined into the desktop offer inbox (useDemo().offerStatus), and take an
  // answer back out when it is undone or turns into a question. Live with the engine's §6 routes:
  // offerStatus equals the engine's decision map (accepted/declined only). Otherwise (fixtures, or an
  // engine without them) only keys this mirror wrote are removed, so an answer given on the laptop
  // profile (setOfferStatus) is kept.
  const mirroredRef = React.useRef<Set<string>>(new Set())
  const mirrorStartedRef = React.useRef(false)
  React.useEffect(() => {
    if (!demo.ready || !loaded || (demo.stage !== "routed" && demo.stage !== "funded")) return
    const want: Record<string, OfferDecision> = {}
    for (const r of Object.values(data.decisions)) {
      if (r.decision === "accepted" || r.decision === "declined") want[decisionKey(r.shop_id, r.job_id)] = r.decision
    }
    const cur = demo.offerStatus
    let next: Record<string, OfferDecision>
    if (useEngine) {
      next = want
    } else {
      next = { ...cur }
      for (const k of mirroredRef.current) if (!(k in want)) delete next[k]
      // First run after a reload (mirroredRef starts empty): drop answers whose latest event is an
      // undo or a question. Only once, so a later answer given on the laptop profile is never undone.
      if (!mirrorStartedRef.current) {
        const last: Record<string, string> = {}
        for (const e of data.events) {
          if (e.shop_id && e.job_id && e.kind.startsWith("offer_") && e.kind !== "offer_reply") last[decisionKey(e.shop_id, e.job_id)] = e.kind
        }
        for (const [k, kind] of Object.entries(last)) if (!(k in want) && (kind === "offer_undo" || kind === "offer_question")) delete next[k]
      }
      Object.assign(next, want)
    }
    mirroredRef.current = new Set(Object.keys(want))
    mirrorStartedRef.current = true
    const same = Object.keys(next).length === Object.keys(cur).length && Object.entries(next).every(([k, v]) => cur[k] === v)
    if (same) return
    demo.replaceOfferStatus(next)
  }, [data.decisions, data.events, demo, loaded, useEngine])

  // ---- actions ---------------------------------------------------------------------

  /** Live path: in-flight overlay → POST → merge; network → outbox; 4xx → toast. */
  const sendLive = React.useCallback(
    async <R,>(it: OutboxItem): Promise<{ ok: true; res: R } | { ok: false; queued: boolean }> => {
      setInflight((xs) => [...xs, it])
      try {
        const res = await appFetch<R>(demoRef.current.apiUrl, it.path, { json: it.body })
        mergeResponse(it, res)
        setOnline(true)
        return { ok: true, res }
      } catch (e) {
        if (e instanceof AppApiError && (e.network || e.status >= 500)) {
          putOutbox([...readOutbox(), it])
          setOnline(false)
          toast.message(t("offline.queuedToast"), { description: t("offline.queuedToastBody") })
          return { ok: false, queued: true }
        }
        toast.error(t("error.actionFailed"), { description: e instanceof AppApiError ? e.detail : String(e) })
        return { ok: false, queued: false }
      } finally {
        setInflight((xs) => xs.filter((x) => x.key !== it.key))
      }
    },
    [mergeResponse, putOutbox]
  )

  const decideOffer = React.useCallback(
    async (shopId: string, jobId: string, input: DecisionInput): Promise<OfferDecisionRec | null> => {
      const bad = validateDecision(input)
      if (bad) return fail(bad)
      const body: DecisionRequest = {
        decision: input.decision,
        reason_code: input.decision === "declined" ? (input.reason_code ?? null) : null,
        question_code: input.decision === "question" ? (input.question_code ?? null) : null,
        note: input.note?.trim() ? input.note.trim() : null,
        idempotency_key: newIdempotencyKey(),
      }
      const it: OutboxItem = { key: body.idempotency_key, kind: "decision", shopId, jobId, path: appPaths.decision(shopId, jobId), body, queuedAt: nowIso() }
      if (useEngineRef.current) {
        const r = await sendLive<DecisionResponse>(it)
        if (r.ok) return r.res.decision ?? decisionRec(shopId, jobId, body, nowIso())
        return r.queued ? decisionRec(shopId, jobId, body, it.queuedAt, true) : null
      }
      // Local
      const d = demoRef.current
      if (d.stage !== "routed" && d.stage !== "funded") return fail(t("error.notRouted"))
      const a = d.assignments.find((x) => x.job_id === jobId && x.shop_id === shopId)
      if (!a) return fail(shopInfo(shopId) ? t("error.notOffered", { job: jobId, shop: shopId }) : t("error.unknownShop", { shop: shopId }))
      const at = nowIso()
      const rec = decisionRec(shopId, jobId, body, at)
      const k = decisionKey(shopId, jobId)
      const name = a.shop_name
      const kind: EventKind =
        body.decision === "accepted" ? "offer_accepted" : body.decision === "declined" ? "offer_declined" : body.decision === "question" ? "offer_question" : "offer_undo"
      const message =
        kind === "offer_accepted"
          ? t("event.offer_accepted", { shop: name, job: jobId })
          : kind === "offer_declined"
            ? t("event.offer_declined", { shop: name, job: jobId, reason: t(`reason.${body.reason_code}`).toLowerCase() })
            : kind === "offer_question"
              ? t("event.offer_question", { shop: name, job: jobId, question: t(`question.${body.question_code}`).toLowerCase() })
              : t("event.offer_undo", { shop: name, job: jobId })
      // Same decision again (a new key): nothing new for the prime, like the engine's
      // `event: null` (shopside.decide). Return the stored decision, append no event.
      const same: { rec: OfferDecisionRec | null } = { rec: null }
      mutateLocal((cur) => {
        const prev = cur.decisions[k]
        if (
          body.decision !== "undo" &&
          prev &&
          !prev.pending &&
          prev.decision === rec.decision &&
          (prev.reason_code ?? null) === rec.reason_code &&
          (prev.question_code ?? null) === rec.question_code &&
          (prev.note ?? null) === (rec.note ?? null)
        ) {
          same.rec = prev
          return cur
        }
        return {
          ...cur,
          decisions: body.decision === "undo" ? withoutKey(cur.decisions, k) : { ...cur.decisions, [k]: rec },
          events: appendEvents(cur.events, [
            makeEvent(cur.events, {
              ts: at,
              kind,
              shop_id: shopId,
              shop_name: name,
              job_id: jobId,
              package_id: null,
              value_cad: a.value_cad,
              credit_cad: a.credit_cad,
              message,
              payload: { reason_code: body.reason_code, question_code: body.question_code, note: body.note },
            }),
          ]),
        }
      })
      return same.rec ?? rec
    },
    [mutateLocal, sendLive]
  )

  const requestFunding = React.useCallback(
    async (shopId: string, requirement: string): Promise<FundingRequestRec | null> => {
      const d = demoRef.current
      const pkg = d.gaps?.suggestions.find((s) => s.shop_id === shopId && s.gap?.requirement === requirement)
      const key = newIdempotencyKey()
      if (useEngineRef.current) {
        const it: OutboxItem = {
          key,
          kind: "funding",
          shopId,
          packageId: pkg?.id ?? `pending:${shopId}:${requirement}`,
          path: appPaths.fundingRequests(shopId),
          body: { requirement, idempotency_key: key },
          queuedAt: nowIso(),
        }
        const r = await sendLive<FundingRequestResponse>(it)
        if (r.ok) return r.res.request
        return r.queued ? { package_id: it.packageId!, shop_id: shopId, requirement, status: "requested", at: it.queuedAt, pending: true } : null
      }
      if (d.stage !== "routed" && d.stage !== "funded") return fail(t("error.notRouted"))
      if (!pkg) return fail(t("error.noPackage", { requirement, shop: shopId }))
      if (pkg.status === "funded" || d.fundedIds.includes(pkg.id)) return fail(t("error.alreadyFunded", { package: pkg.id }))
      const existing = readLocal().fundingRequests[pkg.id] ?? baseRef.current.fundingRequests[pkg.id]
      if (existing) return existing
      const at = nowIso()
      const rec: FundingRequestRec = { package_id: pkg.id, shop_id: shopId, requirement, status: "requested", at }
      const prime = d.program?.prime_name ?? "Northgate"
      mutateLocal((cur) => ({
        ...cur,
        fundingRequests: { ...cur.fundingRequests, [pkg.id]: rec },
        events: appendEvents(cur.events, [
          makeEvent(cur.events, {
            ts: at,
            kind: "funding_requested",
            shop_id: shopId,
            shop_name: pkg.shop_name || shopName(d, shopId),
            job_id: null,
            package_id: pkg.id,
            value_cad: pkg.unblocks_value_cad,
            credit_cad: pkg.est_credit_cad,
            message: t("event.funding_requested", { shop: pkg.shop_name || shopName(d, shopId), prime, requirement: reqLabel(requirement) }),
            payload: { requirement, est_cost_cad: pkg.est_cost_cad },
          }),
        ]),
      }))
      return rec
    },
    [mutateLocal, sendLive]
  )

  const confirmCapacity = React.useCallback(
    async (shopId: string, input: CapacityInput): Promise<CapacityResult | null> => {
      const key = newIdempotencyKey()
      const body = capacityBody(input, key)
      if (typeof body === "string") return fail(body)
      const d = demoRef.current
      const mine = d.assignments.filter((a) => a.shop_id === shopId)
      const decs = data.decisions
      const acceptedLoad = mine
        .filter((a) => (decs[decisionKey(shopId, a.job_id)]?.decision ?? a.status) === "accepted")
        .reduce((s, a) => s + a.hours_week, 0)
      const offeredLoad = mine.reduce((s, a) => s + a.hours_week, 0)
      const at = nowIso()
      const rec = capacityRec(shopId, body, at)
      const result = (event: AppEvent | null, pending = false): CapacityResult => ({
        capacity: pending ? { ...rec, pending: true } : rec,
        accepted_load_hours: acceptedLoad,
        offered_load_hours: offeredLoad,
        over_by_hours: Math.max(0, acceptedLoad - rec.hours_week),
        event,
      })
      if (useEngineRef.current) {
        const it: OutboxItem = { key, kind: "capacity", shopId, path: appPaths.capacity(shopId), body, queuedAt: at }
        const r = await sendLive<CapacityResult>(it)
        if (r.ok) return r.res
        return r.queued ? result(null, true) : null
      }
      if (!shopInfo(shopId) && !mine.length) return fail(t("error.unknownShop", { shop: shopId }))
      const name = shopName(d, shopId)
      let ev: AppEvent | null = null
      mutateLocal((cur) => {
        ev = makeEvent(cur.events, {
          ts: at,
          kind: "capacity_confirmed",
          shop_id: shopId,
          shop_name: name,
          job_id: null,
          package_id: null,
          value_cad: null,
          credit_cad: null,
          message: t("event.capacity_confirmed", { shop: name, hours: rec.hours_week, weeks: rec.horizon_weeks }),
          payload: {
            hours_week: rec.hours_week,
            by_process: rec.by_process,
            horizon_weeks: rec.horizon_weeks,
            accepted_load_hours: acceptedLoad,
            offered_load_hours: offeredLoad,
            over_by_hours: Math.max(0, acceptedLoad - rec.hours_week),
          },
        })
        return { ...cur, capacity: { ...cur.capacity, [shopId]: rec }, events: appendEvents(cur.events, [ev]) }
      })
      return result(ev)
    },
    [data.decisions, mutateLocal, sendLive]
  )

  const declareCertExpiry = React.useCallback(
    async (shopId: string, certType: string, expiresAt: string, certNumber?: string): Promise<CertDeclaration | null> => {
      const bad = validateCert(certType, expiresAt, certNumber)
      if (bad) return fail(bad)
      const key = newIdempotencyKey()
      const body: CertDeclareRequest = { expires_at: expiresAt, cert_number: certNumber?.trim() ? certNumber.trim() : null, idempotency_key: key }
      const at = nowIso()
      if (useEngineRef.current) {
        const it: OutboxItem = { key, kind: "cert", shopId, certType, path: appPaths.certDeclare(shopId, certType), body, queuedAt: at }
        const r = await sendLive<CertDeclareResponse>(it)
        if (r.ok) return r.res.declaration
        return r.queued ? declarationRec(shopId, certType, body, at, true) : null
      }
      const d = demoRef.current
      if (!shopInfo(shopId) && !d.assignments.some((a) => a.shop_id === shopId)) return fail(t("error.unknownShop", { shop: shopId }))
      const rec = declarationRec(shopId, certType, body, at)
      const name = shopName(d, shopId)
      mutateLocal((cur) => ({
        ...cur,
        declaredCerts: { ...cur.declaredCerts, [shopId]: { ...(cur.declaredCerts[shopId] ?? {}), [certType]: rec } },
        events: appendEvents(cur.events, [
          makeEvent(cur.events, {
            ts: at,
            kind: "cert_declared",
            shop_id: shopId,
            shop_name: name,
            job_id: null,
            package_id: null,
            value_cad: null,
            credit_cad: null,
            message: t("event.cert_declared", { shop: name, cert: CERT_LABEL[certType] ?? certType, date: expiresAt }),
            payload: { cert_type: certType, expires_at: expiresAt, cert_number: body.cert_number },
          }),
        ]),
      }))
      return rec
    },
    [mutateLocal, sendLive]
  )

  const refresh = React.useCallback(async () => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(APP_REFRESH_EVENT))
    if (useEngineRef.current) {
      await flushOutbox()
      await syncLive(true)
      return
    }
    putBase(readLocal())
    setLastSyncAt(nowIso())
  }, [flushOutbox, syncLive, putBase])

  const value = React.useMemo<AppActions>(
    () => ({
      ready: demo.ready && loaded,
      decisions: data.decisions,
      fundingRequests: data.fundingRequests,
      capacity: data.capacity,
      declaredCerts: data.declaredCerts,
      events: data.events,
      routedAt: data.routedAt,
      pending: outbox.length,
      lastSyncAt,
      decideOffer,
      requestFunding,
      confirmCapacity,
      declareCertExpiry,
      source: useEngine ? "engine" : "local",
      online,
      refresh,
    }),
    [demo.ready, loaded, data, outbox.length, lastSyncAt, decideOffer, requestFunding, confirmCapacity, declareCertExpiry, useEngine, online, refresh]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppActions(): AppActions {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error("useAppActions must be used inside <AppActionsProvider>")
  return ctx
}

/** useAppActions() narrowed to one shop. */
export function useShopActions(shopId: string): ShopActions {
  const a = useAppActions()
  const { decisions, fundingRequests, capacity, declaredCerts, events, routedAt, decideOffer, requestFunding, confirmCapacity, declareCertExpiry } = a
  return React.useMemo<ShopActions>(() => {
    const mine: Record<string, OfferDecisionRec> = {}
    const prefix = `${shopId}:`
    for (const [k, v] of Object.entries(decisions)) if (k.startsWith(prefix)) mine[k.slice(prefix.length)] = v
    const reqs: Record<string, FundingRequestRec> = {}
    for (const [k, v] of Object.entries(fundingRequests)) if (v.shop_id === shopId) reqs[k] = v
    return {
      shopId,
      decisions: mine,
      fundingRequests: reqs,
      capacity: capacity[shopId] ?? null,
      declaredCerts: declaredCerts[shopId] ?? {},
      events: events.filter((e) => e.shop_id === shopId),
      routedAt,
      decide: (jobId, input) => decideOffer(shopId, jobId, input),
      requestFunding: (requirement) => requestFunding(shopId, requirement),
      confirmCapacity: (input) => confirmCapacity(shopId, input),
      declareCertExpiry: (certType, expiresAt, certNumber) => declareCertExpiry(shopId, certType, expiresAt, certNumber),
    }
  }, [shopId, decisions, fundingRequests, capacity, declaredCerts, events, routedAt, decideOffer, requestFunding, confirmCapacity, declareCertExpiry])
}

/** Program id the actions store follows. */
export const APP_ACTIONS_PROGRAM = APP_PROGRAM_ID
