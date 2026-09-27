"use client"

// useAward(shopId, jobId): the award package for one accepted offer.
// Live: GET/POST /shops/{id}/offers/{job}/award… on useDemo().apiUrl, re-read on
// every new program event (so the defence company sees progress). An engine
// without the award routes (FastAPI "Not Found") falls back to the local build.
// Demo data: built on this device from useShopBundle() data; progress is kept in
// localStorage "muster.award.v1" and synced across tabs via the storage event.

import * as React from "react"
import { useDemo } from "@/lib/data/store"
import { appFetch, isAppApiError } from "@/lib/app/api"
import { useAppActions } from "@/lib/app/actions-store"
import { useShopBundle } from "@/lib/app/shop-bundle"
import { buildLocalAward, type AwardProgress } from "./build"
import type { Award, AwardState } from "./types"

const KEY = "muster.award.v1"
const LOCAL_EVENT = "muster:award"

type Store = Record<string, AwardProgress>

const enc = encodeURIComponent
export const awardPaths = {
  award: (shopId: string, jobId: string) => `/shops/${enc(shopId)}/offers/${enc(jobId)}/award`,
  document: (shopId: string, jobId: string, key: string) => `/shops/${enc(shopId)}/offers/${enc(jobId)}/award/documents/${enc(key)}`,
  call: (shopId: string, jobId: string) => `/shops/${enc(shopId)}/offers/${enc(jobId)}/award/call`,
}

// ---------------------------------------------------------------------------
// Local progress store

function readRaw(): string {
  try {
    return window.localStorage.getItem(KEY) ?? ""
  } catch {
    return ""
  }
}
function parse(raw: string): Store {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as unknown
    return v && typeof v === "object" ? (v as Store) : {}
  } catch {
    return {}
  }
}
let memory = "" // fallback when storage is blocked
function snapshot(): string {
  const raw = readRaw()
  return raw || memory
}
function writeStore(s: Store) {
  const raw = JSON.stringify(s)
  memory = raw
  try {
    window.localStorage.setItem(KEY, raw)
  } catch {
    /* private window: memory only */
  }
  window.dispatchEvent(new Event(LOCAL_EVENT))
}
function subscribe(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) cb()
  }
  window.addEventListener("storage", onStorage)
  window.addEventListener(LOCAL_EVENT, cb)
  return () => {
    window.removeEventListener("storage", onStorage)
    window.removeEventListener(LOCAL_EVENT, cb)
  }
}
const serverSnapshot = () => ""

const pkey = (shopId: string, jobId: string) => `${shopId}:${jobId}`

/** Clears this device's award progress (demo reset). */
export function clearLocalAwards(): void {
  if (typeof window === "undefined") return
  writeStore({})
}

function updateProgress(shopId: string, jobId: string, fn: (p: AwardProgress) => AwardProgress) {
  const s = parse(snapshot())
  const k = pkey(shopId, jobId)
  s[k] = fn(s[k] ?? { docs: {}, slot: null })
  writeStore(s)
}

// ---------------------------------------------------------------------------
// Hook

export function useAward(shopId: string, jobId: string): AwardState {
  const demo = useDemo()
  const { mode, apiUrl, offerStatus, ready } = demo
  const { events } = useAppActions()
  const b = useShopBundle(shopId)
  const raw = React.useSyncExternalStore(subscribe, snapshot, serverSnapshot)

  const [remote, setRemote] = React.useState<Award | null>(null)
  const [remoteProblem, setRemoteProblem] = React.useState<AwardState["problem"]>(null)
  const [remoteError, setRemoteError] = React.useState<string | null>(null)
  const [routeMissing, setRouteMissing] = React.useState(false)
  const [remoteLoading, setRemoteLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const reqRef = React.useRef(0)

  const live = mode === "live" && !routeMissing
  const lastSeq = events.length ? events[events.length - 1].seq : 0

  const load = React.useCallback(async () => {
    if (mode !== "live") return
    const id = ++reqRef.current
    try {
      const a = await appFetch<Award>(apiUrl, awardPaths.award(shopId, jobId))
      if (id !== reqRef.current) return
      setRemote(a)
      setRemoteProblem(null)
      setRemoteError(null)
    } catch (e) {
      if (id !== reqRef.current) return
      if (isAppApiError(e) && e.routeMissing) {
        setRouteMissing(true)
      } else if (isAppApiError(e) && e.status === 409) {
        setRemote(null)
        setRemoteProblem("not_accepted")
        setRemoteError(e.detail)
      } else if (isAppApiError(e) && e.status === 404) {
        setRemote(null)
        setRemoteProblem("not_found")
        setRemoteError(e.detail)
      } else {
        setRemoteProblem("error")
        setRemoteError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      if (id === reqRef.current) setRemoteLoading(false)
    }
  }, [mode, apiUrl, shopId, jobId])

  React.useEffect(() => {
    if (!ready || mode !== "live" || routeMissing) return
    let cancelled = false
    const id = window.setTimeout(() => {
      if (!cancelled) void load()
    }, lastSeq ? 200 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [ready, mode, routeMissing, lastSeq, load])

  // Local build (demo data, or an engine without the award routes).
  const offer = b.offers.find((o) => o.job_id === jobId) ?? null
  const job = b.jobsById[jobId] ?? null
  const decision = b.actions.decisions[jobId] ?? null
  const overlay = offerStatus?.[pkey(shopId, jobId)]
  const locallyAccepted =
    !!offer && (decision ? decision.decision === "accepted" : offer.status === "accepted" || overlay === "accepted")
  const acceptedAt = decision?.decision === "accepted" ? decision.at : null
  const progressRaw = JSON.stringify(parse(raw)[pkey(shopId, jobId)] ?? null)
  const certs = b.certs
  const local = React.useMemo<Award | null>(() => {
    if (!offer || !locallyAccepted) return null
    const progress = (JSON.parse(progressRaw) as AwardProgress | null) ?? { docs: {}, slot: null }
    return buildLocalAward({ shopId, offer, job, certs, acceptedAt, progress })
  }, [offer, locallyAccepted, job, certs, acceptedAt, progressRaw, shopId])

  const signDocument = React.useCallback(
    async (key: string): Promise<Award | null> => {
      setBusy(true)
      try {
        if (live) {
          const a = await appFetch<Award>(apiUrl, awardPaths.document(shopId, jobId, key), { json: {} })
          setRemote(a)
          return a
        }
        updateProgress(shopId, jobId, (p) => (p.docs[key] ? p : { ...p, docs: { ...p.docs, [key]: new Date().toISOString() } }))
        return null
      } catch (e) {
        setRemoteError(e instanceof Error ? e.message : String(e))
        throw e
      } finally {
        setBusy(false)
      }
    },
    [live, apiUrl, shopId, jobId]
  )

  const bookCall = React.useCallback(
    async (slot: string): Promise<Award | null> => {
      setBusy(true)
      try {
        if (live) {
          const a = await appFetch<Award>(apiUrl, awardPaths.call(shopId, jobId), { json: { slot } })
          setRemote(a)
          return a
        }
        updateProgress(shopId, jobId, (p) => ({ ...p, slot }))
        return null
      } catch (e) {
        setRemoteError(e instanceof Error ? e.message : String(e))
        throw e
      } finally {
        setBusy(false)
      }
    },
    [live, apiUrl, shopId, jobId]
  )

  const refresh = React.useCallback(async () => {
    if (live) await load()
    else await b.refresh()
  }, [live, load, b])

  const enriched = React.useMemo<Award | null>(
    () =>
      remote
        ? {
            ...remote,
            qty: remote.qty ?? job?.qty ?? null,
            unit_price_cad: remote.unit_price_cad ?? job?.unit_price_cad ?? null,
            ccv_pct: remote.ccv_pct ?? job?.ccv_pct ?? null,
            multiplier: remote.multiplier ?? offer?.multiplier ?? null,
          }
        : null,
    [remote, job, offer]
  )

  if (live) {
    return {
      award: enriched,
      source: "engine",
      loading: !ready || (remoteLoading && !remote && !remoteProblem),
      problem: remote ? null : remoteProblem,
      error: remoteError,
      busy,
      signDocument,
      bookCall,
      refresh,
    }
  }
  const loading = b.loading && !b.detail
  return {
    award: local,
    source: "local",
    loading,
    problem: loading || local ? null : offer ? "not_accepted" : b.error ? "error" : "not_found",
    error: b.error,
    busy,
    signDocument,
    bookCall,
    refresh,
  }
}
