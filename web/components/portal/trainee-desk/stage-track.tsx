"use client"

// Laptop stage tracker: one row of stage icons joined by a line. Only the current
// stage shows its one-line detail. Below lg the phone's vertical SeatStepper is used.

import { BadgeCheck, CalendarCheck, Check, ClipboardCheck, Flame, GraduationCap, IdCard, UserPlus, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { t } from "@/lib/app/strings"
import type { SeatStage } from "@/lib/app/readiness"
import { SeatStepper } from "@/components/mobile/trainee/seat-stepper"

const ICONS: Record<string, LucideIcon> = {
  nominated: UserPlus,
  eligibility_attested: ClipboardCheck,
  enrolled: GraduationCap,
  started: Flame,
  test_booked: CalendarCheck,
  passed: BadgeCheck,
  ticket_issued: IdCard,
}

/** currentId null = preview (nothing started yet): every stage greyed, no detail line. */
export function StageTrack({ stages, currentId }: { stages: SeatStage[]; currentId: string | null }) {
  const current = currentId === null ? -1 : Math.max(0, stages.findIndex((s) => s.id === currentId))
  const now = current >= 0 ? stages[current] : null
  return (
    <div>
      {currentId !== null ? (
        <div className="lg:hidden">
          <SeatStepper stages={stages} currentId={currentId} />
        </div>
      ) : null}
      <ol
        className={cn("grid gap-2", currentId !== null && "hidden lg:grid")}
        style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}
      >
        {stages.map((s, i) => {
          const done = i < current
          const isNow = i === current
          const last = i === stages.length - 1
          const Icon = ICONS[s.id] ?? GraduationCap
          return (
            <li key={s.id} className="relative flex flex-col items-center gap-2 text-center" aria-current={isNow ? "step" : undefined}>
              {!last ? (
                <span
                  aria-hidden
                  className={cn("absolute top-[18px] left-1/2 sm:top-6 h-1 w-full -translate-y-1/2 rounded-full", done ? "bg-funded" : "bg-border")}
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 flex size-9 items-center sm:size-12 justify-center rounded-full border-2",
                  done && "border-funded bg-funded text-white",
                  isNow && "border-brand bg-brand text-brand-foreground ring-4 ring-brand/20",
                  !done && !isNow && "border-border bg-background text-muted-foreground"
                )}
              >
                {done ? <Check className="size-4 sm:size-5" /> : <Icon className="size-4 sm:size-5" />}
              </span>
              <span
                className={cn(
                  "text-sm leading-snug",
                  isNow ? "font-semibold" : done ? "font-medium" : "text-muted-foreground",
                  currentId === null && "max-sm:sr-only"
                )}
              >
                {s.label}
                {isNow ? <span className="sr-only"> ({t("seat.current")})</span> : done ? <span className="sr-only"> ({t("seat.done")})</span> : null}
              </span>
            </li>
          )
        })}
      </ol>
      {now ? (
        <p className="mt-4 hidden items-center gap-2 rounded-lg bg-brand/5 px-4 py-3 text-base lg:flex">
          <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-brand-foreground">{t("seat.current")}</span>
          <span className="font-semibold">{now.label}</span>
          <span className="text-muted-foreground">· {now.detail}</span>
        </p>
      ) : null}
    </div>
  )
}
