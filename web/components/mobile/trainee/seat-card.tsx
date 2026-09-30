"use client"

import * as React from "react"
import Link from "next/link"
import { CalendarDays, CalendarPlus, GraduationCap, Hourglass, Inbox, Lock, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { buttonVariants } from "@/components/ui/button"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { StatusBadge } from "@/components/muster/status-badge"
import { useAppActions } from "@/lib/app/actions-store"
import { t } from "@/lib/app/strings"
import { addDays, appToday, fmtLongDate, parseAppDate, toISODate } from "@/lib/app/today"
import { otherTrade, seatIcsTitle, shortShopName } from "@/lib/app/copy"
import { buildIcs, icsDataUrl } from "@/lib/app/ics"
import { isFunded, packageJobs, seatDemo, seatStagesFor } from "@/lib/app/readiness"
import { SeatStepper } from "./seat-stepper"
import { TicketPreview } from "./ticket-preview"
import { PathToWork } from "./path-to-work"
import { InfoTip, TradeHeroArt, WelderArt } from "./seat-art"

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
export function SeatCard({ packageId, seat }: { packageId: string; seat: number | null }) {
  const { ready, stage, gaps, fundResults, fundedIds, jobs } = useDemo()
  const { fundingRequests, events } = useAppActions()

  const pkg = gaps?.suggestions.find((p) => p.id === packageId) ?? fundResults[packageId]?.package ?? null
  // Every trade, not just welders: a non-welding package (electronics, harness, CNC, coatings)
  // shows its own picture, certificate and stages; welding and unknown packages stay as they were.
  const trade = otherTrade(pkg)
  const total = pkg?.trainees ?? null
  // Never clamp: ?seat=9 on a 4-seat plan is a seat that does not exist (the API 404s it too).
  const badSeat = seat === null || (total !== null && seat > total)
  const seatNo = seat ?? 1
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
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="flex justify-center bg-brand/5 px-4 pt-3">
        {trade ? (
          <TradeHeroArt processes={trade.processes} className="h-28 w-auto max-w-full" />
        ) : (
          <WelderArt className="h-28 w-auto max-w-full" />
        )}
      </div>
      <div className="p-4">
        <h2 className="text-2xl leading-snug font-semibold tracking-tight tabular-nums">
          {total && !badSeat
            ? t("seat.header", { seat: seatNo, total, pkg: packageId })
            : `${t("title.trainee")} · ${packageId}`}
        </h2>
        {total && !badSeat ? (
          <div className="mt-2 flex gap-1.5" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-2 flex-1 rounded-full",
                  i + 1 === seatNo ? "bg-brand" : "bg-muted"
                )}
              />
            ))}
          </div>
        ) : null}
        {pkg ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {shortShopName(pkg.shop_name)} ({pkg.shop_source === "synthetic" ? "synthetic" : "public data"})
            </span>
            <StatusBadge kind={pkg.shop_source === "public" ? "public" : "synthetic"} />
          </p>
        ) : null}
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          {t("seat.private")}
        </p>
      </div>
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

  if (badSeat) {
    return (
      <div className="flex flex-col gap-5 pt-2" data-testid="seat-missing">
        {header}
        <Notice
          title={total ? t("seat.missing", { pkg: packageId, total }) : t("seat.missingNoTotal", { pkg: packageId })}
          body={t("seat.missingBody")}
        />
        {total ? (
          <ul className="grid grid-cols-2 gap-2">
            {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
              <li key={n}>
                <Link
                  href={`/m/trainee/${encodeURIComponent(packageId)}?seat=${n}`}
                  className={cn(buttonVariants({ variant: "outline", size: "touch" }), "w-full")}
                >
                  {t("seat.pick", { seat: n, total })}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

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
    title: seatIcsTitle(packageId, pkg),
    description: t("seat.icsBody"),
    date: testDate,
  })
  const { jobs: unlocked, value } = pkg ? packageJobs(pkg, fundResults) : { jobs: [], value: 0 }

  return (
    <div className="flex flex-col gap-5 pt-2">
      {header}

      <section aria-labelledby="stage-title">
        <h3 id="stage-title" className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight">
          {t("seat.stage")}
          <AssumptionTag note={seatDemo.note} />
          <InfoTip label="About this stage">
            <span>{t("seat.stageNote")}</span>
          </InfoTip>
        </h3>
        <SeatStepper stages={seatStagesFor(trade)} currentId={seatDemo.stage_after_funding} />
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
            <CalendarDays className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("seat.testDate")}
              <AssumptionTag note="Funding date plus 6 weeks; the provider sets the real date" />
              <InfoTip label="About the test date" className="normal-case">
                <span className="normal-case">{t("seat.testDateNote")}</span>
              </InfoTip>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{fmtLongDate(testDate)}</p>
          </div>
        </div>
        {pkg ? (
          <p className="mt-3 flex items-center gap-2 text-sm">
            <GraduationCap className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">{t("seat.provider")}: </span>
            <span className="font-medium">{pkg.recipient_example}</span>
          </p>
        ) : null}
        <a
          href={icsDataUrl(ics)}
          download={`muster-${packageId}-test-date.ics`}
          className={cn(buttonVariants({ variant: "outline", size: "touch-lg" }), "mt-3 w-full")}
        >
          <CalendarPlus className="size-5" aria-hidden />
          {t("seat.addToCalendar")}
        </a>
      </section>

      <TicketPreview trade={trade} />

      <PathToWork jobs={unlocked} value={value} jobsById={jobsById} trade={trade} />

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        Who qualifies (ITB §7.5.1)
        <InfoTip label="Who qualifies for certification credit">
          <span>{t("seat.eligibility")}</span>
        </InfoTip>
      </div>
    </div>
  )
}
