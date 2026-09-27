"use client"

import Link from "next/link"
import { Check, ChevronRight, Lock, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtMoney } from "@/lib/format"
import { extendStrings, t } from "@/lib/app/strings"
import { Button } from "@/components/ui/button"
import { SimulatedChip } from "@/components/mobile/shell/simulation"
import { isSimulatedRecord } from "@/lib/app/sim-flag"
import { DecisionChip, NewChip, ReplyByChip, WillSendChip, needsReply, type OfferView } from "./shared"
import "./strings"

extendStrings("en", {
  "o.list.details": "Details",
  "o.list.acceptAria": "Accept {job}",
  "o.list.declineAria": "Decline {job}",
})

/**
 * One offer in the list: description, total value (largest type), hours per
 * week, reply-by and decision chips. The top of the card opens the offer.
 * Offers still waiting for an answer also show Accept / Decline right on the
 * row (56 px buttons), so a shop can answer without opening each one.
 * Answered offers sit on a muted background.
 */
export function OfferListCard({
  shopId,
  view,
  replyBy,
  busy = false,
  onAccept,
  onDecline,
}: {
  shopId: string
  view: OfferView
  replyBy: Date | null
  busy?: boolean
  onAccept?: () => void
  onDecline?: () => void
}) {
  const { offer, job, state, decision, isNew, pending } = view
  const open = needsReply(state)
  const href = `/m/shops/${encodeURIComponent(shopId)}/offers/${encodeURIComponent(offer.job_id)}`
  const inline = open && (onAccept || onDecline)

  return (
    <div
      data-testid="offer-row"
      data-job={offer.job_id}
      className={cn("overflow-hidden rounded-xl border", open ? "border-border bg-card" : "border-border/70 bg-muted")}
    >
      <Link
        href={href}
        className={cn(
          "group flex min-h-16 items-stretch gap-2 p-4 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
          open ? "hover:bg-muted/60" : "hover:bg-muted/80"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{offer.job_id}</span>
            <span aria-hidden>·</span>
            <span className="truncate">{offer.part_no}</span>
            {job?.controlled ? (
              <span className="inline-flex items-center gap-1 text-controlled">
                <Lock className="size-3.5" aria-hidden />
                {t("o.card.controlled")}
              </span>
            ) : null}
          </div>
          <p className={cn("mt-1 line-clamp-2 text-base leading-snug", open ? "text-foreground" : "text-muted-foreground")}>{offer.description}</p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className={cn("text-2xl leading-none font-semibold tabular-nums", open ? "text-foreground" : "text-muted-foreground")}>
              <span className="sr-only">{t("o.list.valueLabel")}: </span>
              {fmtMoney(offer.value_cad, { compact: true })}
            </span>
            <span className="text-base text-muted-foreground tabular-nums">{t("o.list.hoursWeek", { hours: offer.hours_week })}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <DecisionChip state={state} decision={decision} />
            {decision && isSimulatedRecord(decision) ? <SimulatedChip /> : null}
            {pending ? <WillSendChip /> : null}
            {isNew && open ? <NewChip /> : null}
            {open && replyBy ? <ReplyByChip date={replyBy} /> : null}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-0.5 self-center text-sm font-medium text-muted-foreground">
          {inline ? <span className="hidden min-[380px]:inline">{t("o.list.details")}</span> : null}
          <ChevronRight className="size-5" aria-hidden />
        </span>
      </Link>
      {inline ? (
        <div className="grid grid-cols-2 gap-2 border-t border-border px-4 pt-3 pb-4">
          <Button
            size="touch-lg"
            className="bg-emerald-700 px-2 text-white hover:bg-emerald-800"
            disabled={busy || !onAccept}
            onClick={onAccept}
            aria-label={t("o.list.acceptAria", { job: offer.job_id })}
            data-testid="inline-accept"
          >
            <Check className="size-5" aria-hidden />
            {t("decision.accept")}
          </Button>
          <Button
            size="touch-lg"
            variant="outline"
            className="px-2"
            disabled={busy || !onDecline}
            onClick={onDecline}
            aria-label={t("o.list.declineAria", { job: offer.job_id })}
            data-testid="inline-decline"
          >
            <X className="size-5" aria-hidden />
            {t("decision.decline")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
