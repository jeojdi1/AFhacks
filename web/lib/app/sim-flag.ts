// Pure helper (no React, no "use client"): is this event from the demo simulator?
// Shared by the feed model (also used on the desktop) and the phone screens.

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
