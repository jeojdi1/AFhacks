"use client"

import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { useAppActions } from "@/lib/app/actions-store"
import { c } from "@/lib/ui/copy"
import { STATIC_SITE } from "@/lib/base-path"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"

const OPTIONS = [
  {
    mode: "live" as const,
    title: c("mode.live"),
    body: "Uses the running engine for every step.",
    dot: "bg-assigned",
  },
  {
    mode: "fixtures" as const,
    title: c("mode.demo"),
    body: "Replays saved answers. No engine needed.",
    dot: "bg-amber-500",
  },
]
/** The static GitHub Pages build has no engine: only demo data is offered. */
const CHOICES = STATIC_SITE ? OPTIONS.filter((o) => o.mode === "fixtures") : OPTIONS

/** Header badge showing where data comes from; click to switch. */
export function ModeSwitcher() {
  const { mode, ready, setMode, apiUrl, busy } = useDemo()
  const { online } = useAppActions()
  const current = OPTIONS.find((o) => o.mode === mode) ?? OPTIONS[1]
  // Live, but the engine polls are failing: say so instead of a green "Live".
  const offline = ready && mode === "live" && !online
  const title = offline ? c("mode.offline") : current.title

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted aria-expanded:bg-muted",
          !ready && "opacity-70",
          offline && "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
        )}
        aria-label={`Data source: ${title}. Click to switch.`}
        title={offline ? c("mode.offline.tip") : undefined}
        data-testid="mode-switcher"
        data-state={offline ? "offline" : ready ? mode : "detecting"}
      >
        <span
          className={cn("size-2 rounded-full", !ready ? "animate-pulse bg-slate-400" : offline ? "animate-pulse bg-amber-500" : current.dot)}
          aria-hidden
        />
        <span className="hidden sm:inline">{ready ? title : c("mode.detecting")}</span>
        <span className="sm:hidden">{ready ? (offline ? c("mode.offline.short") : mode === "live" ? c("mode.live") : "Demo") : "…"}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-3">
        <PopoverHeader>
          <PopoverTitle>{c("mode.title")}</PopoverTitle>
          <PopoverDescription>{c("mode.body")}</PopoverDescription>
        </PopoverHeader>
        {offline ? (
          <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
            {c("mode.offline.tip")}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          {CHOICES.map((o) => {
            const active = o.mode === mode
            // Demo mode stays available mid-step so a hung engine never traps the presenter;
            // switching bumps the store generation, so the in-flight result is discarded.
            const blocked = !!busy && o.mode !== "fixtures"
            return (
              <button
                key={o.mode}
                type="button"
                disabled={!ready || blocked}
                title={blocked ? "Wait for the current step to finish" : undefined}
                onClick={() => {
                  if (!active) setMode(o.mode)
                }}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  active ? "border-foreground/20 bg-muted" : "border-border hover:bg-muted"
                )}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", o.dot)} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{o.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {o.body}
                  </span>
                </span>
                {active ? <Check className="mt-1 size-4 shrink-0 text-foreground" aria-hidden /> : null}
              </button>
            )
          })}
        </div>
        <details className="border-t border-border pt-2 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer text-xs font-medium select-none hover:text-foreground">{c("mode.advanced")}</summary>
          <p className="mt-1.5">Demo data keeps your place. {c("mode.live.note")}</p>
          {STATIC_SITE ? null : (
            <p className="mt-1 truncate font-mono" title={apiUrl}>
              API: {apiUrl}
            </p>
          )}
        </details>
      </PopoverContent>
    </Popover>
  )
}
