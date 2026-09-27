"use client"

import * as React from "react"
import { CalendarPlus, GraduationCap, Hourglass, Inbox, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { buttonVariants } from "@/components/ui/button"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { StatusBadge } from "@/components/muster/status-badge"
import { useAppActions } from "@/lib/app/actions-store"
import { t } from "@/lib/app/strings"
import { addDays, appToday, fmtLongDate, parseAppDate, toISODate } from "@/lib/app/today"
import { shortShopName } from "@/lib/app/copy"
import { buildIcs, icsDataUrl } from "@/lib/app/ics"
import { isFunded, packageJobs, seatDemo, seatStages } from "@/lib/app/readiness"
import { SeatStepper } from "./seat-stepper"
import { TicketPreview } from "./ticket-preview"
import { PathToWork } from "./path-to-work"

function Notice({ icon, title, body }: { icon?: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted p-4">
      {icon ?? <Inbox className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />}
      <div>
        <p className="text-base font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

/**
 * /m/trainee/[packageId]?seat=N: a pseudonymous seat card. No name field
 * exists anywhere; the seat is "Seat 3 of 4 · TP-01".
 */
export function SeatCard({ packageId, seat }: { packageId: string; seat: number }) {
  const { ready, stage, gaps, fundResults, fundedIds, jobs } = useDemo()
  const { fundingRequests, events } = useAppActions()

  const pkg = gaps?.suggestions.find((p) => p.id === packageId) ?? fundResults[packageId]?.package ?? null
  const total = pkg?.trainees ?? null
  const seatNo = total ? Math.min(Math.max(1, seat), total) : Math.max(1, seat)
  const request = fundingRequests[packageId] ?? null
  // Live mode: this tab's demo store doesn't hear a Fund clicked on the laptop, but the
  // polled event log does, so a package_funded event flips an open seat page too.
  const fundedEvent = events.some((e) => e.kind === "package_funded" && e.package_id === packageId)
  const funded = fundedEvent || (pkg ? isFunded(pkg, { fundResults, fundedIds }, null, request) : request?.status === "funded")

  const jobsById = React.useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs])

  // Funding date: the package_funded event if we have one, else today (demo).
  const fundedAt = React.useMemo(() => {
    const e = [...events].reverse().find((x) => x.kind === "package_funded" && x.package_id === packageId)
    return parseAppDate(e?.ts ?? null)
  }, [events, packageId])

  const header = (
    <section className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary">
          <GraduationCap className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl leading-snug font-semibold tracking-tight">
            {total
              ? t("seat.header", { seat: seatNo, total, pkg: packageId })
              : `${t("title.trainee")} · ${packageId}`}
          </h2>
          {pkg ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                {shortShopName(pkg.shop_name)} ({pkg.shop_source === "synthetic" ? "synthetic" : "public data"})
              </span>
              <StatusBadge kind={pkg.shop_source === "public" ? "public" : "synthetic"} />
            </p>
          ) : null}
        </div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        {t("seat.private")}
      </p>
    </section>
  )

  if (!ready) {
    return (
      <div className="flex flex-col gap-3 pt-2" aria-hidden>
        <div className="h-28 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        <div className="h-64 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      </div>
    )
  }

  const routed = stage === "routed" || stage === "funded"
  const eligibility = <p className="text-sm leading-snug text-muted-foreground">{t("seat.eligibility")}</p>

  if (!funded) {
    const unknown = routed && !pkg
    return (
      <div className="flex flex-col gap-5 pt-2">
        {header}
        {unknown ? (
          <Notice title={t("seat.unknownPkg", { pkg: packageId })} body={t("seat.unknownPkgBody")} />
        ) : (
          <Notice
            icon={<Hourglass className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />}
            title={request ? t("seat.notFundedAsked") : t("seat.notFunded")}
            body={t("seat.notFundedBody", { pkg: packageId })}
          />
        )}
        {eligibility}
      </div>
    )
  }

  const base = fundedAt ?? appToday()
  const testDate = addDays(base, seatDemo.test_date_weeks_after_funding * 7)
  const ics = buildIcs({
    uid: `muster-${packageId}-seat-${seatNo}-${toISODate(testDate)}@muster.demo`,
    title: t("seat.icsTitle", { pkg: packageId }),
    description: t("seat.icsBody"),
    date: testDate,
  })
  const { jobs: unlocked, value } = pkg ? packageJobs(pkg, fundResults) : { jobs: [], value: 0 }

  return (
    <div className="flex flex-col gap-5 pt-2">
      {header}

      <section aria-labelledby="stage-title">
        <h3 id="stage-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {t("seat.stage")}
          <AssumptionTag note={seatDemo.note} />
        </h3>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">{t("seat.stageNote")}</p>
        <SeatStepper stages={seatStages} currentId={seatDemo.stage_after_funding} />
      </section>

      {pkg ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("seat.provider")}</p>
          <p className="mt-1 text-base font-medium">{pkg.recipient_example}</p>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("seat.testDate")}
          <AssumptionTag note="Funding date plus 6 weeks; the provider sets the real date" />
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtLongDate(testDate)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("seat.testDateNote")}</p>
        <a
          href={icsDataUrl(ics)}
          download={`muster-${packageId}-test-date.ics`}
          className={cn(buttonVariants({ variant: "outline", size: "touch-lg" }), "mt-3 w-full")}
        >
          <CalendarPlus className="size-5" aria-hidden />
          {t("seat.addToCalendar")}
        </a>
      </section>

      <TicketPreview />

      <PathToWork jobs={unlocked} value={value} jobsById={jobsById} />

      {eligibility}
    </div>
  )
}
