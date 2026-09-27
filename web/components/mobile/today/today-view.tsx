"use client"

// Shop "Today" home (docs/app-spec.md §2.2, T2). Owner: Agent T.
// One column of attention cards in a fixed order, then 3 compact stats.

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowRight, CircleCheck, Inbox, RotateCw } from "lucide-react"
import { fmtMoney } from "@/lib/format"
import { useDemo } from "@/lib/data/store"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { EmptyState } from "@/components/muster/empty-state"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ShopLabelChip } from "@/components/mobile/shell/m-header"
import { UnreachableNotice } from "@/components/mobile/shell/unreachable-notice"
import { useShopBundle } from "@/lib/app/shop-bundle"
import { useConnection } from "@/lib/app/connection"
import { renewalFor } from "@/lib/app/renewals"
import { buildAttention, nextCheckinDate, openOffers, todayStats, type TodayItem } from "@/lib/app/attention"
import { extendStrings, t } from "@/lib/app/strings"
import { replyForDecision, usePrimeReplies } from "@/lib/app/prime-replies"
import { appToday, fmtWeekday } from "@/lib/app/today"
import type { Assignment, Renewal } from "@/lib/app/types"
import { AttentionCard } from "./attention-card"
import { CapacitySheet } from "./capacity-sheet"

extendStrings("en", {
  "today.heading": "What needs you",
  "today.clearNext": "You're clear. Next check-in {day}.",
  "today.clearBody": "New offers, renewals and training updates will show up here.",
  "today.stats": "At a glance",
  "today.stat.offers": "offered work",
  "today.stat.offers.detail": "{count} offers",
  "today.stat.offers.detail_one": "1 offer",
  "today.stat.hours": "hrs/wk accepted",
  "today.stat.hoursOf": "of {capacity} on your profile",
  "today.stat.hoursOfTraining": "of {capacity} on your profile, incl. {training} from training",
  "today.stat.hoursConfirmed": "{free} free confirmed",
  "today.stat.hours.note": "Weekly hours per job are demo estimates of production load",
  "today.stat.certs": "certificates in place",
  "today.stat.certs.detail": "of {total} tracked",
  "today.stat.certs.detailTraining": "of {total} tracked · {training} in training",
  "today.hero.kicker": "From Northgate, a defence company",
  "today.hero.title": "{count} offers waiting for your answer",
  "today.hero.title_one": "1 offer waiting for your answer",
  "today.hero.body": "{value} of work · no bidding, each offer went only to you",
  "today.hero.cta": "Review offers",
  "today.error": "Couldn't load this shop",
  "today.retry": "Try again",
})

const CHECKIN_HASH = "#checkin"

function Skeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[88px] animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      ))}
    </div>
  )
}

function Stat({ value, label, detail, tag }: { value: string; label: string; detail?: string; tag?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-card p-3">
      <span className="text-xl leading-tight font-bold tabular-nums tracking-tight">{value}</span>
      <span className="text-sm leading-snug text-muted-foreground">{label}</span>
      {detail ? <span className="text-sm leading-snug text-muted-foreground">{detail}</span> : null}
      {tag ? <span className="mt-1">{tag}</span> : null}
    </div>
  )
}

/** Today home for one shop: /m/shops/[id]. */
export function TodayView({ shopId }: { shopId: string }) {
  const bundle = useShopBundle(shopId)
  const { stage, fundResults, mode } = useDemo()
  const pathname = usePathname()
  const conn = useConnection()
  const [sheetOpen, setSheetOpen] = React.useState(false)

  const { detail, offers, assignments, jobsById, certs, actions, updatedAt } = bundle

  // "#checkin" opens the capacity sheet (deep link from other screens).
  React.useEffect(() => {
    const check = () => {
      if (window.location.hash === CHECKIN_HASH) setSheetOpen(true)
    }
    queueMicrotask(check)
    window.addEventListener("hashchange", check)
    return () => window.removeEventListener("hashchange", check)
  }, [])

  const onSheetChange = React.useCallback(
    (open: boolean) => {
      setSheetOpen(open)
      if (!open) {
        try {
          if (window.location.hash === CHECKIN_HASH) window.history.replaceState(window.history.state, "", pathname)
        } catch {
          /* no history access */
        }
      }
    },
    [pathname]
  )

  // Recompute "today" with each load, so an open tab rolls over at midnight.
  const today = React.useMemo(() => {
    void updatedAt
    return appToday()
  }, [updatedAt])

  const renewals = React.useMemo<Renewal[]>(() => {
    if (!detail) return []
    // Apply the shop's own decisions so a declined job is not "at risk".
    const statusById: Record<string, Assignment["status"]> = {}
    for (const o of offers) statusById[o.job_id] = o.status
    const mine = assignments.map((a) => (statusById[a.job_id] && statusById[a.job_id] !== a.status ? { ...a, status: statusById[a.job_id] } : a))
    return certs.map((c) => renewalFor(c, { today, shopId, jobsById, assignments: mine }))
  }, [detail, offers, assignments, certs, jobsById, shopId, today])

  // Offers unblocked by a funded package arrive when it was funded, not at routing.
  const offeredAt = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (const e of actions.events) {
      if (e.kind !== "package_funded" || !e.package_id) continue
      for (const j of fundResults[e.package_id]?.unblocked_jobs ?? []) m[j.job_id] = e.ts
    }
    return m
  }, [actions.events, fundResults])

  // Northgate's replies to this shop's open questions (engine decision.reply, or recorded on this device).
  const localReplies = usePrimeReplies()
  const replies = React.useMemo(() => {
    const m: Record<string, { text: string; at: string }> = {}
    for (const d of Object.values(actions.decisions)) {
      const r = replyForDecision(d, localReplies)
      if (r) m[d.job_id] = { text: r.text, at: r.at }
    }
    return m
  }, [actions.decisions, localReplies])
  const prime = offers[0]?.prime_name?.split(" ")[0] || "Northgate"

  const items = React.useMemo<TodayItem[]>(
    () => buildAttention(bundle, renewals, today, { offeredAt, replies, prime }),
    // bundle is a fresh object each render; list the fields buildAttention reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detail, offers, actions, assignments, renewals, today, offeredAt, replies, prime]
  )

  const stats = React.useMemo(
    () => todayStats(bundle),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offers, bundle.shop, certs, actions.capacity]
  )

  const routed = stage === "routed" || stage === "funded" || (detail?.offers.length ?? 0) > 0
  const open = routed ? openOffers(bundle) : []
  const replyCount = open.length
  const openValue = open.reduce((sum, o) => sum + o.value_cad, 0)
  const alertCount = replyCount + items.filter((i) => i.kind === "renewal").length

  // Installed app: badge the icon with what needs a reply (feature-checked).
  React.useEffect(() => {
    if (!detail) return
    try {
      const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
      if (!nav.setAppBadge || !window.matchMedia("(display-mode: standalone)").matches) return
      void (alertCount ? nav.setAppBadge(alertCount) : nav.clearAppBadge?.())?.catch(() => {})
    } catch {
      /* Badging API unavailable */
    }
  }, [detail, alertCount])

  if (!detail && bundle.error) {
    return (
      <div className="flex flex-col gap-4 pt-2">
        <EmptyState
          className="py-8"
          title={t("today.error")}
          body={bundle.error}
          action={
            <Button size="touch" onClick={() => void bundle.refresh()}>
              <RotateCw aria-hidden />
              {t("today.retry")}
            </Button>
          }
        />
      </div>
    )
  }

  const shop = detail?.shop ?? null
  // Live mode and Muster can't be reached: never pass an empty fallback off as
  // "Northgate hasn't sent offers yet" (and hide the action cards and $0 stats).
  const unreachable = conn.unreachable || (conn.live && !!bundle.error)
  const blind = unreachable && !routed
  const clear = routed && items.length === 0 && !blind
  // The hero card above replaces the "offers need a reply" attention card.
  const cards = replyCount > 0 ? items.filter((it) => it.kind !== "offers") : items

  return (
    <div className="flex flex-col gap-4 pt-1" data-testid="today-view">
      {shop ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="min-w-0 truncate text-lg leading-tight font-semibold">{shop.name}</h2>
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            {shop.city}
            <ShopLabelChip source={shop.source} />
          </span>
        </div>
      ) : null}

      <section aria-label={t("today.heading")} className="flex flex-col gap-3">
        {unreachable ? <UnreachableNotice stale={!blind} /> : null}
        {blind ? null : !detail ? (
          <Skeleton />
        ) : (
          <>
            {!routed ? (
              <EmptyState className="py-6" icon={<Inbox className="size-5" aria-hidden />} title={t("empty.notRouted")} body={t(mode === "fixtures" ? "empty.notRoutedBodyFixtures" : "empty.notRoutedBody")} />
            ) : null}
            {replyCount > 0 ? (
              <div className="flex flex-col gap-3 rounded-2xl border-2 border-brand/40 bg-brand/5 p-4" data-testid="offers-hero">
                <div>
                  <p className="text-sm font-semibold text-brand">{t("today.hero.kicker")}</p>
                  <h2 className="mt-0.5 text-xl leading-tight font-bold">{t("today.hero.title", { count: replyCount })}</h2>
                  <p className="mt-1 text-base leading-snug text-muted-foreground">
                    {t("today.hero.body", { value: fmtMoney(openValue, { compact: true }) })}
                  </p>
                </div>
                <Link href={`/m/shops/${encodeURIComponent(shopId)}/offers`} className={cn(buttonVariants({ size: "touch-lg" }), "w-full")}>
                  {t("today.hero.cta")}
                  <ArrowRight className="size-5" aria-hidden />
                </Link>
              </div>
            ) : null}
            {cards.length ? (
              <ul className="flex flex-col gap-3">
                {cards.map((it) => (
                  <li key={`${it.kind}:${it.ref_id ?? ""}`}>
                    <AttentionCard item={it} onSelect={it.kind === "capacity" && it.href.endsWith(CHECKIN_HASH) ? () => onSheetChange(true) : undefined} />
                  </li>
                ))}
              </ul>
            ) : null}
            {clear ? (
              <div role="status" className="flex items-start gap-3 rounded-xl border border-assigned/25 bg-assigned-soft p-4 text-assigned">
                <CircleCheck className="mt-0.5 size-6 shrink-0" aria-hidden />
                <div>
                  <p className="text-base font-semibold">{t("today.clearNext", { day: fmtWeekday(nextCheckinDate(actions.capacity, today)) })}</p>
                  <p className="mt-0.5 text-sm text-foreground/80">{t("today.clearBody")}</p>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      {detail && !blind ? (
        <section aria-label={t("today.stats")} className="grid grid-cols-3 gap-2">
          <Stat
            value={fmtMoney(stats.offers_value_cad, { compact: true })}
            label={t("today.stat.offers")}
            detail={t("today.stat.offers.detail", { count: stats.offers_count })}
          />
          <Stat
            value={`${stats.accepted_hours}`}
            label={t("today.stat.hours")}
            detail={
              stats.confirmed_free_hours !== null
                ? t("today.stat.hoursConfirmed", { free: stats.confirmed_free_hours })
                : stats.training_hours > 0
                  ? t("today.stat.hoursOfTraining", { capacity: stats.capacity_hours, training: stats.training_hours })
                  : t("today.stat.hoursOf", { capacity: stats.capacity_hours })
            }
            tag={<AssumptionTag note={t("today.stat.hours.note")} />}
          />
          <Stat
            value={`${stats.certs_in_place}`}
            label={t("today.stat.certs")}
            detail={
              stats.certs_in_training > 0
                ? t("today.stat.certs.detailTraining", { total: stats.certs_total, training: stats.certs_in_training })
                : t("today.stat.certs.detail", { total: stats.certs_total })
            }
          />
        </section>
      ) : null}

      <CapacitySheet
        shopId={shopId}
        shop={shop}
        acceptedHours={stats.accepted_hours}
        open={sheetOpen}
        onOpenChange={onSheetChange}
      />
    </div>
  )
}
