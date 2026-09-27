"use client"

import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { t } from "@/lib/app/strings"
import type { SeatStage } from "@/lib/app/readiness"

/** Vertical program stepper: nominated → … → ticket issued. Status uses colour, icon and text. */
export function SeatStepper({ stages, currentId }: { stages: SeatStage[]; currentId: string }) {
  const current = Math.max(0, stages.findIndex((s) => s.id === currentId))
  return (
    <ol className="flex flex-col">
      {stages.map((s, i) => {
        const done = i < current
        const now = i === current
        const last = i === stages.length - 1
        return (
          <li key={s.id} className="relative flex gap-3" aria-current={now ? "step" : undefined}>
            {!last ? (
              <span
                aria-hidden
                className={cn("absolute top-10 bottom-0 left-[19px] w-0.5", done ? "bg-funded" : "bg-border")}
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold tabular-nums",
                done && "border-funded bg-funded text-white",
                now && "border-brand bg-background text-brand",
                !done && !now && "border-border bg-background text-muted-foreground"
              )}
            >
              {done ? <Check className="size-5" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1 pb-5">
              <p className={cn("flex flex-wrap items-center gap-2 text-base leading-snug font-semibold", !done && !now && "text-muted-foreground")}>
                {s.label}
                {now ? (
                  <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">{t("seat.current")}</span>
                ) : done ? (
                  <span className="rounded-full bg-funded-soft px-2 py-0.5 text-xs font-medium text-funded">{t("seat.done")}</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-[15px] leading-snug text-muted-foreground">{s.detail}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
