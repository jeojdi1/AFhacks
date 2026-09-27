"use client"

// /m/college: the training partner's phone view.
//   - Training plans the defence company funded or may fund (TP-01, TP-02)
//   - Pseudonymous seats ("Seat 1 of 4 · TP-01"), never names
//   - The evidence Northgate needs to claim Canada work credit (ITB) for training
// Status comes from useDemo() (gaps, fundResults, fundedIds) plus the polled event
// log, so a Fund tapped on the laptop or the prime's phone shows up here.
// Before routing there are no suggestions yet; the plans are shown from the
// checked-in example data and marked "Not suggested yet".

import * as React from "react"
import Link from "next/link"
import { CheckCircle2, ChevronRight, CircleDashed, ClipboardCheck, GraduationCap, HandCoins, School, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { CERT_LABEL, fmtMoney } from "@/lib/format"
import { certPlain } from "@/lib/ui/plain"
import { useDemo } from "@/lib/data/store"
import { fx } from "@/lib/data/fixture-source"
import type { GapsResponse, TrainingPackage } from "@/lib/api/types"
import { shopInfo, useAppActions } from "@/lib/app/actions-store"
import { shortShopName } from "@/lib/app/feed"
import { extendStrings, t } from "@/lib/app/strings"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { ShopLabelChip } from "@/components/mobile/shell/m-header"

extendStrings("en", {
  "col.partner": "Regional college (example, not affiliated)",
  "col.partnerChip": "Example, not affiliated",
  "col.intro": "Northgate, a fictional defence company, pays for welder training at small shops. You run the courses. Northgate earns Canada work credit (ITB) for the training.",
  "col.plans": "Training plans",
  "col.plansNotRouted": "Northgate hasn't sent its parts list to shops yet, so these plans are examples of what it may fund.",
  "col.status.funded": "Funded",
  "col.status.requested": "Shop asked Northgate",
  "col.status.suggested": "Suggested, not funded",
  "col.status.example": "Not suggested yet",
  "col.tp01.title": "{count} welder seats · {cert}",
  "col.tp02.title": "{count} apprentice seats · welding",
  "col.tp01.partner": "Regional college (example, not affiliated)",
  "col.tp02.partner": "Indigenous-governed training institute (example, not affiliated)",
  "col.atShop": "At {shop}",
  "col.cost": "{cost} training → {credit} credit ({mult}x)",
  "col.costNote": "Training cost is a demo estimate (data/rules/training_costs.json).",
  "col.tp02.eligibility": "10x counts only if the Defence Investment Agency confirms eligibility",
  "col.tp02.eligibilityNote": "The ITB overview says Indigenous workforce development may receive 10x; this sponsorship's eligibility would be confirmed with the Defence Investment Agency.",
  "col.seats": "Seats",
  "col.seat": "Seat {seat} of {total}",
  "col.seat.enrolled": "Enrolled",
  "col.seat.waiting": "Waiting for funding",
  "col.seat.stageNote": "Seat stages are a demo assumption.",
  "col.seatsPrivacy": "Seats are numbered, never named.",
  "col.headline": "What funding did",
  "col.evidence": "Proof Northgate needs for the training credit",
  "col.evidenceSub": "Northgate claims Canada work credit (ITB) for training it pays for. You send the proof; Muster never stores personal records.",
  "col.evidenceNote": "This checklist is a demo assumption. The Defence Investment Agency sets the evidence it accepts.",
  "col.ev.enrolment": "Enrolment confirmation for each seat",
  "col.ev.attendance": "Attendance records",
  "col.ev.completion": "Completion or test result (for example a welding certification (CWB W47.1) test pass)",
  "col.ev.invoices": "Invoices paid by Northgate (training counts on the defence company's cash)",
  "col.ev.eligibility": "Citizenship or permanent-resident eligibility for personal certification",
  "col.ev.eligibilitySrc": "ITB model terms §7.5.1: personal certification counts only for Canadian citizens or permanent residents.",
  "col.ev.apprentice": "Registration in a recognized apprenticeship program",
  "col.ev.apprenticeSrc": "ITB model terms §7.5.1: apprentice sponsorship in a recognized apprenticeship program.",
  "col.ev.cap": "Training credit is capped at 25% of what Northgate owes (ITB model terms §7.5.4.1).",
  "col.ev.ready": "Ready to collect",
  "col.ev.later": "After funding",
  "col.ev.demoDone": "Received (demo)",
})

type PlanStatus = "funded" | "requested" | "suggested" | "example"

const STATUS_STYLE: Record<PlanStatus, { cls: string; Icon: typeof CheckCircle2 }> = {
  funded: { cls: "border-assigned/25 bg-assigned-soft text-assigned", Icon: CheckCircle2 },
  requested: { cls: "border-brand/30 bg-brand/10 text-brand", Icon: HandCoins },
  suggested: { cls: "border-amber-300 bg-amber-50 text-amber-800", Icon: CircleDashed },
  example: { cls: "border-border bg-muted text-muted-foreground", Icon: CircleDashed },
}

function StatusChip({ status }: { status: PlanStatus }) {
  const { cls, Icon } = STATUS_STYLE[status]
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-sm font-semibold", cls)} data-status={status}>
      <Icon className="size-3.5" aria-hidden />
      {t(`col.status.${status}`)}
    </span>
  )
}

/** Example plans for before routing (checked-in fixtures, pre-fund). */
function examplePlans(): TrainingPackage[] {
  return fx<GapsResponse>("GET", "/programs/northgate/gaps")?.suggestions ?? []
}

function planTitle(p: TrainingPackage): string {
  if (p.category === "apprentice_sponsorship") return t("col.tp02.title", { count: p.trainees })
  return t("col.tp01.title", { count: p.trainees, cert: p.cert_unlock ? certPlain(p.cert_unlock).first || (CERT_LABEL[p.cert_unlock] ?? p.cert_unlock) : "welding" })
}

function planPartner(p: TrainingPackage): string {
  return p.recipient_type === "indigenous_institution" || p.category === "apprentice_sponsorship" ? t("col.tp02.partner") : t("col.tp01.partner")
}

export function CollegeView() {
  const demo = useDemo()
  const { events, fundingRequests, ready: actionsReady } = useAppActions()
  const routed = demo.stage === "routed" || demo.stage === "funded"

  const plans = React.useMemo<TrainingPackage[]>(() => {
    const live = demo.gaps?.suggestions ?? []
    return live.length ? live : examplePlans()
  }, [demo.gaps])

  const statusOf = React.useCallback(
    (p: TrainingPackage): PlanStatus => {
      if (
        demo.fundedIds.includes(p.id) ||
        demo.fundResults[p.id] ||
        (routed && p.status === "funded") ||
        events.some((e) => e.kind === "package_funded" && e.package_id === p.id)
      )
        return "funded"
      if (!routed && !demo.gaps) return "example"
      if (fundingRequests[p.id]) return "requested"
      return "suggested"
    },
    [demo.fundedIds, demo.fundResults, demo.gaps, routed, events, fundingRequests]
  )

  const loading = !demo.ready || !actionsReady
  const statuses = plans.map((p) => statusOf(p))
  const anyFunded = statuses.includes("funded")
  const hasApprentice = plans.some((p) => p.category === "apprentice_sponsorship")

  return (
    <div className="flex flex-col gap-6 pt-2" data-testid="college-view">
      <section className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary">
            <School className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg leading-snug font-semibold">{t("col.partner")}</h2>
            <span className="mt-1 inline-flex rounded-full border border-dashed border-slate-400 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              {t("col.partnerChip")}
            </span>
          </div>
        </div>
        <p className="mt-3 text-base leading-snug text-muted-foreground">{t("col.intro")}</p>
      </section>

      <section aria-labelledby="plans-title" className="flex flex-col gap-3">
        <h2 id="plans-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <GraduationCap className="size-5 text-muted-foreground" aria-hidden />
          {t("col.plans")}
        </h2>
        {!loading && !routed && !demo.gaps ? <p className="text-sm text-muted-foreground">{t("col.plansNotRouted")}</p> : null}
        {loading ? (
          <div className="h-56 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" aria-hidden />
        ) : (
          <ul className="flex flex-col gap-3">
            {plans.map((p, i) => {
              const status = statuses[i]
              const funded = status === "funded"
              const shop = shortShopName(shopInfo(p.shop_id)?.name ?? p.shop_name)
              const headline = demo.fundResults[p.id]?.headline ?? null
              return (
                <li key={p.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs" data-testid="plan-card" data-pkg={p.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-muted-foreground">{p.id}</span>
                    <StatusChip status={status} />
                  </div>
                  <div>
                    <p className="text-lg leading-snug font-semibold">{planTitle(p)}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{planPartner(p)}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                      {t("col.atShop", { shop })}
                      <ShopLabelChip source={p.shop_source} />
                    </p>
                  </div>
                  <p className="flex flex-wrap items-center gap-1.5 text-base font-semibold tabular-nums">
                    {t("col.cost", {
                      cost: fmtMoney(p.est_cost_cad, { compact: true }),
                      credit: fmtMoney(p.est_credit_cad, { compact: true }),
                      mult: p.multiplier,
                    })}
                    <AssumptionTag note={t("col.costNote")} />
                  </p>
                  {p.multiplier === 10 ? (
                    <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                      {t("col.tp02.eligibility")}
                      <AssumptionTag note={t("col.tp02.eligibilityNote")} />
                    </p>
                  ) : null}
                  {funded && headline ? (
                    <p className="flex items-start gap-2 rounded-lg border border-assigned/25 bg-assigned-soft px-3 py-2 text-sm text-assigned">
                      <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        <span className="font-semibold">{t("col.headline")}: </span>
                        {headline}
                      </span>
                    </p>
                  ) : null}

                  <div>
                    <p className="mb-1.5 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                      {t("col.seats")} · {t("col.seatsPrivacy")}
                    </p>
                    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                      {Array.from({ length: p.trainees }, (_, k) => k + 1).map((n) => (
                        <li key={n}>
                          <Link
                            href={`/m/trainee/${encodeURIComponent(p.id)}?seat=${n}`}
                            className="flex min-h-12 items-center gap-3 px-3 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                            data-testid="seat-row"
                          >
                            <span className="min-w-0 flex-1 text-base font-medium">{t("col.seat", { seat: n, total: p.trainees })}</span>
                            <span className={cn("text-sm", funded ? "font-medium text-assigned" : "text-muted-foreground")}>
                              {funded ? t("col.seat.enrolled") : t("col.seat.waiting")}
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {funded ? (
                      <p className="mt-1.5">
                        <AssumptionTag note={t("col.seat.stageNote")} />
                      </p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="evidence-title" className="flex flex-col gap-3" data-testid="evidence">
        <div>
          <h2 id="evidence-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <ClipboardCheck className="size-5 text-muted-foreground" aria-hidden />
            {t("col.evidence")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("col.evidenceSub")}</p>
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          <EvidenceRow text={t("col.ev.enrolment")} state={anyFunded ? "done" : "later"} tag />
          <EvidenceRow text={t("col.ev.attendance")} state={anyFunded ? "ready" : "later"} tag />
          <EvidenceRow text={t("col.ev.completion")} state={anyFunded ? "ready" : "later"} tag />
          <EvidenceRow text={t("col.ev.invoices")} state={anyFunded ? "ready" : "later"} tag />
          <EvidenceRow text={t("col.ev.eligibility")} source={t("col.ev.eligibilitySrc")} state={anyFunded ? "ready" : "later"} />
          {hasApprentice ? <EvidenceRow text={t("col.ev.apprentice")} source={t("col.ev.apprenticeSrc")} state={anyFunded ? "ready" : "later"} /> : null}
        </ul>
        <p className="text-sm text-muted-foreground">{t("col.ev.cap")}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <AssumptionTag note={t("col.evidenceNote")} />
          {t("col.evidenceNote")}
        </p>
        <p className="text-xs text-muted-foreground">{t("label.simplifiedItb")}</p>
      </section>
    </div>
  )
}

function EvidenceRow({ text, source, state, tag = false }: { text: string; source?: string; state: "done" | "ready" | "later"; tag?: boolean }) {
  const label = state === "done" ? t("col.ev.demoDone") : state === "ready" ? t("col.ev.ready") : t("col.ev.later")
  return (
    <li className="flex min-h-12 items-start gap-3 px-3 py-3" data-testid="evidence-row">
      {state === "done" ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-assigned" aria-hidden />
      ) : (
        <CircleDashed className={cn("mt-0.5 size-5 shrink-0", state === "ready" ? "text-brand" : "text-muted-foreground")} aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-base leading-snug">{text}</p>
        {source ? <p className="mt-0.5 text-sm text-muted-foreground">{source}</p> : null}
        <p className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={cn("text-sm font-medium", state === "done" ? "text-assigned" : state === "ready" ? "text-brand" : "text-muted-foreground")}>{label}</span>
          {tag ? <AssumptionTag /> : null}
        </p>
      </div>
    </li>
  )
}
