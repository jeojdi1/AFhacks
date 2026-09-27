"use client"

import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"

const OPTIONS = [
  {
    mode: "live" as const,
    title: "Live API",
    body: "Calls the Muster engine (FastAPI) for every step.",
    dot: "bg-assigned",
  },
  {
    mode: "fixtures" as const,
    title: "Demo mode · fixtures",
    body: "Replays checked-in engine responses. Works offline.",
    dot: "bg-amber-500",
  },
]

/** Header badge showing where data comes from; click to switch. */
export function ModeSwitcher() {
  const { mode, ready, setMode, apiUrl, busy } = useDemo()
  const current = OPTIONS.find((o) => o.mode === mode) ?? OPTIONS[1]

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted aria-expanded:bg-muted",
          !ready && "opacity-70"
        )}
        aria-label={`Data source: ${current.title}. Click to switch.`}
      >
        <span className={cn("size-2 rounded-full", ready ? current.dot : "animate-pulse bg-slate-400")} aria-hidden />
        {ready ? current.title : "Detecting API…"}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-3">
        <PopoverHeader>
          <PopoverTitle>Data source</PopoverTitle>
          <PopoverDescription>Demo mode keeps your place. Switching to Live API resets the engine and the demo flow.</PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-1.5">
          {OPTIONS.map((o) => {
            const active = o.mode === mode
            return (
              <button
                key={o.mode}
                type="button"
                disabled={!ready || !!busy}
                title={busy ? "Wait for the current step to finish" : undefined}
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
                    {o.mode === "live" ? <span className="mt-0.5 block font-mono text-[11px]">{apiUrl}</span> : null}
                  </span>
                </span>
                {active ? <Check className="mt-1 size-4 shrink-0 text-foreground" aria-hidden /> : null}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
