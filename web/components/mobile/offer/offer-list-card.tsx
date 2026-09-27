"use client"

import Link from "next/link"
import { ChevronRight, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtMoney } from "@/lib/format"
import { t } from "@/lib/app/strings"
import { DecisionChip, NewChip, ReplyByChip, WillSendChip, needsReply, type OfferView } from "./shared"
import "./strings"

/**
 * One offer in the list: description, total value (largest type), hours per
 * week, reply-by and decision chips. The whole card is the tap target.
 * Answered offers sit on a muted background.
 */
export function OfferListCard({ shopId, view, replyBy }: { shopId: string; view: OfferView; replyBy: Date | null }) {
  const { offer, job, state, decision, isNew, pending } = view
  const open = needsReply(state)
  const href = `/m/shops/${encodeURIComponent(shopId)}/offers/${encodeURIComponent(offer.job_id)}`

  return (
    <Link
      href={href}
      className={cn(
        "group flex min-h-16 items-stretch gap-2 rounded-xl border p-4 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
        open ? "border-border bg-card hover:bg-muted/60" : "border-border/70 bg-muted hover:bg-muted/80"
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
          {pending ? <WillSendChip /> : null}
          {isNew && open ? <NewChip /> : null}
          {open && replyBy ? <ReplyByChip date={replyBy} /> : null}
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 self-center text-muted-foreground" aria-hidden />
    </Link>
  )
}
