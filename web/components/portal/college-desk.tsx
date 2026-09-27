"use client"

// /college: training coordinator at a regional college (example, not affiliated).
// The training plans Northgate funds or could fund (TP-01, TP-02), their seats,
// and the records the college keeps so the training can count toward Northgate's
// promise. Shieldworks stores none of those records: nothing is collected here.

import * as React from "react"
import Link from "next/link"
import { Circle, CircleCheck, ClipboardCheck, GraduationCap, LoaderCircle, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import type { TrainingPackage } from "@/lib/api/types"
import { packageTitle } from "@/lib/app/copy"
import { seatHref } from "@/lib/app/readiness"
import { CATEGORY_LABEL, fmtMoney } from "@/lib/format"
import { StatusBadge } from "@/components/muster/status-badge"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { Term } from "@/components/muster/term"
import { PortalPage, Panel } from "./portal-page"
import { StartDemo, useRouted } from "./start-demo"
import { usePackageFunded } from "./use-funded"

type ItemState = "done" | "doing" | "todo"

interface EvidenceItem {
  id: string
  title: string
  body: string
  /** Policy basis, or null when the item is a demo assumption. */
  basis: string | null
  state: (funded: boolean) => ItemState
  /** Only for these training categories (null: all). */
  only?: string[]
}

// What the college keeps on file so Northgate's training cash can count.
// The categories and the citizen/PR rule are policy (ITB model terms §7.5.1, §7.5.3);
// the exact paperwork list is a demo assumption.
const EVIDENCE: EvidenceItem[] = [
  {
    id: "enrolment",
    title: "Enrolment for each seat",
    body: "Which program each seat is in and when it starts.",
    basis: null,
    // Funding puts each seat at "Enrolled" (the trainee's current step): in progress.
    state: (f) => (f ? "doing" : "todo"),
  },
  {
    id: "eligibility",
    title: "Eligibility: Canadian citizen or permanent resident",
    body: "Personal certification counts only for citizens or permanent residents. The college checks this; Shieldworks never sees the documents.",
    basis: "Model terms §7.5.1",
    // The shop's yes/no attestation comes before a seat is funded; the trainee's stepper shows it Done.
    state: (f) => (f ? "done" : "todo"),
    only: ["personal_certification"],
  },
  {
    id: "costs",
    title: "Costs paid in Canada, from Northgate's cash",
    body: "Tuition, course fees and travel incurred in Canada, with invoices showing Northgate paid. Training credit applies to the company's cash.",
    basis: "Model terms §7.5.1, §7.5.3",
    // Invoices build up while the training runs: in progress once funded, never Done at the moment of funding.
    state: (f) => (f ? "doing" : "todo"),
  },
  {
    id: "completion",
    title: "Completion or test result for each seat",
    body: "Proof each trainee finished, such as passing the welding test with a recognized trade body.",
    basis: null,
    state: () => "todo",
  },
]

const STATE_UI: Record<ItemState, { label: string; cls: string; Icon: typeof Circle }> = {
  done: { label: "Done", cls: "text-assigned", Icon: CircleCheck },
  doing: { label: "In progress", cls: "text-public", Icon: LoaderCircle },
  todo: { label: "Not started", cls: "text-muted-foreground", Icon: Circle },
}

function multiplierText(m: number): string {
  if (m === 10) return "counts 10× (Indigenous workforce development)"
  if (m === 5) return "counts 5× (training)"
  return `counts ${m}×`
}

function PlanCard({ pkg, funded }: { pkg: TrainingPackage; funded: boolean }) {
  const seats = Array.from({ length: pkg.trainees }, (_, i) => i + 1)
  return (
    <article
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-5"
      data-testid={`plan-${pkg.id}`}
      aria-labelledby={`plan-${pkg.id}-title`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge kind={funded ? "funded" : "suggested"} />
        <span className="text-xs text-muted-foreground">Training plan {pkg.id}</span>
      </div>
      <h3 id={`plan-${pkg.id}-title`} className="text-lg leading-snug font-semibold tracking-tight">
        {packageTitle(pkg)}
      </h3>
      {isW471Plan(pkg) ? (
        <p className="text-sm text-muted-foreground" data-testid={`plan-${pkg.id}-gloss`}>
          This is the{" "}
          <Term k="CWB_W47.1">
            welding certification (CWB W47.1)
          </Term>
          : the Canadian Welding Bureau certifies the shop to the CSA W47.1 standard, and each welder passes a test in
          the welding methods the jobs use, <abbr title="Flux-cored arc welding" className="no-underline">FCAW</abbr> and{" "}
          <abbr title="Gas metal arc welding (MIG)" className="no-underline">GMAW</abbr> (two wire-feed welding
          methods).
        </p>
      ) : null}
      <p className="text-sm text-slate-700">
        Training partner: <span className="font-medium">{pkg.recipient_example}</span>
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Seats</dt>
          <dd className="font-semibold tabular-nums">{pkg.trainees}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{funded ? "Paid by Northgate" : "Would cost Northgate"}</dt>
          <dd className="flex items-center gap-1.5 font-semibold tabular-nums">
            {fmtMoney(pkg.est_cost_cad, { compact: true })}
            <AssumptionTag note="Estimated training cost for the demo (data/rules/training_costs.json), not a quote." />
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-muted-foreground">Type</dt>
          <dd className="font-medium">{CATEGORY_LABEL[pkg.category] ?? pkg.category}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        Northgate&apos;s training cash {multiplierText(pkg.multiplier)} toward what it owes:{" "}
        {fmtMoney(pkg.est_cost_cad, { compact: true })} → {fmtMoney(pkg.est_credit_cad, { compact: true })} credit.
        {pkg.multiplier === 10 ? (
          <>
            {" "}
            Whether this sponsorship qualifies needs confirming with the Defence Investment Agency.{" "}
            <AssumptionTag />
          </>
        ) : null}
      </p>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          {funded ? `${pkg.trainees} seats to fill` : `${pkg.trainees} seats, once Northgate funds this plan`}
        </p>
        {funded ? (
          <ul className="flex flex-wrap gap-2" aria-label={`Seats in ${pkg.id}`}>
            {seats.map((n) => (
              <li key={n}>
                <Link
                  href={seatHref(pkg.id, n)}
                  prefetch={false}
                  className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
                >
                  Seat {n} of {pkg.trainees}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No seats open yet.</p>
        )}
        <p className="text-xs text-muted-foreground">Seats are pseudonymous: no trainee names are stored.</p>
      </div>
    </article>
  )
}

function isW471Plan(pkg: TrainingPackage): boolean {
  return pkg.gap?.requirement === "CWB_W47.1" || pkg.cert_unlock === "CWB_W47.1"
}

function EvidencePanel({ plan, funded }: { plan: TrainingPackage; funded: boolean }) {
  const cats = [plan.category, ...(plan.categories ?? [])]
  const evidence = EVIDENCE.filter((e) => !e.only || cats.some((c) => e.only?.includes(c)))
  return (
    <Panel title={`Records that let the training count · ${plan.id}`} icon={ClipboardCheck} testId={`panel-evidence-${plan.id}`}>
      <p className="text-sm text-slate-700">
        For training plan {plan.id}
        {funded ? "" : " (not funded yet: this is what the college would keep)"}. Keep these on file; Northgate reports
        them to claim credit. Shieldworks stores none of these documents.
      </p>
      <ol className="flex flex-col gap-2">
        {evidence.map((e) => {
          const st = STATE_UI[e.state(funded)]
          return (
            <li key={e.id} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5" data-evidence={e.id} data-state={e.state(funded)}>
              <st.Icon className={cn("mt-0.5 size-5 shrink-0", st.cls)} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{e.title}</span>
                  <span className={cn("text-xs font-medium", st.cls)}>{st.label}</span>
                  {e.basis ? (
                    <span className="text-xs text-muted-foreground">{e.basis}</span>
                  ) : (
                    <AssumptionTag note="Paperwork list is a demo assumption; confirm with the Defence Investment Agency." />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{e.body}</p>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex h-5 items-center rounded-full border border-slate-300 px-2 font-medium text-slate-600">
          Simplified ITB rules for demo
        </span>
        Training credit is capped at 25% of what Northgate owes.
      </p>
    </Panel>
  )
}

export function CollegeDesk() {
  const demo = useDemo()
  const routed = useRouted()
  const plans = React.useMemo(() => demo.gaps?.suggestions ?? [], [demo.gaps])
  // Same check as the phone's seat card: also true when a package_funded event arrives
  // (live mode, Fund clicked in another browser), so this desk flips without a reload.
  const isFunded = usePackageFunded()
  const fundedPlans = plans.filter((p) => isFunded(p))
  // One records checklist per funded plan; before any funding, preview it for TP-01.
  const checklistPlans = fundedPlans.length
    ? fundedPlans
    : [plans.find((p) => p.id === "TP-01") ?? plans[0]].filter((p): p is TrainingPackage => !!p)

  return (
    <PortalPage
      role="college"
      desk="the training coordinator's desk"
      testId="college-desk"
      eyebrow="Regional college (example, not affiliated) · training coordinator"
      title="Training coordinator's desk"
      lede={
        <>
          When small shops are short of qualified welders, Northgate pays for the training. Your college fills the seats
          and keeps the records that let the training count.
        </>
      }
    >
      {!routed && demo.ready ? (
        <StartDemo message="No training plans yet. They appear once Northgate's parts list is matched and some jobs are stuck for lack of qualified welders." />
      ) : null}

      {plans.length ? (
        <section aria-labelledby="plans-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="plans-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <GraduationCap className="size-5 text-muted-foreground" aria-hidden />
              Training plans
            </h2>
            <p className="text-sm text-muted-foreground" data-testid="plans-summary">
              {fundedPlans.length} funded · {plans.length - fundedPlans.length} suggested
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {plans.map((p) => (
              <PlanCard key={p.id} pkg={p} funded={isFunded(p)} />
            ))}
          </div>
          {!fundedPlans.length ? (
            <p className="text-sm text-muted-foreground">
              Northgate decides which plan to fund on its{" "}
              <Link href="/gaps" className="font-medium text-foreground underline underline-offset-4">
                welder gap screen
              </Link>
              .
            </p>
          ) : null}
        </section>
      ) : null}

      {checklistPlans.map((plan) => (
        <EvidencePanel key={plan.id} plan={plan} funded={isFunded(plan)} />
      ))}
    </PortalPage>
  )
}
