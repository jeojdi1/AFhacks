"use client"

// Northgate's replies to shop questions, sent from /m/prime.
//
// The engine has no reply endpoint in docs/api.md §6. In live mode we look for
// POST /shops/{shop_id}/offers/{job_id}/reply in the engine's /openapi.json (once
// per engine URL, so a missing route never shows up as a failed request) and use
// it when present. Otherwise, or in fixture mode, the reply is recorded on this device only
// (localStorage `muster.app.v1.replies`, synced across tabs) and the UI says
// "Reply sent (demo)". Replies never change routing, jobs or the ledger.

import * as React from "react"
import { AppApiError, appFetch, newIdempotencyKey } from "./api"

export const REPLIES_KEY = "muster.app.v1.replies"
const CHANGE_EVENT = "muster:replies-change"

export interface PrimeReply {
  shop_id: string
  job_id: string
  text: string
  at: string
  /** "engine": the engine stored it; "local": recorded on this device (demo). */
  via: "engine" | "local"
}

export const replyKey = (shopId: string, jobId: string) => `${shopId}:${jobId}`

let memory: Record<string, PrimeReply> = {}
let cachedRaw: string | null | undefined
let cached: Record<string, PrimeReply> = {}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(REPLIES_KEY)
  } catch {
    return null
  }
}

function snapshot(): Record<string, PrimeReply> {
  const raw = readRaw()
  if (raw === null) return memory
  if (raw !== cachedRaw) {
    cachedRaw = raw
    try {
      const v = JSON.parse(raw) as unknown
      cached = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, PrimeReply>) : {}
    } catch {
      cached = {}
    }
  }
  return cached
}

const EMPTY: Record<string, PrimeReply> = {}

function write(next: Record<string, PrimeReply>) {
  memory = next
  try {
    window.localStorage.setItem(REPLIES_KEY, JSON.stringify(next))
  } catch {
    /* storage blocked: kept in memory for this page */
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    /* no window */
  }
}

function subscribe(fn: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === REPLIES_KEY) fn()
  }
  window.addEventListener(CHANGE_EVENT, fn)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, fn)
    window.removeEventListener("storage", onStorage)
  }
}

export function usePrimeReplies(): Record<string, PrimeReply> {
  return React.useSyncExternalStore(subscribe, snapshot, () => EMPTY)
}

/** Forget every stored reply (used when the demo resets). */
export function clearPrimeReplies(): void {
  write({})
}

const REPLY_ROUTE = "/shops/{shop_id}/offers/{job_id}/reply"
const routeProbe = new Map<string, Promise<boolean>>()

/** Does this engine have the reply route? Read once from its OpenAPI document. */
function hasReplyRoute(apiUrl: string): Promise<boolean> {
  let p = routeProbe.get(apiUrl)
  if (!p) {
    p = appFetch<{ paths?: Record<string, unknown> }>(apiUrl, "/openapi.json", { timeoutMs: 5000 })
      .then((doc) => !!doc?.paths && Object.prototype.hasOwnProperty.call(doc.paths, REPLY_ROUTE))
      .catch(() => false)
    routeProbe.set(apiUrl, p)
  }
  return p
}

/**
 * Send a template reply. apiUrl is null in fixture mode. Returns the stored
 * reply; throws only for a real engine error (not for a missing route).
 */
export async function sendPrimeReply(apiUrl: string | null, shopId: string, jobId: string, text: string): Promise<PrimeReply> {
  let via: PrimeReply["via"] = "local"
  if (apiUrl && (await hasReplyRoute(apiUrl))) {
    try {
      await appFetch<unknown>(apiUrl, `/shops/${encodeURIComponent(shopId)}/offers/${encodeURIComponent(jobId)}/reply`, {
        json: { text, idempotency_key: newIdempotencyKey() },
        timeoutMs: 8000,
      })
      via = "engine"
    } catch (e) {
      const missing = e instanceof AppApiError && (e.routeMissing || e.status === 404 || e.status === 405)
      if (!missing) throw e
    }
  }
  const rec: PrimeReply = { shop_id: shopId, job_id: jobId, text, at: new Date().toISOString(), via }
  write({ ...snapshot(), [replyKey(shopId, jobId)]: rec })
  return rec
}
