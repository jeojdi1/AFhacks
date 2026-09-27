"use client"

// /trainee: the trainee's seat on the laptop. The same seat the phone shows
// (TRAINEE_SEAT_HREF, Seat 3 of 4 · TP-01) with the same data: stage, example
// test date, ticket and the jobs the ticket helps unlock. No personal names.

import * as React from "react"
import Link from "next/link"
import { CalendarDays, CalendarPlus, GraduationCap, Hourglass, Inbox, Lock, ShieldCheck, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { TRAINEE_SEAT_HREF } from "@/lib/auth/accounts"
import { useDemo } from "@/lib/data/store"
import { useAppActions } from "@/lib/app/actions-store"
import { t } from "@/lib/app/strings"
import { addDays, appToday, fmtLongDate, parseAppDate, toISODate } from "@/lib/app/today"
import { shortShopName } from "@/lib/app/copy"
import { buildIcs, icsDataUrl } from "@/lib/app/ics"
import { packageJobs, seatDemo, seatStages } from "@/lib/app/readiness"
import { buttonVariants } from "@/components/ui/button"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { StatusBadge } from "@/components/muster/status-badge"
import { WelderArt } from "@/components/mobile/trainee/seat-art"
import { TicketPreview } from "@/components/mobile/trainee/ticket-preview"
import { RoleBanner } from "./role-banner"
import { InfoTip } from "./desk-art"
import { usePackageFunded } from "./use-funded"
import { StageTrack } from "./trainee-desk/stage-track"
import { PathGrid } from "./trainee-desk/path-grid"

/** The demo trainee's seat, read from TRAINEE_SEAT_HREF ("/m/trainee/TP-01?seat=3"). */
function seatFromHref(href: string): { packageId: string; seat: number } {
  const [path, query = ""] = href.split("?")
  const packageId = decodeURIComponent(path.split("/").filter(Boolean).pop() ?? "TP-01")
  const seat = Number(new URLSearchParams(query).get("seat")) || 1
  return { packageId, seat }
}

const { packageId: SEAT_PACKAGE, seat: SEAT_NO } = seatFromHref(TRAINEE_SEAT_HREF)

export function TraineeHome() {
  const { ready, stage, gaps, fundResults, jobs } = useDemo()
  const { fundingRequests, events } = useAppActions()
  // Same funding check as the phone's seat card, so the laptop and phone agree.
  const funded = usePackageFunded()(SEAT_PACKAGE)

  const pkg = gaps?.suggestions.find((p) => p.id === SEAT_PACKAGE) ?? fundResults[SEAT_PACKAGE]?.package ?? null
  const total = pkg?.trainees ?? null
  const request = fundingRequests[SEAT_PACKAGE] ?? null
  const jobsById = React.useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs])
  const fundedAt = React.useMemo(() => {
    const e = [...events].reverse().find((x) => x.kind === "package_funded" && x.package_id === SEAT_PACKAGE)
    return parseAppDate(e?.ts ?? null)
  }, [events])

  const routed = stage === "routed" || stage === "funded"
  const title = total ? t("seat.header", { seat: SEAT_NO, total, pkg: SEAT_PACKAGE }) : `${t("title.trainee")} · ${SEAT_PACKAGE}`

  const hero = (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      <div className="grid items-center gap-0 md:grid-cols-[1fr_minmax(0,22rem)]">
        <div className="flex flex-col gap-3 p-5 sm:p-8">
          <p className="text-sm font-medium text-muted-foreground">Your training seat</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[2rem] leading-tight font-semibold tracking-tight tabular-nums sm:text-5xl">{title}</h1>
            {funded ? (
              <span className="rounded-full bg-funded-soft px-3 py-1 text-sm font-medium text-funded">Funded by Northgate</span>
            ) : null}
          </div>
          {total ? (
            <div className="flex max-w-md gap-1.5" aria-hidden>
              {Array.from({ length: total }, (_, i) => (
                <span key={i} className={cn("h-2.5 flex-1 rounded-full", i + 1 === SEAT_NO ? "bg-brand" : "bg-border")} />
              ))}
            </div>
          ) : null}
          {pkg ? (
            <p className="flex flex-wrap items-center gap-2 text-base text-slate-700">
              <span className="font-medium">
                {shortShopName(pkg.shop_name)} ({pkg.shop_source === "synthetic" ? "synthetic" : "public data"})
              </span>
              <StatusBadge kind={pkg.shop_source === "public" ? "public" : "synthetic"} />
            </p>
          ) : null}
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="size-4 shrink-0" aria-hidden />
            {t("seat.private")}
          </p>
        </div>
        <div className="flex h-full items-center justify-center bg-brand/5 px-6 py-6">
          <WelderArt className="h-40 w-auto max-w-full sm:h-48" />
        </div>
      </div>
    </section>
  )

  const eligibility = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <ShieldCheck className="size-4 shrink-0" aria-hidden />
      Who qualifies (ITB §7.5.1)
      <InfoTip label="Who qualifies for certification credit">
        <span>{t("seat.eligibility")}</span>
      </InfoTip>
      <span className="mx-2 hidden sm:inline" aria-hidden>
        ·
      </span>
      <span>No personal names are stored. Demo sign-in — fictional accounts, no real authentication.</span>
      <Link
        href={TRAINEE_SEAT_HREF}
        prefetch={false}
        className="ml-auto inline-flex min-h-11 items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline"
      >
        <Smartphone className="size-4" aria-hidden />
        Phone version
      </Link>
    </div>
  )

  let body: React.ReactNode
  if (!ready) {
    body = (
      <div className="flex flex-col gap-4" aria-hidden>
        <div className="h-40 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        <div className="h-48 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      </div>
    )
  } else if (!funded) {
    const unknown = routed && !pkg
    body = (
      <section className="flex flex-col gap-6 rounded-xl border border-dashed border-border bg-muted/50 p-6 sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
            {unknown ? <Inbox className="size-8" aria-hidden /> : <Hourglass className="size-8" aria-hidden />}
          </span>
          <h2 className="text-2xl font-semibold tracking-tight">
            {unknown ? t("seat.unknownPkg", { pkg: SEAT_PACKAGE }) : request ? t("seat.notFundedAsked") : t("seat.notFunded")}
          </h2>
          <p className="max-w-xl text-base text-muted-foreground">
            {unknown ? t("seat.unknownPkgBody") : t("seat.notFundedBody", { pkg: SEAT_PACKAGE })}
          </p>
        </div>
        {!unknown ? (
          <div className="opacity-70">
            <p className="sr-only">Stages after funding:</p>
            <StageTrack stages={seatStages} currentId={null} />
          </div>
        ) : null}
      </section>
    )
  } else {
    const base = fundedAt ?? appToday()
    const testDate = addDays(base, seatDemo.test_date_weeks_after_funding * 7)
    const ics = buildIcs({
      uid: `muster-${SEAT_PACKAGE}-seat-${SEAT_NO}-${toISODate(testDate)}@muster.demo`,
      title: t("seat.icsTitle", { pkg: SEAT_PACKAGE }),
      description: t("seat.icsBody"),
      date: testDate,
    })
    const { jobs: unlocked, value } = pkg ? packageJobs(pkg, fundResults) : { jobs: [], value: 0 }
    body = (
      <>
        <section aria-labelledby="desk-stage-title" className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 id="desk-stage-title" className="mb-5 flex items-center gap-2 text-lg font-semibold tracking-tight">
            {t("seat.stage")}
            <AssumptionTag note={seatDemo.note} />
            <InfoTip label="About this stage">
              <span>{t("seat.stageNote")}</span>
            </InfoTip>
          </h2>
          <StageTrack stages={seatStages} currentId={seatDemo.stage_after_funding} />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="desk-test-title" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <CalendarDays className="size-8" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="desk-test-title"
                  className="flex flex-wrap items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                >
                  {t("seat.testDate")}
                  <AssumptionTag note="Funding date plus 6 weeks; the provider sets the real date" />
                  <InfoTip label="About the test date" className="normal-case">
                    <span className="normal-case">{t("seat.testDateNote")}</span>
                  </InfoTip>
                </h2>
                <p className="text-3xl font-semibold tracking-tight tabular-nums">{fmtLongDate(testDate)}</p>
              </div>
            </div>
            {pkg ? (
              <p className="flex items-center gap-2 text-base">
                <GraduationCap className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="sr-only">{t("seat.provider")}: </span>
                <span className="font-medium">{pkg.recipient_example}</span>
              </p>
            ) : null}
            <a
              href={icsDataUrl(ics)}
              download={`muster-${SEAT_PACKAGE}-test-date.ics`}
              className={cn(buttonVariants({ variant: "outline", size: "touch" }), "mt-auto self-start")}
            >
              <CalendarPlus className="size-5" aria-hidden />
              {t("seat.addToCalendar")}
            </a>
          </section>

          <TicketPreview />
        </div>

        <PathGrid jobs={unlocked} value={value} jobsById={jobsById} />
      </>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8" data-testid="trainee-home">
      <RoleBanner role="trainee" desk="the trainee's seat" />
      {hero}
      <div className="flex flex-col gap-6" data-testid="trainee-funding" data-funded={funded ? "yes" : "no"}>
        {body}
      </div>
      {eligibility}
    </div>
  )
}
