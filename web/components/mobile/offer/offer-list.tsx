"use client"

import * as React from "react"
import { ShieldCheck } from "lucide-react"
import { useDemo } from "@/lib/data/store"
import { fmtMoney } from "@/lib/format"
import { useShopBundle } from "@/lib/app/shop-bundle"
import { fmtWeekday } from "@/lib/app/today"
import { t } from "@/lib/app/strings"
import { UnreachableNotice } from "@/components/mobile/shell/unreachable-notice"
import { useConnection } from "@/lib/app/connection"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/muster/empty-state"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { OfferListCard } from "./offer-list-card"
import { needsReply, offerState, replyByFrom, routedAtFrom, useNewOfferIds, type OfferView } from "./shared"
import "./strings"

/** /m/shops/[id]/offers: unanswered first (new ones on top), then answered ones, muted. */
export function OfferList({ shopId }: { shopId: string }) {
  const { stage, ready } = useDemo()
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

  const routed = stage === "routed" || stage === "funded"
  if (ready && !routed && unreachable) return <UnreachableNotice className="mt-4" />
  if (ready && !routed) {
    return <EmptyState className="mt-4" title={t("empty.notRouted")} body={t("empty.notRoutedBody")} />
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
  const total = views.reduce((s, v) => s + v.offer.value_cad, 0)
  const hours = views.reduce((s, v) => s + v.offer.hours_week, 0)

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
        <p className="text-base text-muted-foreground">
          {t("o.list.total", { value: fmtMoney(total, { compact: true }), hours })}
        </p>
        <p className="mt-1 flex items-start gap-2 rounded-lg border border-assigned/25 bg-assigned-soft px-3 py-2 text-sm font-medium text-assigned">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("o.list.noBidding")}
        </p>
      </section>

      {open.length ? (
        <ul className="flex flex-col gap-3" aria-label={t("o.list.needReply", { count: open.length })}>
          {open.map((v) => (
            <li key={v.offer.job_id}>
              <OfferListCard shopId={shopId} view={v} replyBy={replyBy} />
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
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

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
