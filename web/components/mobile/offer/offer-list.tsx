"use client"

import * as React from "react"
import { toast } from "sonner"
import { Clock, ShieldCheck, Wallet } from "lucide-react"
import { useDemo } from "@/lib/data/store"
import { fmtMoney } from "@/lib/format"
import { useShopBundle } from "@/lib/app/shop-bundle"
import { fmtWeekday } from "@/lib/app/today"
import { extendStrings, t } from "@/lib/app/strings"
import { UnreachableNotice } from "@/components/mobile/shell/unreachable-notice"
import { useConnection } from "@/lib/app/connection"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/muster/empty-state"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import type { ReasonCode } from "@/lib/app/types"
import { OfferListCard } from "./offer-list-card"
import { DeclineSheet } from "./decline-sheet"
import { needsReply, offerState, replyByFrom, routedAtFrom, useNewOfferIds, type OfferView } from "./shared"
import "./strings"
import { useGoToAward } from "@/components/award/use-go-to-award"
import { AwardLink } from "@/components/award/award-link"

/** /m/shops/[id]/offers: unanswered first (new ones on top), then answered ones, muted. */
export function OfferList({ shopId }: { shopId: string }) {
  const { stage, ready, mode } = useDemo()
  const { unreachable } = useConnection()
  const b = useShopBundle(shopId)
  const newIds = useNewOfferIds(b.certs, b.jobsById, b.offers)
  const routedAt = routedAtFrom(b.actions.routedAt, b.actions.events)
  const replyBy = replyByFrom(routedAt)

  const views = React.useMemo<OfferView[]>(() => {
    const vs = b.offers.map((offer, i) => {
      const decision = b.actions.decisions[offer.job_id] ?? null
      return {
        offer,
        job: b.jobsById[offer.job_id] ?? null,
        state: offerState(offer, decision),
        decision,
        isNew: newIds.has(offer.job_id),
        pending: !!decision?.pending,
        i,
      }
    })
    vs.sort((a, z) => {
      const ra = needsReply(a.state) ? 0 : 1
      const rz = needsReply(z.state) ? 0 : 1
      if (ra !== rz) return ra - rz
      if (ra === 0 && a.isNew !== z.isNew) return a.isNew ? -1 : 1
      return a.i - z.i
    })
    return vs
  }, [b.offers, b.actions.decisions, b.jobsById, newIds])

  // Inline answers (Accept / Decline on each row), same flow and toasts as the offer card.
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [declineFor, setDeclineFor] = React.useState<string | null>(null)
  const decide = b.actions.decide
  const prime = b.offers[0]?.prime_name?.split(" ")[0] || "Northgate"

  const goToAward = useGoToAward(true)
  const accept = React.useCallback(
    async (jobId: string) => {
      setBusyId(jobId)
      try {
        const r = await decide(jobId, { decision: "accepted" })
        if (!r || r.pending) return
        toast.success(`${t("o.toast.accepted")} · ${jobId}`, {
          description: t("o.toast.acceptedBody", { prime }),
        })
        goToAward(shopId, jobId)
      } finally {
        setBusyId(null)
      }
    },
    [decide, prime, goToAward, shopId]
  )

  const decline = React.useCallback(
    async (reason: ReasonCode, note: string | null) => {
      const jobId = declineFor
      if (!jobId) return
      setBusyId(jobId)
      try {
        const r = await decide(jobId, { decision: "declined", reason_code: reason, note })
        if (!r) return
        setDeclineFor(null)
        if (r.pending) return
        toast.message(`${t("o.toast.declined", { reason: t(`reason.${reason}`).toLowerCase() })} · ${jobId}`, {
          description: t("o.toast.declinedBody", { prime }),
        })
      } finally {
        setBusyId(null)
      }
    },
    [declineFor, decide, prime]
  )

  const routed = stage === "routed" || stage === "funded"
  if (ready && !routed && unreachable) return <UnreachableNotice className="mt-4" />
  if (ready && !routed) {
    return <EmptyState className="mt-4" title={t("empty.notRouted")} body={t(mode === "fixtures" ? "empty.notRoutedBodyFixtures" : "empty.notRoutedBody")} />
  }
  if (b.loading && !b.detail) return <ListSkeleton />
  if (b.error && !b.detail) {
    return (
      <EmptyState
        className="mt-4"
        title={t("o.list.error")}
        body={b.error}
        action={
          <Button size="touch" onClick={() => void b.refresh()}>
            {t("o.list.retry")}
          </Button>
        }
      />
    )
  }
  if (!views.length) return <EmptyState className="mt-4" title={t("o.list.none")} body={t("o.list.noneBody")} />

  const open = views.filter((v) => needsReply(v.state))
  const answered = views.filter((v) => !needsReply(v.state))
  // Declined offers are no longer on the table: leave them out of the value (matches the desk).
  const live = views.filter((v) => v.state !== "declined")
  const total = live.reduce((s, v) => s + v.offer.value_cad, 0)
  // Hours only for offers still waiting for an answer: accepted work is already booked.
  const hours = open.reduce((s, v) => s + v.offer.hours_week, 0)

  return (
    <div className="flex flex-col gap-4 pt-2">
      <section aria-labelledby="offers-summary" className="flex flex-col gap-1.5">
        <h2 id="offers-summary" className="text-xl leading-tight font-semibold">
          {open.length ? t("o.list.needReply", { count: open.length }) : t("o.list.allAnswered")}
        </h2>
        {open.length && replyBy ? (
          <p className="flex flex-wrap items-center gap-1.5 text-base text-muted-foreground">
            {t("o.list.soonest", { date: fmtWeekday(replyBy) })}
            <AssumptionTag note={t("o.replyBy.assumption")} />
          </p>
        ) : null}
        <p className="sr-only">
          {open.length
            ? t("o.list.total", { value: fmtMoney(total, { compact: true }), hours })
            : t("o.list.totalNoneOpen", { value: fmtMoney(total, { compact: true }) })}
        </p>
        <div aria-hidden className="mt-1 grid grid-cols-2 gap-2">
          <span className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Wallet className="size-5" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-xl leading-tight font-bold tabular-nums">{fmtMoney(total, { compact: true })}</span>
              <span className="text-[13px] leading-tight text-muted-foreground">{t("o.list.bigValue")}</span>
            </span>
          </span>
          <span className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Clock className="size-5" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-xl leading-tight font-bold tabular-nums">{open.length ? hours : 0}</span>
              <span className="text-[13px] leading-tight text-muted-foreground">{t("o.list.bigHours")}</span>
            </span>
          </span>
        </div>
        <p className="mt-1 flex items-start gap-2 rounded-lg border border-assigned/25 bg-assigned-soft px-3 py-2 text-sm font-medium text-assigned">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("o.list.noBidding")}
        </p>
      </section>

      {open.length ? (
        <ul className="flex flex-col gap-3" aria-label={t("o.list.needReply", { count: open.length })}>
          {open.map((v) => (
            <li key={v.offer.job_id}>
              <OfferListCard
                shopId={shopId}
                view={v}
                replyBy={replyBy}
                busy={busyId === v.offer.job_id}
                onAccept={() => void accept(v.offer.job_id)}
                onDecline={() => setDeclineFor(v.offer.job_id)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {answered.length ? (
        <section aria-labelledby="offers-answered" className="flex flex-col gap-3">
          <h2 id="offers-answered" className="pt-2 text-base font-semibold text-muted-foreground">
            {t("o.list.answered")} · {answered.length}
          </h2>
          <ul className="flex flex-col gap-3">
            {answered.map((v) => (
              <li key={v.offer.job_id}>
                <OfferListCard shopId={shopId} view={v} replyBy={replyBy} />
                {v.state === "accepted" ? <AwardLink shopId={shopId} jobId={v.offer.job_id} phone className="mt-1 px-1" /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <DeclineSheet
        open={declineFor !== null}
        onOpenChange={(o) => {
          if (!o) setDeclineFor(null)
        }}
        jobId={declineFor ?? ""}
        primeName={prime}
        busy={busyId !== null}
        onSubmit={(reason, note) => void decline(reason, note)}
      />
    </div>
  )
}

extendStrings("en", {
  "o.list.bigValue": "of work offered",
  "o.list.bigHours": "hrs/wk still open",
})

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 pt-2" aria-busy="true" aria-label={t("empty.loading")}>
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-36 w-full rounded-xl" />
    </div>
  )
}
