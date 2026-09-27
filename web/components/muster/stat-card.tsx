import type * as React from "react"
import { cn } from "@/lib/utils"

export type StatTone = "default" | "accent" | "success" | "warning" | "controlled" | "info" | "muted"

const TONE_VALUE: Record<StatTone, string> = {
  default: "text-foreground",
  accent: "text-brand",
  success: "text-assigned",
  warning: "text-blocked",
  controlled: "text-controlled",
  info: "text-public",
  muted: "text-muted-foreground",
}

const TONE_BAR: Record<StatTone, string> = {
  default: "bg-slate-300",
  accent: "bg-brand",
  success: "bg-assigned",
  warning: "bg-blocked",
  controlled: "bg-controlled",
  info: "bg-public",
  muted: "bg-slate-200",
}

/** A headline number: small label, big tabular value (32–40px), optional sub line. */
export function StatCard({
  label,
  value,
  sub,
  tone = "default",
  right,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: StatTone
  /** Optional element in the top-right corner (e.g. an AssumptionTag). */
  right?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="stat-card"
      className={cn(
        "relative flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-xl border border-border bg-card px-5 py-4",
        className
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", TONE_BAR[tone])} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        {right}
      </div>
      <div className={cn("text-[2rem] leading-tight font-semibold tracking-tight tabular-nums lg:text-[2.25rem]", TONE_VALUE[tone])}>
        {value}
      </div>
      {sub ? <div className="text-sm text-muted-foreground">{sub}</div> : null}
    </div>
  )
}
