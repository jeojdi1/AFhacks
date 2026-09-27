"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useStoryMode } from "@/lib/ui/story-mode"

/**
 * Detail that Story mode tucks away (docs/ux-simplification.md §6). Nothing is removed.
 *
 * - storyHidden (default): collapsed in Story mode, open by default in detail mode; always collapsible.
 * - storyHidden={false}: collapsed by default in both modes, still visible as a toggle.
 *
 * Collapsed content is not rendered, so its text never counts as "on screen".
 */
export function Details({
  summary,
  children,
  storyHidden = true,
  openSummary,
  className,
  contentClassName,
  id,
}: {
  /** Toggle text, e.g. "Show all 40 jobs" or "Rules behind this". */
  summary: React.ReactNode
  children: React.ReactNode
  storyHidden?: boolean
  /** Toggle text while open (defaults to `summary`). */
  openSummary?: React.ReactNode
  className?: string
  contentClassName?: string
  id?: string
}) {
  const { story } = useStoryMode()
  const autoId = React.useId()
  const regionId = id ?? `details-${autoId}`
  const defaultOpen = storyHidden ? !story : false
  // A manual toggle holds until Story mode flips; then the mode's default applies again.
  const [manual, setManual] = React.useState<{ story: boolean; open: boolean } | null>(null)
  const open = manual && manual.story === story ? manual.open : defaultOpen

  return (
    <div className={cn("min-w-0", className)} data-details data-open={open ? "true" : "false"}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setManual({ story, open: !open })}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium text-slate-700 underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring"
      >
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-180")}
          aria-hidden
        />
        {open && openSummary ? openSummary : summary}
      </button>
      {open ? (
        <div id={regionId} className={cn("mt-2", contentClassName)}>
          {children}
        </div>
      ) : (
        <div id={regionId} hidden />
      )}
    </div>
  )
}
