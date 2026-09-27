"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRight, Gauge, Inbox, Sprout } from "lucide-react"
import { useDemo } from "@/lib/data/store"
import { fmtMoney } from "@/lib/format"
import { useShopBundle } from "@/lib/app/shop-bundle"
import { t } from "@/lib/app/strings"
import { UnreachableNotice } from "@/components/mobile/shell/unreachable-notice"
import { useConnection } from "@/lib/app/connection"
import { fmtDay } from "@/lib/app/today"
import { growTitle } from "@/lib/app/copy"
import { buildGrowItems, growHref } from "@/lib/app/readiness"
import { CapacitySheet } from "@/components/mobile/today/capacity-sheet"
import { FundingChip, TierChip } from "./grow-chips"

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted p-4">
      <Inbox className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div>
        <p className="text-base font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

/** /m/shops/[id]/grow: readiness items, each with a tier chip, plus the capacity check-in row. */
export function GrowList({ shopId }: { shopId: string }) {
  const { stage, gaps, fundResults, fundedIds, ready } = useDemo()
  const { unreachable } = useConnection()
  const bundle = useShopBundle(shopId)
  const { detail, actions } = bundle
  const routed = stage === "routed" || stage === "funded"

  const items = React.useMemo(
    () =>
      buildGrowItems({
        shopId,
        detail,
        gaps,
        fundResults,
        fundedIds,
        fundingRequests: actions.fundingRequests,
      }),
    [shopId, detail, gaps, fundResults, fundedIds, actions.fundingRequests]
  )

  const cap = actions.capacity
  const [capOpen, setCapOpen] = React.useState(false)

  return (
    <div className="flex flex-col gap-5 pt-2">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t("grow.title")}</h2>
        <p className="mt-1 text-base text-muted-foreground">{t("grow.subtitle")}</p>
      </div>

      {!ready || (bundle.loading && !detail) ? (
        <div className="flex flex-col gap-3" aria-hidden>
          <div className="h-24 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
          <div className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        </div>
      ) : !routed && unreachable ? (
        <UnreachableNotice />
      ) : !routed ? (
        <Notice title={t("ready.notRouted")} body={t("ready.notRoutedBody")} />
      ) : items.length === 0 ? (
        <Notice title={t("grow.empty")} body={t("grow.emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((it) => (
            <li key={it.requirement}>
              <Link
                href={growHref(shopId, it.requirement)}
                className="flex min-h-20 items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xs outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
                  <Sprout className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base leading-snug font-semibold">
                    {growTitle(it.requirement, it.kind)}
                  </span>
                  {it.jobs.length ? (
                    <span className="mt-0.5 block text-sm text-muted-foreground tabular-nums">
                      {t("grow.itemJobs", { count: it.jobs.length, value: fmtMoney(it.value_cad, { compact: true }) })}
                    </span>
                  ) : null}
                  <span className="mt-2 flex flex-wrap items-center gap-1.5">
                    <TierChip tier={it.tier} />
                    {it.funding === "requested" ? <FundingChip item={it} /> : null}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {ready && routed ? (
        <button
          type="button"
          onClick={() => setCapOpen(true)}
          className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
        >
          <Gauge className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-medium">{t("grow.capacityRow")}</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              {cap
                ? t("grow.capacityRowDone", { date: fmtDay(cap.confirmed_at), hours: cap.hours_week })
                : t("grow.capacityRowBody")}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      ) : null}
      {/* T7 sheet (Agent T), opened from the Grow tab row */}
      <CapacitySheet shopId={shopId} open={capOpen} onOpenChange={setCapOpen} shop={bundle.shop} />
    </div>
  )
}
