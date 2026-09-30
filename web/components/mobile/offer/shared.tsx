"use client"

// Small pieces shared by the offer list and the offer card (T3).

import * as React from "react"
import { ArrowLeftRight, Check, CircleHelp, Clock, CloudUpload, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { addBusinessDays, fmtDateTime, fmtWeekday } from "@/lib/app/today"
import { t } from "@/lib/app/strings"
import { counterTermsText } from "@/lib/app/sizing"
import type { AppEvent, CertWithDates, Job, Offer, OfferDecisionRec } from "@/lib/app/types"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import "./strings"

/** Business days a shop has to reply (assumption: set by the prime). */
export const REPLY_BUSINESS_DAYS = 5

/** "counter": the shop sent a counter-offer (docs/api.md §9); Northgate may have answered it. */
export type OfferState = "open" | "question" | "counter" | "accepted" | "declined"

export interface OfferView {
  offer: Offer
  job: Job | null
  state: OfferState
  decision: OfferDecisionRec | null
  isNew: boolean
  pending: boolean
}

/** Where an offer stands for the shop: its stored decision first, then the engine/overlay status. */
export function offerState(offer: Offer, decision: OfferDecisionRec | null | undefined): OfferState {
  if (decision) {
    if (decision.decision === "accepted" || decision.decision === "declined") return decision.decision
    if (decision.decision === "question") return "question"
    if (decision.decision === "counter") return "counter"
  }
  return offer.status === "accepted" || offer.status === "declined" ? offer.status : "open"
}

/** Still open: no answer yet, a question, or a counter-offer (the original offer stands). */
export const needsReply = (s: OfferState) => s === "open" || s === "question" || s === "counter"

/** When the program was routed: the actions store, else the latest routed event. */
export function routedAtFrom(routedAt: string | null, events: AppEvent[]): string | null {
  if (routedAt) return routedAt
  for (let i = events.length - 1; i >= 0; i--) if (events[i].kind === "routed") return events[i].ts
  return null
}

/** reply_by = routedAt + 5 business days (assumption), or null before routing is known. */
export function replyByFrom(routedAt: string | null): Date | null {
  return routedAt ? addBusinessDays(routedAt, REPLY_BUSINESS_DAYS) : null
}

/**
 * Offers that arrived after Northgate funded training at this shop: the job
 * needs a certification the shop holds as pending_training, or it is in a
 * fund response's unblocked jobs.
 */
export function useNewOfferIds(certs: CertWithDates[], jobsById: Record<string, Job>, offers: Offer[]): Set<string> {
  const { fundResults } = useDemo()
  return React.useMemo(() => {
    const out = new Set<string>()
    for (const r of Object.values(fundResults ?? {})) for (const a of r.unblocked_jobs ?? []) out.add(a.job_id)
    const pending = new Set(certs.filter((c) => c.status === "pending_training").map((c) => c.type as string))
    if (pending.size) {
      for (const o of offers) {
        const j = jobsById[o.job_id]
        if (j?.required_certs?.some((c) => pending.has(c))) out.add(o.job_id)
      }
    }
    return out
  }, [fundResults, certs, jobsById, offers])
}

// ---------------------------------------------------------------------------
// Chips (colour + icon + text, never colour alone)

const chipBase = "inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-medium whitespace-nowrap"

export function ReplyByChip({ date, withTag = false, className }: { date: Date; withTag?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn(chipBase, "border-border bg-background text-foreground")}>
        <Clock className="size-3.5" aria-hidden />
        {t("o.chip.replyBy", { date: fmtWeekday(date) })}
      </span>
      {withTag ? <AssumptionTag note={t("o.replyBy.assumption")} /> : null}
    </span>
  )
}

export function NewChip({ className }: { className?: string }) {
  return (
    <span className={cn(chipBase, "border-funded/30 bg-funded-soft text-funded", className)} title={t("o.chip.newTitle")}>
      <Sparkles className="size-3.5" aria-hidden />
      {t("o.chip.new")}
    </span>
  )
}

export function WillSendChip({ className }: { className?: string }) {
  return (
    <span className={cn(chipBase, "border-amber-300 bg-amber-50 text-amber-800", className)}>
      <CloudUpload className="size-3.5" aria-hidden />
      {t("o.chip.willSend")}
    </span>
  )
}

export function reasonText(d: OfferDecisionRec | null | undefined): string | null {
  return d?.reason_code ? t(`reason.${d.reason_code}`) : null
}

export function questionText(d: OfferDecisionRec | null | undefined): string | null {
  return d?.question_code ? t(`question.${d.question_code}`) : null
}

/** Status chip for an offer: Awaiting reply / Accepted / Declined / Question sent. */
export function DecisionChip({ state, decision, className }: { state: OfferState; decision?: OfferDecisionRec | null; className?: string }) {
  if (state === "accepted")
    return (
      <span className={cn(chipBase, "border-assigned/25 bg-assigned-soft text-assigned", className)}>
        <Check className="size-3.5" aria-hidden />
        {t("offer.status.accepted")}
      </span>
    )
  if (state === "declined") {
    const r = reasonText(decision)
    return (
      <span className={cn(chipBase, "border-blocked/30 bg-blocked-soft text-blocked", className)}>
        <X className="size-3.5" aria-hidden />
        {r ? t("decision.declinedWith", { reason: r.toLowerCase() }) : t("offer.status.declined")}
      </span>
    )
  }
  if (state === "question")
    return (
      <span className={cn(chipBase, "border-controlled/25 bg-controlled-soft text-controlled", className)}>
        <CircleHelp className="size-3.5" aria-hidden />
        {t("offer.status.question")}
      </span>
    )
  if (state === "counter")
    return (
      <span className={cn(chipBase, "border-violet-300 bg-violet-50 text-violet-900", className)} data-testid="counter-chip">
        <ArrowLeftRight className="size-3.5" aria-hidden />
        {decision?.counter?.response?.response === "declined" ? t("o.counter.chipKept") : t("offer.status.counter")}
      </span>
    )
  return (
    <span className={cn(chipBase, "border-brand/30 bg-background text-brand", className)}>
      <span aria-hidden className="size-2 rounded-full bg-brand" />
      {t("offer.status.offered")}
    </span>
  )
}

/**
 * "Accepted Sep 26, 9:41 PM" / "Declined: No capacity" / "Question sent: Lead time".
 * A simulated decision (the demo simulator answered for this shop) says so:
 * "Accepted by the demo simulator Sep 26, 9:41 PM".
 */
export function decisionLine(state: OfferState, d: OfferDecisionRec | null | undefined, simulated = false): string {
  const sim = simulated ? "Sim" : ""
  if (state === "accepted") return d?.at ? t(`o.status.accepted${sim}`, { date: fmtDateTime(d.at) }) : t(`o.status.acceptedNoDate${sim}`)
  if (state === "declined") {
    const r = reasonText(d)
    return r ? t(`o.status.declined${sim}`, { reason: r }) : t(`o.status.declinedNoReason${sim}`)
  }
  if (state === "question") return t(`o.status.question${sim}`, { question: questionText(d) ?? "" })
  if (state === "counter") {
    const terms = counterTermsText(d?.counter)
    return d?.counter?.response?.response === "declined" ? t("o.status.counterKept", { terms }) : t("o.status.counter", { terms })
  }
  return t("offer.status.offered")
}
