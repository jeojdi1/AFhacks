import type * as React from "react"
import { CalendarX, Check, Clock, HelpCircle, Landmark, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { CERT_IN_TRAINING_LABEL, CERT_LABEL, certDisplay, fmtMoney } from "@/lib/format"
import { StatusBadge } from "@/components/muster/status-badge"
import { Term } from "@/components/muster/term"
import { certPlain, multiplierPlain } from "@/lib/ui/plain"
import { ce } from "@/lib/ui/copy-e"
import type { DndHistory } from "./types"

/** Pill used by every badge on the shop side, so sizes line up on screen. */
const pill =
  "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium"

export type CertStatus = "verified" | "declared" | "unknown" | "pending_training" | "expired"

/**
 * `counts` = the matching rules accept it (verified, declared, pending_training; CLAUDE.md §1.1
 * decision 4). `held` = the shop holds it now (verified, declared). `inTraining` = welders are in
 * training for it, paid by Northgate (pending_training). Display "held" from `held`, never `counts`.
 */
export const CERT_STATUS_META: Record<
  CertStatus,
  { label: string; className: string; dot: string; counts: boolean; held: boolean; inTraining: boolean }
> = {
  verified: {
    label: "Verified",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dot: "bg-emerald-500",
    counts: true,
    held: true,
    inTraining: false,
  },
  declared: {
    label: "Declared",
    className: "border-blue-200 bg-blue-50 text-blue-800",
    dot: "bg-blue-500",
    counts: true,
    held: true,
    inTraining: false,
  },
  pending_training: {
    label: CERT_IN_TRAINING_LABEL,
    className: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    counts: true,
    held: false,
    inTraining: true,
  },
  unknown: {
    label: "Unknown",
    className: "border-zinc-200 bg-zinc-50 text-zinc-500",
    dot: "bg-zinc-300",
    counts: false,
    held: false,
    inTraining: false,
  },
  // Lapsed (v0.6): held before, ran out. Never counts for matching; shown with renewal steps.
  expired: {
    label: "Lapsed",
    className: "border-red-200 bg-red-50 text-red-800",
    dot: "bg-red-500",
    counts: false,
    held: false,
    inTraining: false,
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
  if (certDisplay(status) === "in_training") return <Clock className="size-3.5" aria-hidden />
  if (status === "expired") return <CalendarX className="size-3.5" aria-hidden />
  return <HelpCircle className="size-3.5" aria-hidden />
}

export function CertStatusBadge({
  status,
  label,
  className,
}: {
  status: string
  /** Override the status text (the shop page says "Not held" for unknown). */
  label?: string
  className?: string
}) {
  const meta = certStatusMeta(status)
  return (
    <span className={cn(pill, meta.className, className)}>
      <StatusIcon status={status} />
      {label ?? meta.label}
    </span>
  )
}

/**
 * Short cert name for dense rows ("CGP", "CWB W47.1") as an <abbr> whose title is the plain
 * meaning (docs/ux-simplification.md §2: an acronym never appears without its gloss).
 */
export function CertAbbr({ type, className }: { type: string; className?: string }) {
  const p = certPlain(type)
  return (
    <abbr title={p.tip ? `${p.first}: ${p.tip}` : p.first} data-term={type} className={cn("no-underline", className)}>
      {certShortLabel(type)}
    </abbr>
  )
}

const INLINE_TERMS: { re: RegExp; k: string; plain: string }[] = [
  { re: /CWB W47\.1/, k: "CWB_W47.1", plain: "the Canadian Welding Bureau standard" },
  { re: /\bCGP\b/, k: "CGP", plain: "Controlled Goods" },
  { re: /CPCSC L(?:evel )?1/, k: "CPCSC_L1", plain: "the cyber-security self-check" },
]

/**
 * Engine text (job descriptions such as "structural welding to CWB W47.1") in plain words:
 * each cert acronym becomes "plain label (ACRONYM)" with the acronym in <Term> (§2 rule).
 */
export function TermText({ text }: { text: string }) {
  const out: React.ReactNode[] = []
  let rest = text
  let key = 0
  while (rest) {
    let best: { i: number; len: number; k: string; plain: string } | null = null
    for (const t of INLINE_TERMS) {
      const m = t.re.exec(rest)
      if (m && (best === null || m.index < best.i)) best = { i: m.index, len: m[0].length, k: t.k, plain: t.plain }
    }
    if (!best) {
      out.push(rest)
      break
    }
    const before = rest.slice(0, best.i)
    const glossed = /\(\s*$/.test(before)
    if (before) out.push(before)
    if (!glossed) out.push(`${best.plain} (`)
    out.push(
      <Term key={key++} k={best.k}>
        {rest.slice(best.i, best.i + best.len)}
      </Term>
    )
    if (!glossed) out.push(")")
    rest = rest.slice(best.i + best.len)
  }
  return <>{out}</>
}

const NOTE_GLOSS: [RegExp, string][] = [
  [/\bCWB\b/g, "Canadian Welding Bureau (CWB)"],
  [/\bCGP\b/g, "Controlled Goods (CGP)"],
  [/\bNAICS\b/g, "industry code (NAICS)"],
  [/\bSMEs?\b/g, "small business (SME)"],
  [/\bCPCSC\b/g, "cyber-security self-check (CPCSC)"],
]

/** Free-text notes from public data in plain words: the first acronym use gets its label. */
export function glossNote(text: string): string {
  let out = text
  for (const [re, rep] of NOTE_GLOSS) {
    let done = false
    out = out.replace(re, (m, offset: number, all: string) => {
      if (done || /\(\s*$/.test(all.slice(0, offset))) return m
      done = true
      return rep
    })
  }
  return out
}

/** Plain cert name with its tooltip: "Welding certification (CWB W47.1)" on first use. */
export function CertName({ type, first = true }: { type: string; first?: boolean }) {
  const p = certPlain(type)
  if (!p.tip) return <>{first ? p.first : p.label}</>
  return <Term k={type.startsWith("NADCAP") ? "NADCAP" : type}>{first ? p.first : p.label}</Term>
}

/** Compact cert chip for the network table: name coloured by status. */
export function CertChip({ type, status }: { type: string; status: string }) {
  const meta = certStatusMeta(status)
  return (
    <span
      className={cn(pill, "h-6 px-2", meta.className, !meta.counts && "border-dashed")}
      title={`${certLabel(type)}: ${meta.label}`}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      <CertAbbr type={type} />
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
    <span className={cn(pill, "border-emerald-200 bg-emerald-50 text-emerald-800", className)}>
      <Check className="size-3.5" aria-hidden />
      <Term k="SMB">{ce("shop.chip.smb")}</Term>
    </span>
  ) : (
    <span className={cn(pill, "border-zinc-200 bg-zinc-50 text-zinc-600", className)}>{ce("shop.chip.notSmb")}</span>
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
      title={multiplierPlain(multiplier)}
    >
      {multiplierPlain(multiplier)}
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

function fmtMonth(iso: string | null): string {
  if (!iso) return "date not stated"
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short" })
}

/** Tooltip text for a DND match: source, window, confidence, unverified. */
export function dndTip(h: DndHistory): string {
  return ce("pub.dnd.tip", { confidence: h.confidence })
}

/** One-line public-record summary for a DND match. */
export function dndLine(h: DndHistory): string {
  return ce("pub.dnd.line", {
    contracts: h.contracts,
    s: h.contracts === 1 ? "" : "s",
    value: fmtMoney(h.value_cad, { compact: true }),
    last: fmtMonth(h.last_date),
  })
}

/**
 * "National Defence contract history (public record)" on a real (public) shop with a
 * high- or medium-confidence DND name match. Colour + icon + text; the title carries the source.
 */
export function DndBadge({ history, compact, className }: { history: DndHistory; compact?: boolean; className?: string }) {
  return (
    <span
      data-dnd-badge
      className={cn(
        pill,
        "border-slate-300 bg-slate-50 text-slate-800",
        compact && "h-5 px-2 text-[11px]",
        className
      )}
      title={`${dndLine(history)} ${dndTip(history)}`}
    >
      <Landmark className={compact ? "size-3" : "size-3.5"} aria-hidden />
      {compact ? ce("net.dnd.chip") : ce("pub.dnd.badge")}
    </span>
  )
}
