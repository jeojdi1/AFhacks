"use client"

// Northgate's replies to shop questions, sent from /m/prime.
//
// Live mode: POST /shops/{shop_id}/offers/{job_id}/reply {reply_code, text, idempotency_key}
// (docs/api.md). The engine stores the reply on the question's decision record
// (decision.reply) and emits an `offer_reply` event, so it reaches the shop's phone.
// The route is looked up once per engine URL in /openapi.json (a missing route never
// shows up as a failed request); an older engine without it, or fixture mode, records
// the reply on this device only (localStorage `muster.app.v1.replies`, synced across
// tabs) and the UI says "Reply sent (demo)". Replies never change routing, jobs or the ledger.
//
// Local replies are keyed by the question they answer (shop, job and the question
// decision's `at`), so a new question (after a reseed or a new routing) never shows an
// old reply, and the whole store is dropped when the program's routed_at changes.

import * as React from "react"
import { AppApiError, appFetch, newIdempotencyKey } from "./api"
import { extendStrings, t } from "./strings"
import type { OfferDecisionRec, QuestionCode } from "./types"

// Reply copy, shared by /m/prime (prime-actions.tsx) and the laptop desk (/prime).
extendStrings("en", {
  "pa.q.reply.lead_time": "Yes, November works",
  "pa.q.reply.quantity_split": "Yes, two lots is fine",
  "pa.q.reply.material_supply": "We'll supply the material",
  "pa.q.reply.first_article": "Yes, send a first article",
  "pa.q.reply.generic": "We'll confirm by Friday",
  "pa.q.sent": "Reply sent",
  "pa.q.sentBody": "{shop} sees it on its phone.",
  "pa.q.sentDemo": "Reply sent (demo)",
  "pa.q.sentDemoBody": "Recorded on this device only: this engine has no reply route.",
  "pa.q.failed": "Could not send the reply",
})

/** Canned replies for a question: one that answers its topic, then a generic holding reply. */
const REPLY_CODES: Record<QuestionCode, string> = {
  lead_time: "yes_date",
  quantity_split: "yes_split",
  material_supply: "we_supply",
  first_article: "yes_fai",
}

/** The reply chips for one question (same set on the phone and the laptop). */
export function replyTemplates(q: QuestionCode | null): { code: string; text: string }[] {
  const out: { code: string; text: string }[] = []
  if (q && REPLY_CODES[q]) out.push({ code: REPLY_CODES[q], text: t(`pa.q.reply.${q}`) })
  out.push({ code: "confirm_friday", text: t("pa.q.reply.generic") })
  return out
}

export const REPLIES_KEY = "muster.app.v1.replies"
const CHANGE_EVENT = "muster:replies-change"

export interface PrimeReply {
  shop_id: string
  job_id: string
  /** `at` of the question decision this answers. */
  question_at: string
  /** Canned-reply id (sent to the engine as reply_code). */
  code: string
  text: string
  at: string
  /** "engine": the engine stored it; "local": recorded on this device (demo). */
  via: "engine" | "local"
}

interface Stored {
  routed_at: string | null
  replies: Record<string, PrimeReply>
}

/** Key of the reply to one question: shop, job and the question decision's time. */
export const replyKey = (shopId: string, jobId: string, questionAt: string) => `${shopId}:${jobId}:${questionAt}`

const EMPTY_STORE: Stored = { routed_at: null, replies: {} }
let memory: Stored = EMPTY_STORE
let cachedRaw: string | null | undefined
let cached: Stored = EMPTY_STORE

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(REPLIES_KEY)
  } catch {
    return null
  }
}

function parse(raw: string): Stored {
  try {
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== "object" || Array.isArray(v)) return EMPTY_STORE
    const o = v as { routed_at?: unknown; replies?: unknown }
    // The old flat shape (keyed shop:job, no routed_at) cannot be matched to a question: drop it.
    if (!o.replies || typeof o.replies !== "object" || Array.isArray(o.replies)) return EMPTY_STORE
    return { routed_at: typeof o.routed_at === "string" ? o.routed_at : null, replies: o.replies as Record<string, PrimeReply> }
  } catch {
    return EMPTY_STORE
  }
}

function snapshotStore(): Stored {
  const raw = readRaw()
  if (raw === null) return memory
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cached = parse(raw)
  }
  return cached
}

const snapshot = (): Record<string, PrimeReply> => snapshotStore().replies
const EMPTY: Record<string, PrimeReply> = {}

function write(next: Stored) {
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

/** Replies recorded on this device (key: replyKey). */
export function usePrimeReplies(): Record<string, PrimeReply> {
  return React.useSyncExternalStore(subscribe, snapshot, () => EMPTY)
}

/**
 * Keeps the local replies in step with the program: when routed_at changes (a new
 * routing, a reseed, a reset) every stored reply is dropped. Call once the actions
 * store is ready.
 */
export function useSyncRepliesWithRouting(routedAt: string | null, ready: boolean): void {
  React.useEffect(() => {
    if (!ready) return
    const cur = snapshotStore()
    if (cur.routed_at === routedAt) return
    // First sight of a program (nothing recorded yet): just remember it. Otherwise it changed: drop the replies.
    write({ routed_at: routedAt, replies: cur.routed_at === null ? cur.replies : {} })
  }, [routedAt, ready])
}

/** Forget every stored reply (used when the demo resets). */
export function clearPrimeReplies(): void {
  write({ routed_at: snapshotStore().routed_at, replies: {} })
}

/**
 * The prime's reply to a shop's current question, or null: the engine's decision.reply
 * first, else one recorded on this device for this exact question.
 */
export function replyForDecision(
  d: OfferDecisionRec | null | undefined,
  local: Record<string, PrimeReply>
): { text: string; at: string; via: PrimeReply["via"] } | null {
  if (!d || d.decision !== "question") return null
  if (d.reply && typeof d.reply.text === "string" && d.reply.text) return { text: d.reply.text, at: d.reply.at, via: "engine" }
  const r = local[replyKey(d.shop_id, d.job_id, d.at)]
  return r ? { text: r.text, at: r.at, via: r.via } : null
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
 * Send a canned reply to one question decision. apiUrl is null in fixture mode.
 * Returns the stored reply; throws only for a real engine error (not for a missing route).
 */
export async function sendPrimeReply(apiUrl: string | null, question: OfferDecisionRec, code: string, text: string): Promise<PrimeReply> {
  const { shop_id: shopId, job_id: jobId } = question
  let via: PrimeReply["via"] = "local"
  if (apiUrl && (await hasReplyRoute(apiUrl))) {
    try {
      await appFetch<unknown>(apiUrl, `/shops/${encodeURIComponent(shopId)}/offers/${encodeURIComponent(jobId)}/reply`, {
        json: { reply_code: code, text, idempotency_key: newIdempotencyKey() },
        timeoutMs: 8000,
      })
      via = "engine"
    } catch (e) {
      // Fall back only when the route itself is gone (FastAPI's bare "Not Found"); the engine's
      // own 404/409 ("not offered", "No open question") is a real answer and is shown.
      if (!(e instanceof AppApiError && e.routeMissing)) throw e
    }
  }
  const rec: PrimeReply = { shop_id: shopId, job_id: jobId, question_at: question.at, code, text, at: new Date().toISOString(), via }
  const cur = snapshotStore()
  write({ ...cur, replies: { ...cur.replies, [replyKey(shopId, jobId, question.at)]: rec } })
  return rec
}
