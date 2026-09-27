"use client"

// Demo helpers for the phone app: fill the live engine with demo activity and
// let simulated shops answer on a timer. Live mode only; fixture ("Demo data")
// mode has no shared engine to fill.
//
//   POST /demo/seed?scenario=populated   → the engine loads a populated demo state
//   POST /demo/simulate/tick             → the engine plays the next simulated answer
//
// Both endpoints are additive and may be missing on an older engine: a 404/405
// comes back as AppApiError with routeMissing, and callers show "Update the engine".
// Events the simulator writes carry a simulated flag (top-level `simulated: true`,
// or `payload.simulated: true`); isSimulatedEvent() accepts either.

import * as React from "react"
import { appFetch } from "./api"

/** sessionStorage: "1" while "Simulate shops responding" is on (this tab only). */
export const SIM_KEY = "muster.app.v1.simulate"
/** One simulated answer every 8 s. */
export const SIM_TICK_MS = 8000
const SIM_EVENT = "muster:sim-change"

export interface SeedResult {
  scenario?: string
  [k: string]: unknown
}

export interface TickResult {
  events?: unknown[]
  event?: unknown
  remaining?: number
  queue_remaining?: number
  done?: boolean
  exhausted?: boolean
  [k: string]: unknown
}

export function seedDemo(apiUrl: string, scenario = "populated"): Promise<SeedResult> {
  return appFetch<SeedResult>(apiUrl, `/demo/seed?scenario=${encodeURIComponent(scenario)}`, { method: "POST", timeoutMs: 30000 })
}

export function simulateTick(apiUrl: string): Promise<TickResult> {
  return appFetch<TickResult>(apiUrl, "/demo/simulate/tick", { method: "POST", timeoutMs: 15000 })
}

/** True when a tick says the simulated queue has nothing left to play. */
export function tickExhausted(r: TickResult | null | undefined): boolean {
  if (!r || typeof r !== "object") return false
  if (r.done === true || r.exhausted === true) return true
  if (r.remaining === 0 || r.queue_remaining === 0) return true
  const known = "done" in r || "exhausted" in r || "remaining" in r || "queue_remaining" in r
  const nothing = (Array.isArray(r.events) ? r.events.length === 0 : true) && (r.event === null || r.event === undefined)
  return !known && nothing
}

export { isSimulatedEvent } from "./sim-flag"

// ---------------------------------------------------------------------------
// "Simulate shops responding" toggle (sessionStorage, shared by the picker and the runner)

let memorySim = false

export function getSimulating(): boolean {
  try {
    return window.sessionStorage.getItem(SIM_KEY) === "1"
  } catch {
    return memorySim
  }
}

export function setSimulating(on: boolean): void {
  memorySim = on
  try {
    if (on) window.sessionStorage.setItem(SIM_KEY, "1")
    else window.sessionStorage.removeItem(SIM_KEY)
  } catch {
    /* storage blocked: the in-memory flag lasts for this page */
  }
  try {
    window.dispatchEvent(new Event(SIM_EVENT))
  } catch {
    /* no window */
  }
}

function subscribe(fn: () => void): () => void {
  window.addEventListener(SIM_EVENT, fn)
  return () => window.removeEventListener(SIM_EVENT, fn)
}

/** The toggle as React state (false on the server). */
export function useSimulating(): boolean {
  return React.useSyncExternalStore(subscribe, getSimulating, () => false)
}
