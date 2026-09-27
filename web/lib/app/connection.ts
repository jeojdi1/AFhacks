"use client"

// One answer to "is this phone talking to Muster right now?", shared by the
// header badge, the offline banner and the screens that would otherwise show
// an empty "nothing routed yet" state when the data simply could not load.

import * as React from "react"
import { useDemo } from "@/lib/data/store"
import { useAppActions } from "./actions-store"

function subscribe(fn: () => void): () => void {
  window.addEventListener("online", fn)
  window.addEventListener("offline", fn)
  return () => {
    window.removeEventListener("online", fn)
    window.removeEventListener("offline", fn)
  }
}

/** navigator.onLine as React state (true on the server). */
export function useDeviceOnline(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
    () => true
  )
}

export interface Connection {
  /** Live mode (the engine is the source of truth). */
  live: boolean
  /** The phone itself has a network connection. */
  deviceOnline: boolean
  /**
   * The data on screen may be stale or missing: the phone is offline, or (live
   * mode) the engine stopped answering. Fixture mode never needs the network,
   * so this is false there unless the phone is offline.
   */
  disconnected: boolean
  /** Live mode and the engine can't be reached (phone offline or engine down). */
  unreachable: boolean
  /** Why: "device" (phone offline) or "engine" (online, engine not answering). */
  reason: "device" | "engine" | null
  /** When data was last read from Muster (null: nothing saved on this phone yet). */
  lastSyncAt: string | null
  retry(): Promise<void>
}

export function useConnection(): Connection {
  const { ready, mode } = useDemo()
  const { online, lastSyncAt, refresh, ready: actionsReady } = useAppActions()
  const deviceOnline = useDeviceOnline()
  const live = ready && mode === "live"
  const disconnected = actionsReady && (!online || !deviceOnline)
  const unreachable = live && disconnected
  const reason = !disconnected ? null : deviceOnline ? "engine" : "device"
  return { live, deviceOnline, disconnected, unreachable, reason, lastSyncAt, retry: refresh }
}
