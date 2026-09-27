"use client"

import * as React from "react"
import { useDemo } from "@/lib/data/store"
import { useAppActions } from "@/lib/app/actions-store"

const RELOADED_KEY = "muster.app.v1.reloadedFor"

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
    /* storage unavailable: the guard lasts for this page only */
  }
}

/**
 * Live mode only: keeps a phone tab in step when the laptop routes.
 *
 * The demo store (useDemo, store.tsx, frozen tonight) restores its step from the engine
 * only when the page loads. A phone tab opened before the laptop routes therefore keeps
 * "empty" forever, and its offers stay hidden. The actions store already polls the
 * engine's event log, so when it reports a new routing (routed_at changed, or the engine
 * is routed while this tab still shows an empty program) or a reset (routed_at gone while
 * this tab still shows the routed program), we reload once so the demo store restores
 * the engine's step. Funding needs no reload: the phone screens re-read
 * the shop on every new event.
 *
 * Guarded per routed_at in sessionStorage, so it can never loop. Fixture mode is
 * untouched (the actions store mirrors demo steps between tabs there).
 */
export function LiveStepSync() {
  const demo = useDemo()
  const { routedAt, lastSyncAt, source } = useAppActions()
  const baseline = React.useRef<string | null | undefined>(undefined)

  const live = demo.ready && demo.mode === "live" && source === "engine"
  React.useEffect(() => {
    if (!live || !lastSyncAt) return
    if (baseline.current === undefined) baseline.current = routedAt
    if (demo.busy) return
    const shownRouted = demo.stage === "routed" || demo.stage === "funded"
    let guard: string | null = null
    if (routedAt) {
      // Routed on the laptop while this tab shows an empty program, or re-routed since load.
      if (!shownRouted || routedAt !== baseline.current) guard = routedAt
    } else if (shownRouted && baseline.current) {
      // Reset on the laptop while this tab still shows the routed program.
      guard = `reset:${baseline.current}`
    }
    if (!guard || sessionGet(RELOADED_KEY) === guard) return
    sessionSet(RELOADED_KEY, guard)
    window.location.reload()
  }, [live, lastSyncAt, routedAt, demo.busy, demo.stage])

  return null
}
