"use client"

// "Simulate shops responding": a runner that asks the live engine for the next
// simulated answer every 8 s while the toggle is on, a strip under the header
// that says so (with Stop), and the small "Simulated" chip used in feeds.

import * as React from "react"
import { toast } from "sonner"
import { Bot, Square } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { useAppActions } from "@/lib/app/actions-store"
import { AppApiError } from "@/lib/app/api"
import { SIM_TICK_MS, SIM_WAIT_MS, setSimulating, simulateTick, tickExhausted, tickWaiting, useSimulating } from "@/lib/app/demo-sim"
import { extendStrings, t } from "@/lib/app/strings"

extendStrings("en", {
  "sim.chip": "Simulated",
  "sim.chipTitle": "Written by the demo simulator, not a real shop",
  "sim.pill": "Simulated activity",
  "sim.strip": "Shops answer every 8 s",
  "sim.stop": "Stop",
  "sim.finished": "Simulated activity finished",
  "sim.finishedBody": "Every simulated shop has answered.",
  "sim.updateEngine": "Update the engine",
  "sim.updateEngineBody": "This engine can't simulate shops yet. Restart it with the latest code.",
  "sim.failed": "Simulation stopped",
  "sim.failedBody": "The engine didn't accept the next simulated answer. Turn it on again to retry.",
  "sim.startedOver": "Northgate started over. Simulation is off until offers are sent again.",
  "sim.waiting": "{count} more shops are waiting for Northgate to fund their training.",
  "sim.waiting_one": "One more shop is waiting for Northgate to fund its training.",
})

/** Small "Simulated" chip (icon + text) for feed rows written by the simulator. */
export function SimulatedChip({ className }: { className?: string }) {
  return (
    <span
      title={t("sim.chipTitle")}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-dashed border-violet-400 bg-violet-50 px-2 text-xs font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-200",
        className
      )}
    >
      <Bot className="size-3.5" aria-hidden />
      {t("sim.chip")}
      <span className="sr-only">: {t("sim.chipTitle")}</span>
    </span>
  )
}

/**
 * sessionStorage (this tab): a notice to show once. The laptop's Start over makes LiveStepSync
 * reload the phone right away, which would wipe a toast shown just before, so the runner
 * saves it here and shows it after the reload.
 */
const NOTICE_KEY = "muster.app.v1.simNotice"

function stopForStartOver() {
  setSimulating(false)
  try {
    window.sessionStorage.setItem(NOTICE_KEY, String(Date.now()))
  } catch {
    /* storage blocked: the toast below may be lost if the page reloads */
  }
  toast.message(t("sim.startedOver"), { id: "sim-started-over" })
}

/** True once, right after a reload that followed a start-over (saved in the last 15 s). */
function takeNotice(): boolean {
  try {
    const v = window.sessionStorage.getItem(NOTICE_KEY)
    if (!v) return false
    window.sessionStorage.removeItem(NOTICE_KEY)
    const at = Number(v)
    return Number.isFinite(at) && Date.now() - at < 15000
  } catch {
    return false
  }
}

/** True while the toggle is on and the page is in live mode (the runner only runs then). */
export function useSimulationActive(): boolean {
  const on = useSimulating()
  const { ready, mode } = useDemo()
  return on && ready && mode === "live"
}

/**
 * Mounted once in the /m layout. Ticks every 8 s while simulation is on in live
 * mode. It skips ticks while nothing is routed (empty / uploaded). When only a gated
 * step is left (the engine says waiting > 0: another shop's request waits for Northgate
 * to fund TP-01) it keeps checking every 15 s instead of stopping. It stops itself when
 * the queue is empty, when the laptop started over (400/409 → quiet notice, never the raw
 * engine detail), or when the engine has no simulator (404 → "Update the engine").
 */
export function SimulationRunner() {
  const active = useSimulationActive()
  const { apiUrl, stage } = useDemo()
  const { refresh, routedAt, source } = useAppActions()
  const busy = React.useRef(false)
  const stageRef = React.useRef(stage)

  // A start-over notice saved just before a reload.
  React.useEffect(() => {
    if (!takeNotice()) return
    const id = window.setTimeout(() => toast.message(t("sim.startedOver"), { id: "sim-started-over" }), 600)
    return () => window.clearTimeout(id)
  }, [])

  // The engine's routed_at went away (the laptop pressed Start over). LiveStepSync reloads this
  // tab in the same commit, so stop now and leave the notice for after the reload.
  const routedRef = React.useRef<string | null | undefined>(undefined)
  React.useEffect(() => {
    if (source !== "engine") return
    const was = routedRef.current
    routedRef.current = routedAt
    if (active && was && !routedAt) stopForStartOver()
  }, [routedAt, source, active])

  React.useEffect(() => {
    const was = stageRef.current
    stageRef.current = stage
    // The laptop pressed Start over while simulating: the same quiet pause as a 400 from a tick.
    const wasRouted = was === "routed" || was === "funded"
    if (active && wasRouted && (stage === "empty" || stage === "uploaded")) stopForStartOver()
  }, [stage, active])

  React.useEffect(() => {
    if (!active) return
    let stopped = false
    let timer: number | undefined
    let waitingShown = false
    let delay = SIM_TICK_MS

    const tick = async () => {
      if (busy.current || stopped) return
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      // Nothing routed yet (or the laptop started over): no offers for simulated shops to answer.
      if (stageRef.current === "empty" || stageRef.current === "uploaded") return
      busy.current = true
      try {
        const r = await simulateTick(apiUrl)
        if (stopped) return
        void refresh()
        const waiting = tickWaiting(r)
        const played = r?.event !== null && r?.event !== undefined
        if (tickExhausted(r)) {
          setSimulating(false)
          toast.message(t("sim.finished"), { description: t("sim.finishedBody") })
        } else if (waiting > 0 && !played) {
          // Only the gated step is left: check back slowly until Northgate funds.
          delay = SIM_WAIT_MS
          if (!waitingShown) {
            waitingShown = true
            toast.message(t("sim.waiting", { count: waiting }))
          }
        } else {
          delay = SIM_TICK_MS
          if (played) waitingShown = false
        }
      } catch (e) {
        if (stopped) return
        if (e instanceof AppApiError && e.network) return // offline banner covers it; try again next tick
        if (e instanceof AppApiError && (e.status === 400 || e.status === 409)) {
          // The laptop pressed Start over (nothing routed): a quiet pause, not an error.
          stopForStartOver()
          return
        }
        setSimulating(false)
        if (e instanceof AppApiError && (e.routeMissing || e.status === 404 || e.status === 405)) {
          toast.error(t("sim.updateEngine"), { description: t("sim.updateEngineBody") })
        } else {
          // Never surface the engine's detail from demo endpoints (it names API routes).
          toast.error(t("sim.failed"), { description: t("sim.failedBody") })
        }
      } finally {
        busy.current = false
      }
    }

    const loop = async () => {
      await tick()
      if (stopped) return
      timer = window.setTimeout(() => void loop(), delay)
    }
    void loop()
    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [active, apiUrl, refresh])

  return null
}

/** Strip under the header while simulation runs: pill + one line + Stop. */
export function SimActivityStrip() {
  const active = useSimulationActive()
  if (!active) return null
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-t border-border bg-violet-50 px-3 py-1.5 text-violet-900 dark:bg-violet-950 dark:text-violet-100"
    >
      <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-violet-300 bg-background px-2 text-xs font-semibold text-violet-800 dark:text-violet-200">
        <span aria-hidden className="size-2 rounded-full bg-violet-500 motion-safe:animate-pulse" />
        {t("sim.pill")}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">{t("sim.strip")}</span>
      <button
        type="button"
        onClick={() => setSimulating(false)}
        className="relative inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-semibold outline-none after:absolute after:-inset-y-2 after:inset-x-0 after:content-[''] hover:bg-violet-100 focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:bg-violet-900"
      >
        <Square className="size-3.5" aria-hidden />
        {t("sim.stop")}
      </button>
    </div>
  )
}
