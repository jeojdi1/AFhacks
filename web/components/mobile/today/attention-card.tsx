"use client"

import type * as React from "react"
import Link from "next/link"
import {
  ChevronRight,
  CircleAlert,
  Clock,
  GraduationCap,
  Inbox,
  MessageSquareReply,
  OctagonAlert,
  ShieldAlert,
  Sprout,
  TriangleAlert,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { t } from "@/lib/app/strings"
import type { TodayItem } from "@/lib/app/attention"
import type { AttentionKind, AttentionTone, RenewalStage } from "@/lib/app/types"
import { SeatDots, WelderArt } from "@/components/mobile/art/process-art"

const KIND_ICON: Record<AttentionKind, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  offers: Inbox,
  reply: MessageSquareReply,
  renewal: ShieldAlert,
  capacity: Clock,
  readiness: Sprout,
  training: GraduationCap,
}

const TONE: Record<AttentionTone, { bar: string; icon: string; big: string }> = {
  action: { bar: "bg-slate-700", icon: "bg-slate-100 text-slate-700", big: "text-foreground" },
  warn: { bar: "bg-amber-500", icon: "bg-amber-100 text-amber-800", big: "text-amber-800" },
  danger: { bar: "bg-blocked", icon: "bg-blocked-soft text-blocked", big: "text-blocked" },
  info: { bar: "bg-funded", icon: "bg-funded-soft text-funded", big: "text-foreground" },
}

const STAGE_CHIP: Partial<Record<RenewalStage, { className: string; Icon: typeof TriangleAlert }>> = {
  lapsed: { className: "border-blocked/30 bg-blocked-soft text-blocked", Icon: OctagonAlert },
  urgent: { className: "border-blocked/30 bg-blocked-soft text-blocked", Icon: TriangleAlert },
  window_open: { className: "border-amber-300 bg-amber-50 text-amber-800", Icon: CircleAlert },
}

/** Renewal stage chip: colour + icon + text. */
function StageChip({ stage }: { stage: RenewalStage }) {
  const s = STAGE_CHIP[stage]
  if (!s) return null
  const { Icon } = s
  return (
    <span className={cn("inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-sm font-semibold", s.className)}>
      <Icon className="size-3.5" aria-hidden />
      {t(`stage.${stage}`)}
    </span>
  )
}

/**
 * Non-interactive assumption pill (the card itself is the tap target, so the
 * hover-tooltip AssumptionTag can't nest inside it). The note is in `title`
 * and read out to screen readers.
 */
function InlineTag({ text, note }: { text: string; note: string }) {
  return (
    <span
      title={note}
      className="inline-flex h-5 items-center rounded-full border border-dashed border-slate-400 px-2 text-[13px] font-medium tracking-wide text-slate-600 lowercase"
    >
      {text}
      <span className="sr-only">: {note}</span>
    </span>
  )
}

/**
 * One Today card: a whole-card tap target (≥ 64 px), one big number, one verb
 * and a chevron. Renders a <Link> to item.href, or a <button> when onSelect is
 * given (the capacity card opens its sheet in place).
 */
export function AttentionCard({ item, onSelect, className }: { item: TodayItem; onSelect?: () => void; className?: string }) {
  const tone = TONE[item.tone]
  const Icon = KIND_ICON[item.kind]
  const body = (
    <>
      <span aria-hidden className={cn("absolute inset-y-3 left-0 w-1 rounded-r-full", tone.bar)} />
      <span className="flex w-[72px] shrink-0 flex-col items-center gap-1 text-center">
        {item.kind === "training" ? (
          <WelderArt />
        ) : (
          <span className={cn("flex size-12 items-center justify-center rounded-full", tone.icon)}>
            <Icon className="size-6" aria-hidden />
          </span>
        )}
        <span className={cn("text-[28px] leading-none font-bold tabular-nums tracking-tight", tone.big)}>{item.big}</span>
        <span className="text-[13px] leading-tight text-muted-foreground">{item.big_label}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {item.stage || item.basis ? (
          <span className="flex flex-wrap items-center gap-1.5">
            {item.stage ? <StageChip stage={item.stage} /> : null}
            {item.basis === "illustrative" ? <InlineTag text={t("label.illustrative")} note="Synthetic shop: the date is illustrative" /> : null}
            {item.basis === "shop-declared" ? <InlineTag text={t("label.shopDeclared")} note="Entered by the shop; not verified" /> : null}
          </span>
        ) : null}
        <span className="text-base leading-snug font-semibold text-foreground" title={item.detail}>
          {item.title}
        </span>
        {item.kind === "training" ? <SeatDots count={Number(item.big) || 0} className="mt-0.5" /> : null}
        <span className="sr-only">{item.detail}</span>
        {item.assumption ? (
          <span>
            <InlineTag text={t("label.assumption")} note={item.assumption} />
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 self-center text-base font-semibold text-brand">
        {item.verb}
        <ChevronRight className="size-5" aria-hidden />
      </span>
    </>
  )
  const cls = cn(
    "relative flex min-h-[72px] w-full items-start gap-3 overflow-hidden rounded-xl border border-border bg-card py-3 pr-2 pl-3 text-left shadow-xs outline-none transition-colors",
    "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted motion-reduce:transition-none",
    className
  )
  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={cls} data-kind={item.kind} aria-haspopup="dialog">
        {body}
      </button>
    )
  }
  return (
    <Link href={item.href} className={cls} data-kind={item.kind}>
      {body}
    </Link>
  )
}
