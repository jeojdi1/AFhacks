import type * as React from "react"
import { TriangleAlert, Check, CircleDashed, Lock, ShieldCheck, Sparkles, Globe, FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"
import { AssumptionTag } from "./assumption-tag"

export type StatusKind =
  | "assigned"
  | "blocked"
  | "controlled"
  | "cgp"
  | "synthetic"
  | "public"
  | "assumption"
  | "funded"
  | "suggested"

const STYLES: Record<
  Exclude<StatusKind, "assumption">,
  { label: string; className: string; Icon: React.ComponentType<{ className?: string }>; title?: string }
> = {
  assigned: {
    label: "Assigned",
    className: "border-assigned/25 bg-assigned-soft text-assigned",
    Icon: Check,
  },
  blocked: {
    label: "Blocked",
    className: "border-blocked/30 bg-blocked-soft text-blocked",
    Icon: TriangleAlert,
  },
  controlled: {
    label: "Controlled · CGP only",
    className: "border-controlled/25 bg-controlled-soft text-controlled",
    Icon: Lock,
    title: "Controlled goods: only shops registered in the federal Controlled Goods Program (CGP) may receive this job",
  },
  cgp: {
    label: "CGP registered",
    className: "border-controlled/25 bg-controlled-soft text-controlled",
    Icon: ShieldCheck,
    title: "Registered in the federal Controlled Goods Program (CGP): may handle controlled defence parts",
  },
  synthetic: {
    label: "Synthetic",
    className: "border-slate-300 bg-white text-slate-600",
    Icon: FlaskConical,
  },
  public: {
    label: "Public data — unverified",
    className: "border-public/25 bg-public-soft text-public",
    Icon: Globe,
  },
  funded: {
    label: "Funded",
    className: "border-funded/30 bg-funded-soft text-funded",
    Icon: Check,
  },
  suggested: {
    label: "Suggested",
    className: "border-slate-300 bg-slate-50 text-slate-700",
    Icon: Sparkles,
  },
}

/**
 * One badge vocabulary for the whole app.
 * assigned = emerald, blocked = amber, controlled/cgp = violet, funded = emerald + check,
 * synthetic = slate outline, public = sky, assumption = dotted pill, suggested = neutral.
 */
export function StatusBadge({
  kind,
  label,
  icon = true,
  className,
  title,
}: {
  kind: StatusKind
  /** Override the default text (e.g. "Unblocked"). */
  label?: React.ReactNode
  icon?: boolean
  className?: string
  title?: string
}) {
  if (kind === "assumption") {
    return <AssumptionTag className={className} label={typeof label === "string" ? label : undefined} />
  }
  const s: (typeof STYLES)[keyof typeof STYLES] = STYLES[kind] ?? {
    label: kind,
    className: "border-slate-300 text-slate-600",
    Icon: CircleDashed,
  }
  const Icon = s.Icon
  return (
    <span
      data-status={kind}
      title={title ?? s.title}
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        s.className,
        className
      )}
    >
      {icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null}
      {label ?? s.label}
    </span>
  )
}
