"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useCaptureMode } from "@/lib/ui/story-mode"

function useReducedMotion(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)")
      mq?.addEventListener?.("change", cb)
      return () => mq?.removeEventListener?.("change", cb)
    },
    () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    () => false
  )
}

const clamp = (f: number) => Math.max(0, Math.min(1, Number.isFinite(f) ? f : 0))

/**
 * One honest track on a 0–100% scale (docs/ux-simplification.md §7.2): slate "before",
 * green added segment. No zoomed axis. Animation ≤ 600 ms; reduced motion or ?capture=1
 * renders the final state.
 *
 *   <BeforeAfterBar before={0.115} after={0.134} beforeLabel="Before: $57.5M (11.5%)"
 *                   afterLabel="After: $67.1M (13.4%)" delta="+$9.6M credit" />
 */
export function BeforeAfterBar({
  before,
  after,
  beforeLabel,
  afterLabel,
  delta,
  height = 32,
  animate = true,
  className,
  ariaLabel,
}: {
  /** Fractions of the whole (0–1). */
  before: number
  after: number
  beforeLabel?: React.ReactNode
  afterLabel?: React.ReactNode
  delta?: React.ReactNode
  height?: number
  animate?: boolean
  className?: string
  ariaLabel?: string
}) {
  const b = clamp(before)
  const a = Math.max(b, clamp(after))
  const reduced = useReducedMotion()
  const capture = useCaptureMode()
  const still = !animate || reduced || capture
  const [grown, setGrown] = React.useState(still)

  React.useEffect(() => {
    if (still) return
    const id = requestAnimationFrame(() => setGrown(true))
    return () => cancelAnimationFrame(id)
  }, [still])

  const showAdded = still || grown
  return (
    <div className={cn("w-full min-w-0", className)} data-before-after>
      <div
        role="img"
        aria-label={ariaLabel ?? `${Math.round(b * 1000) / 10}% before, ${Math.round(a * 1000) / 10}% after, on a 0 to 100% scale`}
        className="relative w-full overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200 ring-inset"
        style={{ height }}
      >
        <div className="absolute inset-y-0 left-0 bg-slate-500" style={{ width: `${b * 100}%` }} />
        <div
          className={cn(
            "absolute inset-y-0 bg-assigned",
            !still && "transition-[width] duration-[600ms] ease-out motion-reduce:transition-none"
          )}
          style={{ left: `${b * 100}%`, width: `${showAdded ? (a - b) * 100 : 0}%` }}
        />
      </div>
      {beforeLabel || afterLabel || delta ? (
        <div className="mt-1.5 grid grid-cols-[1fr_auto_1fr] items-baseline gap-2 text-sm tabular-nums">
          <span className="min-w-0 text-left text-slate-600">{beforeLabel}</span>
          <span className="text-center font-semibold text-assigned">{delta}</span>
          <span className="min-w-0 text-right font-medium text-foreground">{afterLabel}</span>
        </div>
      ) : null}
    </div>
  )
}
