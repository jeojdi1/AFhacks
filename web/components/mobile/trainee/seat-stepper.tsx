"use client"

import { BadgeCheck, CalendarCheck, Check, ClipboardCheck, Flame, GraduationCap, IdCard, UserPlus, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { t } from "@/lib/app/strings"
import type { SeatStage } from "@/lib/app/readiness"

const ICONS: Record<string, LucideIcon> = {
  nominated: UserPlus,
  eligibility_attested: ClipboardCheck,
  enrolled: GraduationCap,
  started: Flame,
  test_booked: CalendarCheck,
  passed: BadgeCheck,
  ticket_issued: IdCard,
}

/**
 * Program stepper: a progress bar, then one compact row per stage (icon + title).
 * Only the current stage shows its one-line detail. Status uses colour, icon and text.
 */
export function SeatStepper({ stages, currentId }: { stages: SeatStage[]; currentId: string }) {
  const current = Math.max(0, stages.findIndex((s) => s.id === currentId))
  const pct = stages.length ? Math.round(((current + 1) / stages.length) * 100) : 0
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-semibold tabular-nums text-muted-foreground">
          {current + 1}/{stages.length}
        </span>
      </div>
      <ol className="flex flex-col">
        {stages.map((s, i) => {
          const done = i < current
          const now = i === current
          const last = i === stages.length - 1
          const Icon = ICONS[s.id] ?? GraduationCap
          return (
            <li key={s.id} className="relative flex gap-3" aria-current={now ? "step" : undefined}>
              {!last ? (
                <span
                  aria-hidden
                  className={cn("absolute top-9 bottom-0 left-[17px] w-0.5", done ? "bg-funded" : "bg-border")}
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border-2",
                  done && "border-funded bg-funded text-white",
                  now && "border-brand bg-brand text-brand-foreground",
                  !done && !now && "border-border bg-background text-muted-foreground"
                )}
              >
                {done ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              <div className={cn("min-w-0 flex-1", now ? "pb-4" : "pb-2.5")}>
                <p
                  className={cn(
                    "flex min-h-9 flex-wrap items-center gap-2 leading-snug font-semibold",
                    now ? "text-lg" : "text-[15px]",
                    !done && !now && "font-medium text-muted-foreground"
                  )}
                >
                  {s.label}
                  {now ? (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">{t("seat.current")}</span>
                  ) : done ? (
                    <span className="rounded-full bg-funded-soft px-2 py-0.5 text-xs font-medium text-funded">{t("seat.done")}</span>
                  ) : null}
                </p>
                {now ? <p className="text-[15px] leading-snug text-muted-foreground">{s.detail}</p> : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
