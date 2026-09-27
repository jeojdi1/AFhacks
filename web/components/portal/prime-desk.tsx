"use client"

// /prime: "Northgate's desk" (supplier development at the fictional prime).
// Promise meter, stuck jobs, shop replies and the four big next steps.
// All numbers come from useDemo() and the phone app's actions store.

import * as React from "react"
import Link from "next/link"
import { Activity, ClipboardList, Gauge, Inbox, MessageCircleQuestion, Search, TriangleAlert, Wrench, XCircle, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { decisionKey, useAppActions } from "@/lib/app/actions-store"
import { feedItems, type FeedContext, type FeedTone } from "@/lib/app/feed"
import { isSimulatedEvent } from "@/lib/app/sim-flag"
import { t } from "@/lib/app/strings"
import { fmtMoney } from "@/lib/format"
import { SimulatedChip } from "@/components/mobile/shell/simulation"
import { PortalPage, Panel, BigAction } from "./portal-page"
import { PromiseMeter } from "./promise-meter"
import { StartDemo, useRouted } from "./start-demo"
import { useWithParams } from "@/lib/ui/use-with-params"

const OBLIGATION_FALLBACK = 500_000_000

const TONE_DOT: Record<FeedTone, string> = {
  success: "bg-assigned",
  warn: "bg-blocked",
  danger: "bg-destructive",
  info: "bg-slate-400",
  action: "bg-public",
}

function Count({ n, label, tone, Icon }: { n: number; label: string; tone: string; Icon?: LucideIcon }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg bg-muted/60 px-3 py-2">
      <span className={cn("flex items-center gap-1.5 text-2xl font-semibold tabular-nums", tone)}>
        {Icon ? <Icon className="size-5" aria-hidden /> : null}
        {n}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}

export function PrimeDesk() {
  const demo = useDemo()
  const wp = useWithParams()
  const actions = useAppActions()
  const routed = useRouted()
  const { ledger, program, assignments, blocked, jobs, gaps, offerStatus } = demo

  const replies = React.useMemo(() => {
    let accepted = 0
    let declined = 0
    for (const a of assignments) {
      const key = decisionKey(a.shop_id, a.job_id)
      const d = actions.decisions[key]?.decision ?? offerStatus[key]
      const s = d === "accepted" || d === "declined" ? d : d ? "offered" : a.status
      if (s === "accepted") accepted++
      else if (s === "declined") declined++
    }
    return { accepted, declined, waiting: assignments.length - accepted - declined }
  }, [assignments, actions.decisions, offerStatus])

  // Declines and open questions need Northgate's attention: pinned above the activity list.
  const needsAttention = React.useMemo(() => {
    const byJob = new Map(assignments.map((a) => [decisionKey(a.shop_id, a.job_id), a]))
    const out: { key: string; jobId: string; shop: string; kind: "declined" | "question"; detail: string; simulated: boolean }[] = []
    for (const [key, d] of Object.entries(actions.decisions)) {
      const a = byJob.get(key)
      if (!a || (d.decision !== "declined" && d.decision !== "question")) continue
      const evKind = d.decision === "declined" ? "offer_declined" : "offer_question"
      let simulated = false
      for (let i = actions.events.length - 1; i >= 0; i--) {
        const e = actions.events[i]
        if (e.kind === evKind && e.shop_id === d.shop_id && e.job_id === d.job_id) {
          simulated = isSimulatedEvent(e)
          break
        }
      }
      out.push({
        key,
        jobId: a.job_id,
        shop: a.shop_name,
        kind: d.decision,
        detail:
          d.decision === "declined"
            ? d.reason_code
              ? t(`reason.${d.reason_code}`)
              : "no reason given"
            : d.question_code
              ? t(`question.${d.question_code}`)
              : "question",
        simulated,
      })
    }
    // Declines first, then questions; by job id.
    return out.sort((x, y) => (x.kind === y.kind ? x.jobId.localeCompare(y.jobId) : x.kind === "declined" ? -1 : 1))
  }, [assignments, actions.decisions, actions.events])

  const ctx = React.useMemo<FeedContext>(
    () => ({ prime: "Northgate", packages: gaps?.suggestions ?? [] }),
    [gaps]
  )
  const activity = React.useMemo(
    () => feedItems(actions.events, ledger, [], ctx).filter((i) => i.section === "activity").slice(0, 4),
    [actions.events, ledger, ctx]
  )

  const stuckValue = blocked.reduce((s, b) => s + (b.value_cad || 0), 0)
  const shops = new Set(assignments.map((a) => a.shop_id)).size
  const smeShops = new Set(assignments.filter((a) => a.is_sme).map((a) => a.shop_id)).size

  return (
    <PortalPage
      role="prime"
      desk="Northgate's desk"
      testId="prime-desk"
      eyebrow="Northgate Land Systems (fictional defence company) · supplier development"
      title="Northgate's desk"
      lede={
        <>
          Northgate won a {fmtMoney(program?.obligation_cad ?? OBLIGATION_FALLBACK, { compact: true })} defence contract and
          promised Canada the same amount of business. This desk shows how much is covered, which jobs are stuck, and
          what the small shops said.
        </>
      }
    >
      <Panel title="The promise" icon={Gauge} action={{ label: "Credit earned", href: "/scorecard" }} testId="panel-promise">
        <PromiseMeter ledger={routed ? ledger : null} obligation={program?.obligation_cad ?? OBLIGATION_FALLBACK} />
      </Panel>

      {!routed ? (
        <StartDemo message="Northgate hasn't posted a parts list yet. Load its 40-part list and Muster matches each job to one qualified small shop (about 5 seconds)." />
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Stuck jobs"
          icon={TriangleAlert}
          action={routed ? { label: "Fix the welder gap", href: "/gaps" } : null}
          testId="panel-stuck"
        >
          {routed ? (
            <div className="flex flex-col gap-2">
              <p className="text-[0.95rem] text-slate-700">
                <strong className="text-2xl font-semibold text-blocked tabular-nums" data-testid="stuck-count">
                  {blocked.length}
                </strong>{" "}
                {blocked.length === 1 ? "job is" : "jobs are"} stuck
                {blocked.length ? <> · {fmtMoney(stuckValue, { compact: true })} of work</> : null}
                {blocked.length ? ": no qualified shop has welders free." : "."}
              </p>
              <p className="text-sm text-muted-foreground">
                {assignments.length} of {jobs.length || assignments.length + blocked.length} jobs matched to {shops} Canadian
                shops ({smeShops} small {smeShops === 1 ? "business" : "businesses"}). No bidding: each job goes to one qualified shop.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing stuck yet: no parts list has been matched.</p>
          )}
        </Panel>

        <Panel title="Shop replies" icon={Activity} testId="panel-replies">
          {routed ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Count n={replies.accepted} label="accepted" tone="text-assigned" />
                <Count n={replies.waiting} label="waiting" tone="text-foreground" />
                <Count n={replies.declined} label="declined" tone={replies.declined ? "text-destructive" : "text-muted-foreground"} />
              </div>
              {needsAttention.length ? (
                <ul className="flex flex-col gap-2" aria-label="Needs your attention" data-testid="replies-attention">
                  {needsAttention.map((n) => (
                    <li
                      key={n.key}
                      className={cn(
                        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                        n.kind === "declined" ? "border-destructive/30 bg-destructive/5" : "border-sky-200 bg-sky-50/60"
                      )}
                    >
                      {n.kind === "declined" ? (
                        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                      ) : (
                        <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-sky-700" aria-hidden />
                      )}
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span className="font-medium text-foreground">
                            {n.shop} {n.kind === "declined" ? "declined" : "asked about"} {n.jobId}
                          </span>
                          <span className="text-muted-foreground">· {n.detail}</span>
                          {n.simulated ? <SimulatedChip /> : null}
                        </p>
                        <Link
                          href={wp(`/prime/suppliers?job=${encodeURIComponent(n.jobId)}`)}
                          className="self-start font-medium text-slate-800 underline underline-offset-4 hover:text-foreground"
                        >
                          Find another shop
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              {activity.length ? (
                <ul className="flex flex-col gap-1.5" aria-label="Latest activity">
                  {activity.map((it) => (
                    <li key={it.id} className="flex items-start gap-2 text-sm">
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE_DOT[it.tone])} aria-hidden />
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">{it.title}</span>
                        {it.detail ? <span className="text-muted-foreground"> · {it.detail}</span> : null}
                        {it.simulated ? <SimulatedChip className="ml-1.5 align-middle" /> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Inbox className="size-4" aria-hidden /> No replies yet. Shops answer from their phone.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Shops reply once they have offers.</p>
          )}
        </Panel>
      </div>

      <section aria-labelledby="prime-next" className="flex flex-col gap-3">
        <h2 id="prime-next" className="text-lg font-semibold tracking-tight">
          What do you want to do?
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BigAction
            href="/program"
            icon={ClipboardList}
            label={
              routed
                ? `Your parts list: ${assignments.length} of ${jobs.length || assignments.length + blocked.length} matched`
                : "Post a parts list"
            }
            hint={routed ? "See where each job went, on a map" : "Muster splits it into jobs and matches each to a shop"}
            primary={!routed}
          />
          <BigAction href="/prime/suppliers" icon={Search} label="Find suppliers" hint="Small Canadian shops that can make your parts" />
          <BigAction
            href="/gaps"
            icon={Wrench}
            label="Fix the welder gap"
            hint={
              routed && blocked.length
                ? demo.fundedIds.length
                  ? `${blocked.length === 1 ? "1 stuck job" : `${blocked.length} stuck jobs`} · the only certified shop is full`
                  : `${blocked.length === 1 ? "1 stuck job" : `${blocked.length} stuck jobs`} · pay to train welders`
                : "Pay to train welders when shops are short"
            }
            primary={routed && demo.fundedIds.length === 0}
          />
          <BigAction href="/scorecard" icon={Gauge} label="Credit earned" hint="How much of the $500M promise is covered" />
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Northgate Land Systems is fictional. Demo shops are synthetic.{" "}
        <Link href="/m/prime" className="underline underline-offset-4">
          Open Northgate&apos;s phone view
        </Link>
      </p>
    </PortalPage>
  )
}
