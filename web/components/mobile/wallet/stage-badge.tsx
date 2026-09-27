import type * as React from "react"
import { CircleCheck, CircleDashed, CircleHelp, CircleX, Clock, FileCheck, GraduationCap, ShieldCheck, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { t } from "@/lib/app/strings"
import type { RenewalStage } from "@/lib/app/types"
import type { CertStatus } from "@/lib/api/types"
import "./wallet-strings"

type Icon = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>

const STAGE: Record<RenewalStage, { cls: string; Icon: Icon }> = {
  ok: { cls: "border-assigned/30 bg-assigned-soft text-assigned", Icon: CircleCheck },
  window_open: { cls: "border-blocked/30 bg-blocked-soft text-blocked", Icon: Clock },
  urgent: { cls: "border-orange-300 bg-orange-50 text-orange-800", Icon: TriangleAlert },
  lapsed: { cls: "border-destructive bg-destructive text-white", Icon: CircleX },
  unknown: { cls: "border-slate-300 bg-slate-50 text-slate-700", Icon: CircleHelp },
}

/** Renewal stage: colour + icon + text (WCAG 1.4.1). Not-held certs get "Not held" instead of a stage. */
export function StageBadge({ stage, held = true, className }: { stage: RenewalStage; held?: boolean; className?: string }) {
  if (!held) {
    return (
      <span
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-dashed border-slate-300 bg-background px-2.5 text-sm font-medium whitespace-nowrap text-slate-600",
          className
        )}
      >
        <CircleDashed className="size-3.5" aria-hidden />
        {t("wallet.row.notHeld")}
      </span>
    )
  }
  const { cls, Icon } = STAGE[stage]
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-sm font-semibold whitespace-nowrap",
        cls,
        className
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {t(`stage.${stage}`)}
    </span>
  )
}

const STATUS: Record<CertStatus, { cls: string; Icon: Icon }> = {
  verified: { cls: "border-assigned/30 text-assigned", Icon: ShieldCheck },
  declared: { cls: "border-slate-300 text-slate-700", Icon: FileCheck },
  pending_training: { cls: "border-funded/30 text-funded", Icon: GraduationCap },
  unknown: { cls: "border-slate-300 text-slate-500", Icon: CircleDashed },
}

/** Certification status chip: verified / declared / not held / pending training. */
export function CertStatusChip({ status, className }: { status: CertStatus; className?: string }) {
  const { cls, Icon } = STATUS[status]
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border bg-background px-2.5 text-sm font-medium whitespace-nowrap",
        cls,
        className
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {t(`cert.status.${status}`)}
    </span>
  )
}

/** Where a date comes from: "illustrative" (synthetic), "shop-declared", or "registry". */
export function DateBasisChip({ basis, className }: { basis: "illustrative" | "shop-declared" | "registry"; className?: string }) {
  if (basis === "registry") return null
  const declared = basis === "shop-declared"
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-sm font-medium whitespace-nowrap",
        declared ? "border-public/30 bg-public-soft text-public" : "border-dashed border-slate-400 text-slate-600",
        className
      )}
    >
      {declared ? t("label.shopDeclared") : t("label.illustrative")}
    </span>
  )
}
