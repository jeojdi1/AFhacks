"use client"

import * as React from "react"
import { BadgeCheck, GraduationCap, Inbox, ShieldCheck } from "lucide-react"
import { useDemo } from "@/lib/data/store"
import { fmtMoney } from "@/lib/format"
import { useShopBundle } from "@/lib/app/shop-bundle"
import { extendStrings, t } from "@/lib/app/strings"
import { capacityUnlockShort, growTitle, requirementName, requirementShort, trainingUnderwayTitle } from "@/lib/app/copy"
import { growItemFor, packageFor, requirementDef, seatDemo, seatStages, type GrowItem, type ReadinessStepDef } from "@/lib/app/readiness"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { FlagChip, FundingChip, SourceLink, TierChip } from "./grow-chips"
import { FundingBar } from "./funding-bar"
import { WhoPays } from "./who-pays"

extendStrings("en", {
  "ready.seats.title": "Seats",
  "ready.seats.body": "{count} funded seats at {partner}. Seats are numbered, never named; each trainee's own card is private to them.",
  "ready.seats.bodyNoPartner": "{count} funded seats. Seats are numbered, never named; each trainee's own card is private to them.",
  "ready.seats.row": "Seat {seat} of {total}",
  "ready.seats.stage": "Stage {step} of {steps}",
})

/** The shop's view of a funded plan's seats: stage per seat, no names, no link into the trainee's app. */
function SeatsSummary({ item }: { item: GrowItem }) {
  const total = item.pkg?.trainees ?? item.training?.trainees ?? 0
  const ref = React.useRef<HTMLElement>(null)
  // Arriving from Today ("View seats") with #seats: the section only exists once data loads, so scroll here.
  React.useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#seats" || !ref.current) return
    ref.current.scrollIntoView({ block: "start" })
  }, [])
  if (!total) return null
  const idx = Math.max(0, seatStages.findIndex((s) => s.id === seatDemo.stage_after_funding))
  const stage = seatStages[idx]
  const partner = item.pkg?.recipient_example ?? null
  return (
    <section id="seats" ref={ref} tabIndex={-1} aria-labelledby="seats-title" className="scroll-mt-20 outline-none" data-testid="grow-seats">
      <h3 id="seats-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <GraduationCap className="size-5 text-muted-foreground" aria-hidden />
        {t("ready.seats.title")}
        <AssumptionTag note={seatDemo.note} />
      </h3>
      <p className="mt-1 mb-3 flex items-start gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        {partner ? t("ready.seats.body", { count: total, partner }) : t("ready.seats.bodyNoPartner", { count: total })}
      </p>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <li key={n} className="flex min-h-12 items-center gap-3 px-4 py-2.5" data-testid="grow-seat">
            <span className="min-w-0 flex-1 text-base font-medium">{t("ready.seats.row", { seat: n, total })}</span>
            <span className="text-right text-sm">
              <span className="block font-medium text-funded">{stage?.label ?? seatDemo.stage_after_funding}</span>
              <span className="block text-muted-foreground">{t("ready.seats.stage", { step: idx + 1, steps: seatStages.length })}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Step({ step, index, last }: { step: ReadinessStepDef; index: number; last: boolean }) {
  return (
    <li className="relative flex gap-3">
      {/* rail */}
      {!last ? <span aria-hidden className="absolute top-10 bottom-0 left-[17px] w-px bg-border" /> : null}
      <span
        aria-hidden
        className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold tabular-nums"
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1 pb-5">
        <p className="text-base leading-snug font-semibold">{step.label}</p>
        <p className="mt-1 text-[15px] leading-snug text-muted-foreground">{step.detail}</p>
        {step.time_stated || step.cost_stated ? (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {step.time_stated ? (
              <>
                <dt className="text-muted-foreground">{t("ready.time")}</dt>
                <dd className="font-medium">{step.time_stated}</dd>
              </>
            ) : null}
            {step.cost_stated ? (
              <>
                <dt className="text-muted-foreground">{t("ready.cost")}</dt>
                <dd className="font-medium">{step.cost_stated}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <FlagChip flag={step.flag} />
          {step.fundable ? (
            <span className="inline-flex h-6 items-center gap-1 rounded-full border border-funded/30 bg-funded-soft px-2 text-xs font-medium text-funded">
              <BadgeCheck className="size-3" aria-hidden />
              {t("ready.fundableStep")}
            </span>
          ) : null}
        </div>
        {step.source_url ? <SourceLink href={step.source_url} label={t("ready.source")} /> : null}
      </div>
    </li>
  )
}

/** No grow item for this link: a lower-case key is a process (more hours if the shop has it, else a new process). */
function guessKind(req: string, processes: readonly string[] | undefined): "capacity" | "process" | "cert" {
  if (!/^[a-z]/.test(req)) return "cert"
  return processes?.includes(req as never) ? "capacity" : "process"
}

/** /m/shops/[id]/grow/[req]: what a requirement takes, who pays, and "Ask Northgate to fund this". */
export function ReadinessStepper({ shopId, requirement }: { shopId: string; requirement: string }) {
  const { stage, gaps, fundResults, fundedIds, ready } = useDemo()
  const bundle = useShopBundle(shopId)
  const { detail, actions } = bundle
  const routed = stage === "routed" || stage === "funded"

  const item = React.useMemo(
    () =>
      growItemFor(
        { shopId, detail, gaps, fundResults, fundedIds, fundingRequests: actions.fundingRequests },
        requirement
      ),
    [shopId, detail, gaps, fundResults, fundedIds, actions.fundingRequests, requirement]
  )
  const def = React.useMemo(() => requirementDef(requirement, item?.kind), [requirement, item?.kind])
  const pkg = item?.pkg ?? packageFor(gaps, shopId, requirement)
  const capText = capacityUnlockShort(pkg?.capacity_unlock ?? item?.training?.capacity_unlock ?? null)
  // Funded: no "Get …" readiness wording and no "can fund" offer (docs/ux-simplification.md §5).
  const funded = item?.funding === "funded"

  if (!ready || (bundle.loading && !detail)) {
    return (
      <div className="flex flex-col gap-3 pt-2" aria-hidden>
        <div className="h-28 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        <div className="h-64 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 pt-2">
      {/* Header: what it unlocks */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {item ? <TierChip tier={item.tier} /> : null}
          {item?.funding === "requested" ? <FundingChip item={item} /> : null}
        </div>
        <h2 className="mt-2 text-xl leading-snug font-semibold tracking-tight">
          {funded && item
            ? trainingUnderwayTitle(requirement, item.pkg?.trainees ?? item.training?.trainees ?? 0)
            : growTitle(requirement, item?.kind ?? guessKind(requirement, bundle.shop?.processes))}
        </h2>
        {def ? (
          <p className="mt-0.5 text-sm font-medium text-muted-foreground">{def.title}</p>
        ) : requirementName(requirement) !== requirementShort(requirement) ? (
          <p className="mt-0.5 text-sm font-medium text-muted-foreground">{requirementName(requirement)}</p>
        ) : null}

        {item && item.jobs.length ? (
          <div className="mt-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t(funded ? "ready.unlockedFunded" : "ready.unlocks")}
            </p>
            <p className="mt-1 text-base leading-relaxed">
              <span className="font-mono text-[15px]">{item.jobs.join(" · ")}</span>
              <span className="text-muted-foreground"> · </span>
              <span className="font-semibold tabular-nums">{fmtMoney(item.value_cad, { compact: true })}</span>
              {capText ? (
                <>
                  <span className="text-muted-foreground"> · </span>
                  <span className="whitespace-nowrap">{capText}</span>{" "}
                  <AssumptionTag className="align-middle" note="Extra weekly hours per trained worker are a demo assumption" />
                </>
              ) : null}
            </p>
          </div>
        ) : !routed ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("ready.notRoutedBody")}</p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t("grow.notFoundBody")}</p>
        )}

        {def ? <p className="mt-3 text-[15px] leading-snug">{def.summary}</p> : null}
        {def?.registry_url ? <SourceLink href={def.registry_url} label={t("ready.registry")} /> : null}
      </section>

      {/* Seats (funded plans only): stages, never names */}
      {routed && item?.funding === "funded" ? <SeatsSummary item={item} /> : null}

      {/* Steps */}
      {def ? (
        <section aria-labelledby="steps-title">
          <h3 id="steps-title" className="text-lg font-semibold tracking-tight">
            {t("ready.steps")}
          </h3>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">{t("ready.stepsNote")}</p>
          <ol className="flex flex-col">
            {def.steps.map((s, i) => (
              <Step key={s.label} step={s} index={i} last={i === def.steps.length - 1} />
            ))}
          </ol>
          {def.kind === "quality_system" ? (
            <p className="text-sm text-muted-foreground">{t("ready.noCost")}</p>
          ) : null}
          {def.source_url ? <SourceLink href={def.source_url} label={t("ready.source")} /> : null}
        </section>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted p-4">
          <Inbox className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-base font-medium">{t("grow.notFound", { req: requirementName(requirement) })}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("grow.notFoundBody")}</p>
          </div>
        </div>
      )}

      {/* Who pays */}
      {routed && (item || pkg) ? <WhoPays pkg={pkg} requirement={requirement} funded={funded} /> : null}

      {routed && item ? <FundingBar item={item} actions={actions} /> : null}
    </div>
  )
}
