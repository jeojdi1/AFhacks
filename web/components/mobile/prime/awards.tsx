"use client"

// "Awards in progress" for Northgate (desktop /prime panel and a small /m/prime
// section). One row per offer a shop accepted: the job's paperwork progress and
// the kickoff call, read from the shared award module (web/lib/award, owned by
// the shop side). Live mode reads the engine; fixture mode reads the same
// localStorage the shop's award page writes, synced across tabs.
//
// Everything here is a demo: no real e-signature, no real invite. Accepting and
// paperwork never change a number (the ledger already counted the job at routing).

import * as React from "react"
import Link from "next/link"
import { CalendarCheck, CalendarClock, ChevronRight, FileCheck2, FilePen } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { decisionKey, shopInfo, useAppActions } from "@/lib/app/actions-store"
import { isSimulatedRecord } from "@/lib/app/sim-flag"
import { extendStrings, t } from "@/lib/app/strings"
import { shortShopName, withFromPrime } from "@/lib/app/feed"
import { useAward } from "@/lib/award/use-award"
import { awardHref as awardPath, fmtSlot, paperworkCount } from "@/lib/award/summary"
import type { Award } from "@/lib/award/types"
import { ShopLabelBadge } from "@/components/shop/badges"
import { SimulatedChip } from "@/components/mobile/shell/simulation"
import { usePhoneHref } from "@/components/mobile/shell/use-phone-href"
import { Button } from "@/components/ui/button"

extendStrings("en", {
  "award.prime.title": "Awards in progress",
  "award.prime.subtitle": "Accepted jobs: paperwork with the shop and the kickoff call.",
  "award.prime.empty": "No accepted jobs yet. When a shop accepts, its paperwork and kickoff call show here.",
  "award.prime.paperwork": "Paperwork {done} of {total}",
  "award.prime.kickoff": "Kickoff {when}",
  "award.prime.noKickoff": "Kickoff not booked yet",
  "award.prime.status.not_started": "Not started",
  "award.prime.status.in_progress": "In progress",
  "award.prime.status.complete": "Complete",
  "award.prime.loading": "Checking paperwork…",
  "award.prime.view": "View paperwork",
  "award.prime.demo": "Demo: no real signatures, files or calendar invites.",
  "award.prime.showAll": "Show all {count} accepted jobs",
})

export interface AcceptedOffer {
  key: string
  shop_id: string
  shop_name: string
  shop_source: string
  shop_label: string | null
  job_id: string
  simulated: boolean
}

/**
 * Offers the shop accepted (engine/app decisions first, then the store's offer status).
 * Most recent award activity first (paperwork, kickoff, then the accept itself), then by job id.
 */
export function useAcceptedOffers(): AcceptedOffer[] {
  const { assignments, offerStatus } = useDemo()
  const { decisions, events } = useAppActions()
  return React.useMemo(() => {
    const out = new Map<string, AcceptedOffer>()
    const add = (shopId: string, jobId: string, simulated: boolean, name?: string) => {
      const key = decisionKey(shopId, jobId)
      if (out.has(key)) return
      const info = shopInfo(shopId)
      out.set(key, {
        key,
        shop_id: shopId,
        job_id: jobId,
        shop_name: name || info?.name || shopId,
        shop_source: info?.source ?? "synthetic",
        shop_label: info?.label ?? null,
        simulated,
      })
    }
    const nameOf = new Map(assignments.map((a) => [decisionKey(a.shop_id, a.job_id), a.shop_name]))
    for (const d of Object.values(decisions)) {
      if (d.decision === "accepted") add(d.shop_id, d.job_id, isSimulatedRecord(d), nameOf.get(decisionKey(d.shop_id, d.job_id)))
    }
    for (const a of assignments) {
      const key = decisionKey(a.shop_id, a.job_id)
      // A newer app decision (declined, undone) wins over the store's offer status.
      if (decisions[key]) continue
      if (offerStatus[key] === "accepted") add(a.shop_id, a.job_id, false, a.shop_name)
    }
    const recent = new Map<string, number>()
    for (const e of events) {
      if (!e.shop_id || !e.job_id) continue
      const k = e.kind as string
      if (k !== "paperwork_done" && k !== "kickoff_booked" && k !== "offer_accepted") continue
      const key = decisionKey(e.shop_id, e.job_id)
      recent.set(key, Math.max(recent.get(key) ?? 0, e.seq))
    }
    const at = (key: string) => {
      const d = decisions[key]
      return d?.decision === "accepted" ? d.at : ""
    }
    return [...out.values()].sort(
      (x, y) =>
        (recent.get(y.key) ?? 0) - (recent.get(x.key) ?? 0) ||
        at(y.key).localeCompare(at(x.key)) ||
        x.job_id.localeCompare(y.job_id) ||
        x.shop_id.localeCompare(y.shop_id)
    )
  }, [assignments, offerStatus, decisions, events])
}

/** Northgate's read-only view of a shop's award page (?from=prime: no sign or book buttons, back goes to the desk). */
export function primeAwardHref(shopId: string, jobId: string, phone = false): string {
  return withFromPrime(awardPath(shopId, jobId, phone))
}

const STATUS_PILL: Record<Award["status"], string> = {
  not_started: "bg-secondary text-muted-foreground",
  in_progress: "bg-sky-50 text-sky-800",
  complete: "bg-assigned-soft text-assigned",
}

function StatusPill({ status }: { status: Award["status"] }) {
  return (
    <span
      className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-medium", STATUS_PILL[status])}
      data-testid="award-status"
    >
      {t(`award.prime.status.${status}`)}
    </span>
  )
}

function AwardLine({ award }: { award: Award | null }) {
  const { done, total } = award ? paperworkCount(award) : { done: 0, total: 0 }
  const booked = !!award?.call?.booked && !!award.call.slot
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700">
      <span className="inline-flex items-center gap-1.5" data-testid="award-paperwork">
        {award?.status === "complete" ? (
          <FileCheck2 className="size-4 text-assigned" aria-hidden />
        ) : (
          <FilePen className="size-4 text-muted-foreground" aria-hidden />
        )}
        {award ? t("award.prime.paperwork", { done, total }) : t("award.prime.loading")}
      </span>
      {award ? (
        <span className="inline-flex items-center gap-1.5" data-testid="award-kickoff">
          {booked ? (
            <CalendarCheck className="size-4 text-assigned" aria-hidden />
          ) : (
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          )}
          {booked ? t("award.prime.kickoff", { when: fmtSlot(award.call.slot) }) : t("award.prime.noKickoff")}
        </span>
      ) : null}
    </span>
  )
}

function DeskRow({ offer, href }: { offer: AcceptedOffer; href: string }) {
  const { award } = useAward(offer.shop_id, offer.job_id)
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5" data-testid="award-row" data-job={offer.job_id}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-foreground">
          {offer.shop_name} · <span className="whitespace-nowrap">{offer.job_id}</span>
        </span>
        <ShopLabelBadge source={offer.shop_source} label={offer.shop_label} />
        {offer.simulated ? <SimulatedChip /> : null}
        <span className="ml-auto">{award ? <StatusPill status={award.status} /> : null}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AwardLine award={award ?? null} />
        <Link href={href} className="text-sm font-medium text-slate-800 underline underline-offset-4 hover:text-foreground">
          {t("award.prime.view")}
        </Link>
      </div>
    </li>
  )
}

/** Desktop /prime panel body. */
export function AwardsDeskList({ withParams = (h: string) => h }: { withParams?: (href: string) => string }) {
  const offers = useAcceptedOffers()
  if (!offers.length) return <p className="text-sm text-muted-foreground" data-testid="awards-empty">{t("award.prime.empty")}</p>
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2" data-testid="awards-list">
        {offers.map((o) => (
          <DeskRow key={o.key} offer={o} href={withParams(primeAwardHref(o.shop_id, o.job_id))} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t("award.prime.demo")}</p>
    </div>
  )
}

function PhoneRow({ offer }: { offer: AcceptedOffer }) {
  const { award } = useAward(offer.shop_id, offer.job_id)
  const phoneHref = usePhoneHref()
  return (
    <li data-testid="award-row" data-job={offer.job_id}>
      <Link
        href={phoneHref(primeAwardHref(offer.shop_id, offer.job_id, true))}
        aria-label={`${t("award.prime.view")}: ${shortShopName(offer.shop_name)}, ${offer.job_id}`}
        className="flex min-h-16 flex-col gap-1.5 rounded-xl border border-border bg-card p-3 hover:bg-muted/50"
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-base leading-snug font-medium">
            {shortShopName(offer.shop_name)} · <span className="whitespace-nowrap">{offer.job_id}</span>
          </span>
          {award ? <StatusPill status={award.status} /> : null}
        </span>
        <AwardLine award={award ?? null} />
        <span className="flex flex-wrap items-center gap-2">
          <ShopLabelBadge source={offer.shop_source} label={offer.shop_label} />
          {offer.simulated ? <SimulatedChip /> : null}
          <ChevronRight className="ml-auto size-5 text-muted-foreground" aria-hidden />
        </span>
      </Link>
    </li>
  )
}

const PHONE_MAX = 3

/** Small /m/prime block inside "What you can do now" (hidden until a shop accepts something). */
export function AwardsPhoneSection() {
  const offers = useAcceptedOffers()
  const [all, setAll] = React.useState(false)
  if (!offers.length) return null
  const shown = all ? offers : offers.slice(0, PHONE_MAX)
  return (
    <section aria-labelledby="awards-title" className="flex flex-col gap-2" data-testid="awards-section">
      <div>
        <h3 id="awards-title" className="flex items-center gap-2 text-base font-semibold">
          <FilePen className="size-5 text-muted-foreground" aria-hidden />
          {t("award.prime.title")}
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-semibold text-muted-foreground">
            {offers.length}
          </span>
        </h3>
        <p className="text-sm text-muted-foreground">{t("award.prime.subtitle")}</p>
      </div>
      <ul className="flex flex-col gap-2" data-testid="awards-list">
        {shown.map((o) => (
          <PhoneRow key={o.key} offer={o} />
        ))}
      </ul>
      {shown.length < offers.length ? (
        <Button variant="outline" size="touch" className="w-full" onClick={() => setAll(true)}>
          {t("award.prime.showAll", { count: offers.length })}
        </Button>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("award.prime.demo")}</p>
    </section>
  )
}
