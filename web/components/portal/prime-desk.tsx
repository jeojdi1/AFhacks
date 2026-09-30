"use client"

// /prime: "Northgate's desk" (supplier development at the fictional prime).
// Promise meter, stuck jobs, shop replies and the four big next steps.
// All numbers come from useDemo() and the phone app's actions store.

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Activity,
  ArrowLeftRight,
  Check,
  ClipboardList,
  FilePen,
  Gauge,
  Inbox,
  Lightbulb,
  Loader2,
  MessageCircleQuestion,
  MessageSquareReply,
  Search,
  TriangleAlert,
  Wrench,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { decisionKey, useAppActions } from "@/lib/app/actions-store"
import { declineResolved, useReoffers } from "@/lib/search/reoffers"
import { feedItems, type FeedContext, type FeedTone } from "@/lib/app/feed"
import { replyForDecision, replyTemplates, sendPrimeReply, usePrimeReplies, useSyncRepliesWithRouting } from "@/lib/app/prime-replies"
import { isSimulatedEvent, isSimulatedRecord } from "@/lib/app/sim-flag"
import type { CounterResponseKind, OfferDecisionRec } from "@/lib/app/types"
import { t } from "@/lib/app/strings"
import { counterTermsText } from "@/lib/app/sizing"
import { prefsFor, usePreferenceOverrides } from "@/lib/app/preferences"
import { declineInsights, insightMoney, type InsightRow } from "@/lib/app/decline-insights"
import { fmtMoney } from "@/lib/format"
import { SimulatedChip } from "@/components/mobile/shell/simulation"
import { Button } from "@/components/ui/button"
import { PortalPage, Panel, BigAction } from "./portal-page"
import { InfoTip, JobDots, PromiseRing, ReplyTile, WeldArt } from "./desk-art"
import { StartDemo, useRouted } from "./start-demo"
import { useWithParams } from "@/lib/ui/use-with-params"
import { AwardsDeskList } from "@/components/mobile/prime/awards"

const OBLIGATION_FALLBACK = 500_000_000

interface AttentionRow {
  key: string
  jobId: string
  shop: string
  kind: "declined" | "question" | "counter"
  /** Reason (declines), question topic, or counter-offer terms. */
  detail: string
  /** The shop's own words (the decision note), e.g. "Can delivery start in November?". */
  note: string | null
  simulated: boolean
  decision: OfferDecisionRec
}

const TONE_DOT: Record<FeedTone, string> = {
  success: "bg-assigned",
  warn: "bg-blocked",
  danger: "bg-destructive",
  info: "bg-slate-400",
  action: "bg-public",
}

/** One insight: "2 shops · Job too small for us (NG-002, NG-022)" → the plain fix. */
function InsightItem({ row, lead }: { row: InsightRow; lead: string }) {
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" data-insight={row.code}>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-medium text-foreground">{lead}</span>
        <span className="text-muted-foreground">
          · {row.jobIds.join(", ")} · {insightMoney(row.value)} of work
        </span>
      </p>
      <p className="flex items-start gap-1.5 text-slate-700">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
        {row.suggestion}
      </p>
    </li>
  )
}

function WhyShopsSaidNo({ why }: { why: ReturnType<typeof declineInsights> }) {
  const empty = !why.declines.length && !why.counters.length && !why.belowMinimum
  if (empty) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="why-empty">
        <Inbox className="size-4" aria-hidden /> No shop has said no yet. When one does, its reason and a fix show up here.
      </p>
    )
  }
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  return (
    <div className="flex flex-col gap-3">
      {why.declines.length ? (
        <section aria-label="Decline reasons" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Declined</h3>
          <ul className="flex flex-col gap-2">
            {why.declines.map((r) => (
              <InsightItem key={r.code} row={r} lead={`${n(r.count, "shop said", "shops said")}: ${r.label.toLowerCase()}`} />
            ))}
          </ul>
        </section>
      ) : null}
      {why.counters.length ? (
        <section aria-label="Counter-offers" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Said yes, if…</h3>
          <ul className="flex flex-col gap-2">
            {why.counters.map((r) => (
              <InsightItem
                key={r.code}
                row={r}
                lead={`${n(r.count, "shop", "shops")} ${r.label.toLowerCase()}${
                  r.setupTotal ? ` (${insightMoney(r.setupTotal)} in all)` : ""
                }`}
              />
            ))}
          </ul>
        </section>
      ) : null}
      {why.belowMinimum ? (
        <section aria-label="Offers below the shop's minimum" className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            Too small for the shop
            <InfoTip label="How this is worked out">
              Each offer&apos;s value is spread over 8 years (the fleet lifetime, an assumption) and compared with the
              smallest yearly amount the shop says is worth its time. Demo shops&apos; minimums are illustrative.
            </InfoTip>
          </h3>
          <ul className="flex flex-col gap-2">
            <InsightItem
              row={why.belowMinimum}
              lead={`${n(why.belowMinimum.count, "offer is", "offers are")} below the shop's own yearly minimum`}
            />
          </ul>
        </section>
      ) : null}
    </div>
  )
}

export function PrimeDesk() {
  const demo = useDemo()
  const wp = useWithParams()
  const actions = useAppActions()
  const routed = useRouted()
  // Declines Northgate already sent to another shop (demo re-offer) leave the list.
  const reoffers = useReoffers()
  const primeReplies = usePrimeReplies()
  useSyncRepliesWithRouting(actions.routedAt, actions.ready)
  const [replying, setReplying] = React.useState<string | null>(null)
  const repliesRef = React.useRef<HTMLDivElement>(null)
  const { ledger, program, assignments, blocked, jobs, gaps, offerStatus } = demo
  const prefOverrides = usePreferenceOverrides()

  // Why shops said no (docs/api.md §9): decline reasons, counter terms, and placed offers
  // below the shop's own minimum, each with a plain suggestion.
  const why = React.useMemo(
    () => declineInsights(Object.values(actions.decisions), assignments, (id) => prefsFor(null, id, prefOverrides)),
    [actions.decisions, assignments, prefOverrides]
  )

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

  // Declines and unanswered questions need Northgate's attention: pinned above the activity list.
  // A question leaves the list once Northgate replies (engine decision.reply or a reply recorded here).
  const needsAttention = React.useMemo(() => {
    const byJob = new Map(assignments.map((a) => [decisionKey(a.shop_id, a.job_id), a]))
    const out: AttentionRow[] = []
    for (const [key, d] of Object.entries(actions.decisions)) {
      const a = byJob.get(key)
      if (!a || (d.decision !== "declined" && d.decision !== "question" && d.decision !== "counter")) continue
      if (d.decision === "declined" && declineResolved(reoffers, d.shop_id, d.job_id)) continue
      if (d.decision === "question" && replyForDecision(d, primeReplies)) continue
      // A counter-offer leaves the list once Northgate answers it.
      if (d.decision === "counter" && (!d.counter || d.counter.response)) continue
      const evKind = d.decision === "declined" ? "offer_declined" : d.decision === "question" ? "offer_question" : "offer_countered"
      let simulated = isSimulatedRecord(d)
      for (let i = actions.events.length - 1; i >= 0; i--) {
        const e = actions.events[i]
        if (e.kind === evKind && e.shop_id === d.shop_id && e.job_id === d.job_id) {
          simulated ||= isSimulatedEvent(e)
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
            : d.decision === "counter"
              ? counterTermsText(d.counter)
              : d.question_code
                ? t(`question.${d.question_code}`)
                : "question",
        note: d.note?.trim() || null,
        simulated,
        decision: d,
      })
    }
    // Declines first, then counter-offers, then questions; by job id.
    const rank = { declined: 0, counter: 1, question: 2 } as const
    return out.sort((x, y) => rank[x.kind] - rank[y.kind] || x.jobId.localeCompare(y.jobId))
  }, [assignments, actions.decisions, actions.events, primeReplies, reoffers])

  // Accept the shop's terms (the offer is accepted) or keep the original offer. Terms are
  // recorded only: value, credit and the ledger never change (demo).
  const answerCounter = async (n: AttentionRow, response: CounterResponseKind) => {
    setReplying(n.key)
    try {
      const r = await actions.respondToCounter(n.decision.shop_id, n.jobId, response)
      if (!r) return
      if (response === "accepted") toast.success(`You accepted ${n.shop}'s terms on ${n.jobId}`, { description: `${n.detail}. The offer is accepted.` })
      else toast.message(`You kept your original offer on ${n.jobId}`, { description: `${n.shop} can still accept or decline it.` })
      requestAnimationFrame(() => repliesRef.current?.focus({ preventScroll: true }))
    } finally {
      setReplying(null)
    }
  }

  // Same send path as /m/prime: the engine's reply route when live, else recorded on this device.
  const reply = async (n: AttentionRow, code: string, text: string) => {
    setReplying(n.key)
    try {
      const engine = demo.mode === "live" && actions.source === "engine" ? demo.apiUrl : null
      const r = await sendPrimeReply(engine, n.decision, code, text)
      if (r.via === "engine") toast.success(t("pa.q.sent"), { description: `“${text}” · ${t("pa.q.sentBody", { shop: n.shop })}` })
      else toast.success(t("pa.q.sentDemo"), { description: t("pa.q.sentDemoBody") })
      // The row (and the button that had focus) is gone: keep focus in the panel.
      requestAnimationFrame(() => repliesRef.current?.focus({ preventScroll: true }))
    } catch (e) {
      toast.error(t("pa.q.failed"), { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setReplying(null)
    }
  }

  /** Activity rows for questions Northgate has answered get a "Replied" tag. */
  const repliedQuestion = (shopId: string | null, jobId: string | null): boolean => {
    if (!shopId || !jobId) return false
    return !!replyForDecision(actions.decisions[decisionKey(shopId, jobId)], primeReplies)
  }

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
        <span className="inline-flex items-center gap-1">
          A {fmtMoney(program?.obligation_cad ?? OBLIGATION_FALLBACK, { compact: true })} promise to Canada, at a glance.
          <InfoTip label="What is this desk?">
            Northgate won a {fmtMoney(program?.obligation_cad ?? OBLIGATION_FALLBACK, { compact: true })} defence contract
            and promised Canada the same amount of business. This desk shows how much is covered, which jobs are stuck,
            and what the small shops said.
          </InfoTip>
        </span>
      }
    >
      <Panel title="The promise" icon={Gauge} action={{ label: "Credit earned", href: "/scorecard" }} testId="panel-promise">
        <PromiseRing ledger={routed ? ledger : null} obligation={program?.obligation_cad ?? OBLIGATION_FALLBACK} />
      </Panel>

      {!routed ? (
        <StartDemo message="Northgate hasn't posted a parts list yet. Load its 40-part list and Shieldworks matches each job to one qualified small shop (about 5 seconds)." />
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Stuck jobs"
          icon={TriangleAlert}
          action={routed ? { label: "Fix the welder gap", href: "/gaps" } : null}
          testId="panel-stuck"
        >
          {routed ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <WeldArt className={blocked.length ? undefined : "opacity-40"} />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex items-baseline gap-2">
                    <strong
                      className={cn("text-5xl leading-none font-semibold tabular-nums", blocked.length ? "text-blocked" : "text-assigned")}
                      data-testid="stuck-count"
                    >
                      {blocked.length}
                    </strong>
                    <span className="text-lg text-slate-700">{blocked.length === 1 ? "job is" : "jobs are"} stuck</span>
                  </p>
                  {blocked.length ? (
                    <p className="text-[0.95rem] text-slate-700">
                      {fmtMoney(stuckValue, { compact: true })} of work · no welders free
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2.5">
                <JobDots matched={assignments.length} total={jobs.length || assignments.length + blocked.length} />
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  {assignments.length} of {jobs.length || assignments.length + blocked.length} matched · {shops} Canadian shops (
                  {smeShops} small {smeShops === 1 ? "business" : "businesses"})
                  <InfoTip label="How jobs are matched">
                    No bidding: each job goes to one qualified shop. A job is stuck when no qualified shop has welders free.
                  </InfoTip>
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing stuck yet: no parts list has been matched.</p>
          )}
        </Panel>

        <Panel title="Shop replies" icon={Activity} testId="panel-replies">
          {routed ? (
            <div ref={repliesRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
              <div className="grid grid-cols-3 gap-2">
                <ReplyTile kind="accepted" n={replies.accepted} />
                <ReplyTile kind="waiting" n={replies.waiting} />
                <ReplyTile kind="declined" n={replies.declined} />
              </div>
              {needsAttention.length ? (
                <ul className="flex flex-col gap-2" aria-label="Needs your attention" data-testid="replies-attention">
                  {needsAttention.map((n) => (
                    <li
                      key={n.key}
                      className={cn(
                        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                        n.kind === "declined"
                          ? "border-destructive/30 bg-destructive/5"
                          : n.kind === "counter"
                            ? "border-violet-200 bg-violet-50/60"
                            : "border-sky-200 bg-sky-50/60"
                      )}
                      data-attention-kind={n.kind}
                    >
                      {n.kind === "declined" ? (
                        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                      ) : n.kind === "counter" ? (
                        <ArrowLeftRight className="mt-0.5 size-4 shrink-0 text-violet-700" aria-hidden />
                      ) : (
                        <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-sky-700" aria-hidden />
                      )}
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span className="font-medium text-foreground">
                            {n.shop} {n.kind === "declined" ? "declined" : n.kind === "counter" ? "countered on" : "asked about"} {n.jobId}
                          </span>
                          <span className="text-muted-foreground">· {n.detail}</span>
                          {n.simulated ? <SimulatedChip /> : null}
                        </p>
                        {n.kind === "counter" ? (
                          <>
                            {n.note ? <p className="break-words text-slate-700">“{n.note}”</p> : null}
                            <div className="flex flex-wrap gap-2" role="group" aria-label={`Answer ${n.shop}'s counter-offer on ${n.jobId}`}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-auto min-h-8 border-emerald-300 bg-white py-1 text-emerald-800 hover:bg-emerald-50"
                                disabled={replying === n.key}
                                aria-busy={replying === n.key || undefined}
                                onClick={() => void answerCounter(n, "accepted")}
                                data-testid="desk-counter-accept"
                              >
                                {replying === n.key ? (
                                  <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                                ) : (
                                  <Check className="size-3.5" aria-hidden />
                                )}
                                Accept their terms
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-auto min-h-8 bg-white py-1"
                                disabled={replying === n.key}
                                onClick={() => void answerCounter(n, "declined")}
                                data-testid="desk-counter-keep"
                              >
                                Keep original offer
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">The job&apos;s value and credit don&apos;t change in this demo.</p>
                          </>
                        ) : n.kind === "question" ? (
                          <>
                            {n.note ? <p className="break-words text-slate-700" data-testid="question-note">“{n.note}”</p> : null}
                            <div className="flex flex-wrap gap-2" role="group" aria-label={`Reply to ${n.shop} about ${n.jobId}`}>
                              {replyTemplates(n.decision.question_code).map(({ code, text }) => (
                                <Button
                                  key={code}
                                  size="sm"
                                  variant="outline"
                                  className="h-auto min-h-8 bg-white py-1 whitespace-normal"
                                  disabled={replying === n.key}
                                  aria-busy={replying === n.key || undefined}
                                  onClick={() => void reply(n, code, text)}
                                  data-testid="desk-reply-template"
                                >
                                  {replying === n.key ? (
                                    <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                                  ) : (
                                    <MessageSquareReply className="size-3.5" aria-hidden />
                                  )}
                                  {text}
                                </Button>
                              ))}
                            </div>
                          </>
                        ) : (
                          <>
                            {n.note ? <p className="break-words text-slate-700">“{n.note}”</p> : null}
                            <Link
                              href={wp(`/prime/suppliers?job=${encodeURIComponent(n.jobId)}`)}
                              className="self-start font-medium text-slate-800 underline underline-offset-4 hover:text-foreground"
                            >
                              Find another shop
                            </Link>
                          </>
                        )}
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
                        {it.kind === "offer_question" && repliedQuestion(it.shop_id, it.job_id) ? (
                          <span
                            className="ml-1.5 inline-flex h-6 items-center gap-1 rounded-full bg-assigned-soft px-2 align-middle text-xs font-medium text-assigned"
                            data-testid="activity-replied"
                          >
                            <MessageSquareReply className="size-3.5" aria-hidden />
                            Replied
                          </span>
                        ) : null}
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
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Shops reply once they have offers.</p>
          )}
        </Panel>
      </div>

      {routed ? (
        <Panel
          title={
            <>
              Why shops said no
              <InfoTip label="About this panel">
                Small shops told us they skip jobs worth under about $100K a year, and quote a setup charge or a
                minimum run for small orders. This panel groups what your shops said, with one fix for each.
              </InfoTip>
            </>
          }
          icon={Lightbulb}
          testId="panel-why-no"
        >
          <WhyShopsSaidNo why={why} />
        </Panel>
      ) : null}

      {routed ? (
        <Panel
          title={
            <>
              Awards in progress
              <InfoTip label="About awards">
                When a shop accepts, it signs the job&apos;s paperwork and books a kickoff call with Northgate. Nothing here
                changes the credit numbers.
              </InfoTip>
            </>
          }
          icon={FilePen}
          testId="panel-awards"
        >
          <AwardsDeskList withParams={wp} />
        </Panel>
      ) : null}

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
            hint={routed ? "See where each job went, on a map" : "Shieldworks splits it into jobs and matches each to a shop"}
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
