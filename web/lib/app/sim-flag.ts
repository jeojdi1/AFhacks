// Pure helper (no React, no "use client"): is this event from the demo simulator?
// Shared by the feed model (also used on the desktop) and the phone screens.

import type { AppEvent, OfferDecisionRec } from "./types"

/** An event written by the simulator (shown with a small "Simulated" chip). */
export function isSimulatedEvent(e: unknown): boolean {
  if (!e || typeof e !== "object") return false
  const o = e as { simulated?: unknown; source?: unknown; payload?: unknown }
  if (o.simulated === true || o.source === "simulated" || o.source === "simulation") return true
  const p = o.payload
  if (p && typeof p === "object") {
    const q = p as { simulated?: unknown; source?: unknown }
    return q.simulated === true || q.source === "simulated" || q.source === "simulation"
  }
  return false
}

/** The engine simulator's idempotency keys: "sim:<step>" (engine/simulate.py SIM_KEY_PREFIX). */
export const SIM_KEY_PREFIX = "sim:"

/**
 * A stored decision or funding request written by the demo simulator: its idempotency_key
 * starts with "sim:". Shown with a "Simulated" chip so a scripted answer never reads as the
 * shop's own.
 */
export function isSimulatedRecord(r: unknown): boolean {
  if (!r || typeof r !== "object") return false
  const k = (r as { idempotency_key?: unknown }).idempotency_key
  return typeof k === "string" && k.startsWith(SIM_KEY_PREFIX)
}

const DECISION_EVENT: Record<string, string> = {
  accepted: "offer_accepted",
  declined: "offer_declined",
  question: "offer_question",
}

/**
 * Was this stored decision written by the demo simulator? Same test as /prime and /m/prime:
 * a "sim:" idempotency key (isSimulatedRecord), or the latest matching event is simulated
 * (isSimulatedEvent). `events` is oldest first.
 */
export function decisionIsSimulated(d: OfferDecisionRec | null | undefined, events: readonly AppEvent[]): boolean {
  if (!d) return false
  if (isSimulatedRecord(d)) return true
  const kind = DECISION_EVENT[d.decision]
  if (!kind) return false
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.kind === kind && e.shop_id === d.shop_id && e.job_id === d.job_id) return isSimulatedEvent(e)
  }
  return false
}
