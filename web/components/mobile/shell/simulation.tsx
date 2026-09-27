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
import { SIM_TICK_MS, setSimulating, simulateTick, tickExhausted, useSimulating } from "@/lib/app/demo-sim"
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

/** True while the toggle is on and the page is in live mode (the runner only runs then). */
export function useSimulationActive(): boolean {
  const on = useSimulating()
  const { ready, mode } = useDemo()
  return on && ready && mode === "live"
}

/**
 * Mounted once in the /m layout. Ticks every 8 s while simulation is on in live
 * mode; stops itself when the engine says the queue is empty, or when the engine
 * has no simulator (404 → "Update the engine").
 */
export function SimulationRunner() {
  const active = useSimulationActive()
  const { apiUrl } = useDemo()
  const { refresh } = useAppActions()
  const busy = React.useRef(false)

  React.useEffect(() => {
    if (!active) return
    let stopped = false
    const tick = async () => {
      if (busy.current || stopped) return
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      busy.current = true
      try {
        const r = await simulateTick(apiUrl)
        if (stopped) return
        void refresh()
        if (tickExhausted(r)) {
          setSimulating(false)
          toast.message(t("sim.finished"), { description: t("sim.finishedBody") })
        }
      } catch (e) {
        if (stopped) return
        if (e instanceof AppApiError && e.network) return // offline banner covers it; try again next tick
        setSimulating(false)
        if (e instanceof AppApiError && (e.routeMissing || e.status === 404 || e.status === 405)) {
          toast.error(t("sim.updateEngine"), { description: t("sim.updateEngineBody") })
        } else {
          toast.error(t("sim.failed"), { description: e instanceof AppApiError ? e.detail : String(e) })
        }
      } finally {
        busy.current = false
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), SIM_TICK_MS)
    return () => {
      stopped = true
      window.clearInterval(id)
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
