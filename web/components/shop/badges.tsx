import { Check, Clock, HelpCircle, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { CERT_LABEL } from "@/lib/format"
import { StatusBadge } from "@/components/muster"

/** Pill used by every badge on the shop side, so sizes line up on screen. */
const pill =
  "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium"

export type CertStatus = "verified" | "declared" | "unknown" | "pending_training"

export const CERT_STATUS_META: Record<
  CertStatus,
  { label: string; className: string; dot: string; counts: boolean }
> = {
  verified: {
    label: "Verified",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    counts: true,
  },
  declared: {
    label: "Declared",
    className: "border-blue-200 bg-blue-50 text-blue-800",
    dot: "bg-blue-500",
    counts: true,
  },
  pending_training: {
    label: "Pending training",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    counts: true,
  },
  unknown: {
    label: "Unknown",
    className: "border-zinc-200 bg-zinc-50 text-zinc-500",
    dot: "bg-zinc-300",
    counts: false,
  },
}

export function certStatusMeta(status: string | null | undefined) {
  return CERT_STATUS_META[(status as CertStatus) ?? "unknown"] ?? CERT_STATUS_META.unknown
}

export function certLabel(type: string): string {
  if (CERT_LABEL?.[type]) return CERT_LABEL[type]
  if (type.startsWith("NADCAP:")) {
    const commodity = type.slice(7).toLowerCase().replace(/_/g, " ")
    return `Nadcap ${commodity}`
  }
  return type.replace(/_/g, " ")
}

/** Short label for dense tables ("CWB W47.1", "AS9100"). */
export function certShortLabel(type: string): string {
  switch (type) {
    case "CGP":
      return "CGP"
    case "CPCSC_L1":
      return "CPCSC L1"
    case "ISO9001":
      return "ISO 9001"
    case "AS9100":
      return "AS9100"
    case "CWB_W47.1":
      return "CWB W47.1"
    default:
      return certLabel(type)
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === "verified") return <ShieldCheck className="size-3.5" aria-hidden />
  if (status === "declared") return <Check className="size-3.5" aria-hidden />
  if (status === "pending_training") return <Clock className="size-3.5" aria-hidden />
  return <HelpCircle className="size-3.5" aria-hidden />
}

export function CertStatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const meta = certStatusMeta(status)
  return (
    <span className={cn(pill, meta.className, className)}>
      <StatusIcon status={status} />
      {meta.label}
    </span>
  )
}

/** Compact cert chip for the network table: name coloured by status. */
export function CertChip({ type, status }: { type: string; status: string }) {
  const meta = certStatusMeta(status)
  return (
    <span
      className={cn(pill, "h-6 px-2", meta.className, !meta.counts && "opacity-70")}
      title={`${certLabel(type)}: ${meta.label}`}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {certShortLabel(type)}
    </span>
  )
}

export function ShopLabelBadge({
  source,
  label,
  className,
}: {
  source: string
  label?: string | null
  className?: string
}) {
  if (source === "public") {
    return (
      <StatusBadge
        kind="public"
        label={label || "Public data — unverified — not affiliated"}
        className={className}
      />
    )
  }
  return <StatusBadge kind="synthetic" label={label || "Synthetic"} className={className} />
}

export function SmeBadge({ isSme, className }: { isSme: boolean; className?: string }) {
  return isSme ? (
    <span className={cn(pill, "border-emerald-200 bg-emerald-50 text-emerald-800", className)} title="Small and medium-sized enterprise (SME): direct work earns 2x ITB credit">
      SME · 2x credit
    </span>
  ) : (
    <span className={cn(pill, "border-zinc-200 bg-zinc-50 text-zinc-600", className)}>
      Non-SME · 1x
    </span>
  )
}

export function TrainingStatusBadge({ status }: { status: string }) {
  return <StatusBadge kind={status === "funded" ? "funded" : "suggested"} />
}

export function MultiplierPill({ multiplier }: { multiplier: number }) {
  return (
    <span
      className={cn(
        pill,
        "h-6 px-2.5 text-xs font-semibold tabular-nums",
        multiplier >= 2
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-zinc-200 bg-zinc-50 text-zinc-700"
      )}
    >
      {multiplier}x
    </span>
  )
}

export function NewBadge() {
  return (
    <span className={cn(pill, "h-5 border-transparent bg-[#B42318] px-2 text-white")}>
      New
    </span>
  )
}

export function AssumptionPill({ text = "assumption" }: { text?: string }) {
  return (
    <span
      className="inline-flex h-5 items-center rounded-full border border-dashed border-zinc-400 px-2 text-[11px] font-medium text-zinc-600"
      title="Estimate for demo; not an official figure"
    >
      {text}
    </span>
  )
}
