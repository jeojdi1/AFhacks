"use client"

// Hooks for the search + graph pages. Live mode calls the running engine at the store's
// API URL (docs/api.md §7); demo mode (fixtures) answers from ./local and never calls the
// engine. If the engine cannot be reached in live mode, the demo answer is shown with a note.

import * as React from "react"
import { useDemo } from "@/lib/data/store"
import { useAppActions } from "@/lib/app/actions-store"
import {
  DEMO_JOBS_SHOP_ID,
  SearchInputError,
  fundedUnlocks,
  localGraphEgo,
  localGraphSummary,
  localSearchJobs,
  localSearchShops,
} from "./local"
import { DEFAULT_RADIUS_KM } from "./labels"
import type {
  DataOrigin,
  DndHistory,
  GraphEgo,
  GraphSummary,
  JobSearchResponse,
  Loaded,
  ShopSearchParams,
  ShopSearchResponse,
} from "./types"

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

async function getJson<T>(apiUrl: string, path: string, signal: AbortSignal): Promise<T> {
  const base = apiUrl.replace(/\/+$/, "")
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), 8000)
  const onAbort = () => timeout.abort()
  signal.addEventListener("abort", onAbort)
  let res: Response
  try {
    res = await fetch(`${base}${path}`, { headers: { Accept: "application/json" }, cache: "no-store", signal: timeout.signal })
  } catch {
    throw new HttpError(0, signal.aborted ? "aborted" : `Cannot reach the engine at ${base}`)
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", onAbort)
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText || "error"}`
    try {
      const j = (await res.json()) as { detail?: unknown }
      if (typeof j?.detail === "string") detail = j.detail
    } catch {
      /* non-JSON body */
    }
    throw new HttpError(res.status, detail)
  }
  return (await res.json()) as T
}

/**
 * One live GET keyed by `path`; `fallback` answers in demo mode, and in live mode when the
 * engine is unreachable (network error / 5xx). 4xx errors are shown as they are.
 */
function useEngineGet<T>(path: string | null, fallback: () => T | null, deps: React.DependencyList): Loaded<T> {
  const { mode, apiUrl, ready } = useDemo()
  const live = ready && mode === "live" && path !== null
  const key = `${apiUrl}${path ?? ""}|${deps.map((d) => JSON.stringify(d)).join("|")}`
  const [res, setRes] = React.useState<{ key: string; data: T | null; error: string | null; origin: DataOrigin } | null>(null)
  /** Demo answer: a pure function of `deps`, computed only when it is shown. */
  const runDemo = (): { data: T | null; error: string | null } => {
    try {
      return { data: fallback(), error: null }
    } catch (e) {
      return { data: null, error: e instanceof SearchInputError ? e.message : "Could not read the demo data" }
    }
  }

  React.useEffect(() => {
    if (!live || path === null) return
    const ctrl = new AbortController()
    getJson<T>(apiUrl, path, ctrl.signal).then(
      (data) => {
        if (!ctrl.signal.aborted) setRes({ key, data, error: null, origin: "live" })
      },
      (e: unknown) => {
        if (ctrl.signal.aborted) return
        const err = e instanceof HttpError ? e : new HttpError(0, "Request failed")
        if (err.status >= 400 && err.status < 500) setRes({ key, data: null, error: err.message, origin: "live" })
        else setRes({ key, data: null, error: `${err.message}. Showing demo data instead.`, origin: "demo-fallback" })
      }
    )
    return () => ctrl.abort()
  }, [live, path, apiUrl, key])

  if (!ready) return { data: null, loading: true, error: null, origin: "demo" }
  if (!live) {
    const d = runDemo()
    return { data: d.data, loading: false, error: d.error, origin: "demo" }
  }
  if (res?.key === key) {
    if (res.origin === "demo-fallback") return { data: runDemo().data, loading: false, error: res.error, origin: res.origin }
    return { data: res.data, loading: false, error: res.error, origin: res.origin }
  }
  // Loading: keep showing the previous answer (dimmed by the caller).
  return {
    data: res?.origin === "demo-fallback" ? runDemo().data : (res?.data ?? null),
    loading: true,
    error: null,
    origin: res?.origin ?? "live",
  }
}

function shopQueryString(p: ShopSearchParams): string {
  const q = new URLSearchParams()
  if (p.q?.trim()) q.set("q", p.q.trim())
  for (const x of p.process) q.append("process", x)
  for (const x of p.cert) q.append("cert", x)
  if (p.near) {
    q.set("near", p.near)
    q.set("radius_km", String(p.radius_km ?? DEFAULT_RADIUS_KM))
  }
  q.set("source", p.source)
  if (p.dnd_history != null) q.set("dnd_history", String(p.dnd_history))
  q.set("limit", String(p.limit ?? 25))
  return q.toString()
}

/** Funded training packages' certificate unlocks, from the store (demo answers apply them). */
function useUnlocks(): Map<string, string[]> {
  const { fundedIds, gaps } = useDemo()
  return React.useMemo(() => fundedUnlocks(fundedIds, gaps?.suggestions), [fundedIds, gaps])
}

export function useShopSearch(params: ShopSearchParams, dnd: Record<string, DndHistory>): Loaded<ShopSearchResponse> {
  const { fundedIds } = useDemo()
  const unlocks = useUnlocks()
  const qs = shopQueryString(params)
  return useEngineGet<ShopSearchResponse>(
    `/search/shops?${qs}`,
    () => localSearchShops(params, { unlocks, dnd }),
    [qs, fundedIds.join(","), unlocks.size]
  )
}

export function useJobSearch(shopId: string, q: string, process: string[]): Loaded<JobSearchResponse> {
  const { stage, assignments, offerStatus, fundedIds } = useDemo()
  const actions = useAppActions()
  const unlocks = useUnlocks()
  const qs = new URLSearchParams({ shop_id: shopId, include_near_miss: "true" })
  if (q.trim()) qs.set("q", q.trim())
  for (const p of process) qs.append("process", p)
  // This shop's answers: the desktop overlay (useDemo().offerStatus), corrected by the phone's
  // answers (actions store). An undo removes the phone decision but cannot clear the overlay,
  // so the latest offer_* event per job decides (same rule as lib/app/shop-bundle.ts).
  const effective = React.useMemo(() => {
    const prefix = `${shopId}:`
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(offerStatus)) if (k.startsWith(prefix)) out[k] = v
    const lastKind: Record<string, string> = {}
    for (const e of actions.events)
      if (e.job_id && e.shop_id === shopId && e.kind.startsWith("offer_")) lastKind[e.job_id] = e.kind
    for (const [job, kind] of Object.entries(lastKind)) if (kind === "offer_undo") delete out[`${prefix}${job}`]
    for (const [k, d] of Object.entries(actions.decisions)) {
      if (!k.startsWith(prefix)) continue
      if (d.decision === "accepted" || d.decision === "declined") out[k] = d.decision
      else delete out[k]
    }
    return out
  }, [shopId, offerStatus, actions.events, actions.decisions])
  const decided = Object.entries(effective)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join(",")
  // Refetch (live) on every offer answer, including an undo or one sent from another device.
  const offerSeq = actions.events.reduce((m, e) => (e.kind.startsWith("offer_") ? Math.max(m, e.seq) : m), 0)
  return useEngineGet<JobSearchResponse>(
    `/search/jobs?${qs.toString()}`,
    () =>
      shopId === DEMO_JOBS_SHOP_ID
        ? localSearchJobs({ shopId, stage, assignments, offerStatus: effective, unlocks, q, process })
        : null,
    [qs.toString(), stage, fundedIds.join(","), assignments.length, decided, offerSeq]
  )
}

export function useGraphSummary(): Loaded<GraphSummary> {
  return useEngineGet<GraphSummary>("/graph/summary", () => localGraphSummary(), [])
}

export function useGraphEgo(id: string, limit = 80): Loaded<GraphEgo> {
  const { stage } = useDemo()
  return useEngineGet<GraphEgo>(
    `/graph/ego?id=${encodeURIComponent(id)}&depth=1&limit=${limit}`,
    () => localGraphEgo(id, limit),
    [id, limit, stage]
  )
}

/** True in live mode (the page may show the Neo4j Browser link). */
export function useIsLive(): boolean {
  const { mode, ready } = useDemo()
  return ready && mode === "live"
}
