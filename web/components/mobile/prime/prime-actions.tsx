"use client"

// /m/prime "What you can do now": the defence company's real actions on a phone.
//   1. Fund welder training (each unfunded suggestion) → confirm sheet → useDemo().fund()
//   2. Shop questions → template replies (engine route if it exists, else recorded here: "Reply sent (demo)")
//   3. Funding requests from shops ("Ask Northgate") → Approve & fund → useDemo().fund()
//   4. Declined jobs → Find another shop (desktop supplier search, which can re-offer the job)
// Works in both modes: fund() and the actions store handle live vs demo data.

import * as React from "react"
import { toast } from "sonner"
import {
  ArrowLeftRight,
  ArrowUpRight,
  CircleCheck,
  CircleHelp,
  CircleX,
  GraduationCap,
  HandCoins,
  Loader2,
  MessageSquareReply,
  Play,
  Wrench,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { CERT_LABEL, fmtMoney } from "@/lib/format"
import { useDemo } from "@/lib/data/store"
import type { TrainingPackage } from "@/lib/api/types"
import { shopInfo, useAppActions } from "@/lib/app/actions-store"
import { declineResolved, useReoffers } from "@/lib/search/reoffers"
import { fmtTime } from "@/lib/app/today"
import { findAnotherShopHref, fundingNeed, shortShopName } from "@/lib/app/feed"
import { replyForDecision, replyTemplates, sendPrimeReply, usePrimeReplies, useSyncRepliesWithRouting } from "@/lib/app/prime-replies"
import { isSimulatedEvent, isSimulatedRecord } from "@/lib/app/sim-flag"
import { extendStrings, t } from "@/lib/app/strings"
import type { FundingRequestRec, OfferDecisionRec } from "@/lib/app/types"
import { Button, buttonVariants } from "@/components/ui/button"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { ShopLabelChip } from "@/components/mobile/shell/m-header"
import { SimulatedChip } from "@/components/mobile/shell/simulation"
import { BottomSheet } from "@/components/mobile/offer/bottom-sheet"
import { NoBreakIds } from "@/components/mobile/prime/activity-item"
import { usePhoneHref } from "@/components/mobile/shell/use-phone-href"
import { TrainingCapNote } from "@/components/scorecard/training-cap"
import type { LedgerResponse } from "@/lib/api/types"
import { AwardsPhoneSection } from "./awards"
import { withBase } from "@/lib/base-path"
import { counterTermsText } from "@/lib/app/sizing"

extendStrings("en", {
  "pa.ctr.title": "Counter-offers",
  "pa.ctr.none": "No counter-offers. Shops can ask for a setup charge or a minimum run instead of saying no.",
  "pa.ctr.row": "{shop} countered on {job}",
  "pa.ctr.accept": "Accept their terms",
  "pa.ctr.keep": "Keep original offer",
  "pa.ctr.demo": "The job's value and credit don't change in this demo.",
  "pa.ctr.accepted": "You accepted the terms · offer accepted",
  "pa.ctr.kept": "You kept the original offer",
  "pa.title": "What you can do now",
  "pa.subtitle": "Northgate Land Systems is a fictional defence company. Shops are synthetic.",
  "pa.notRouted.title": "No work has gone to shops yet",
  "pa.notRouted.body": "Send Northgate's parts list to small Canadian shops. Offers go out and blocked jobs show where training would help.",
  "pa.notRouted.bodyLive": "Send Northgate's parts list to small Canadian shops (shared with the laptop), or fill the demo from the role picker.",
  "pa.notRouted.cta": "Send parts list to shops",
  "pa.notRouted.busy": "Sending…",

  "pa.fund.title": "Fund welder training",
  "pa.fund.subtitle": "Jobs are stuck because shops lack qualified welders. Training fixes that and earns Canada work credit (ITB).",
  "pa.fund.none": "Every suggested training plan is funded.",
  "pa.fund.cert": "Qualify {count} welders under {cert}",
  "pa.fund.apprentice": "Sponsor {count} welding apprentices",
  "pa.fund.costCredit": "{cost} training → {credit} credit ({mult}x)",
  "pa.fund.unblocks": "Unblocks {count} jobs · {value} of work",
  "pa.fund.unblocks_one": "Unblocks 1 job · {value} of work",
  "pa.fund.requested": "Shop asked for this",
  "pa.fund.cta": "Fund welder training",
  "pa.fund.ctaApprentice": "Fund apprentices",
  "pa.fund.funded": "Funded",
  "pa.fund.costNote": "Training cost is a demo estimate (data/rules/training_costs.json).",

  "pa.sheet.title": "Fund {pkg}?",
  "pa.sheet.cost": "You pay (training)",
  "pa.sheet.credit": "Canada work credit (ITB)",
  "pa.sheet.creditMult": "{mult}x · training counts {mult} times",
  "pa.sheet.creditMult10": "10x · Indigenous workforce development",
  "pa.sheet.jobs": "Jobs this unblocks",
  "pa.sheet.jobsValue": "{count} jobs · {value} of work",
  "pa.sheet.jobsValue_one": "1 job · {value} of work",
  "pa.sheet.partner": "Training partner",
  "pa.sheet.creditGloss": "Credit isn't cash. It's how the government counts Northgate's Canadian business toward what it owes. Training counts 5×.",
  "pa.sheet.confirm": "Fund {cost} of training",
  "pa.sheet.busy": "Funding…",
  "pa.toast.funded": "Training funded",

  "pa.q.title": "Shop questions",
  "pa.q.none": "No open questions from shops.",
  "pa.q.row": "{shop} asked a question on {job}",
  // Reply chips and "Reply sent" copy: lib/app/prime-replies.ts (shared with the laptop desk).

  "pa.req.title": "Funding requests",
  "pa.req.none": "No shop has asked for funding.",
  "pa.req.row": "{shop} asked you to fund {requirement} training",
  "pa.req.cta": "Approve & fund",

  "pa.dec.title": "Declined jobs",
  "pa.dec.none": "No declined jobs need a new shop.",
  "pa.dec.row": "{shop} declined {job}: {reason}",
  "pa.dec.detail": "Still counted as placed (demo). Find another shop to send it the job as a new offer.",
  "pa.dec.cta": "Find another shop",
})

const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)

/** A request the demo simulator made (its idempotency key, or a simulated funding_requested event). */
function requestSimulated(r: FundingRequestRec | undefined, events: { kind: string; package_id: string | null }[]): boolean {
  if (!r) return false
  if (isSimulatedRecord(r)) return true
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.kind === "funding_requested" && e.package_id === r.package_id) return isSimulatedEvent(e)
  }
  return false
}

const questionId = (d: OfferDecisionRec) => `q-${d.shop_id}-${d.job_id}`.replace(/[^A-Za-z0-9_-]/g, "_")

function pkgTitle(p: TrainingPackage): string {
  if (p.category === "apprentice_sponsorship") return t("pa.fund.apprentice", { count: p.trainees })
  if (p.cert_unlock) return t("pa.fund.cert", { count: p.trainees, cert: p.cert_unlock === "CWB_W47.1" ? "CSA W47.1" : (CERT_LABEL[p.cert_unlock] ?? p.cert_unlock) })
  return p.title
}

function shopName(id: string, fallback?: string | null): string {
  return shortShopName(shopInfo(id)?.name ?? fallback ?? id) || id
}

function SubHeading({ Icon, title, count }: { Icon: typeof HandCoins; title: string; count?: number }) {
  return (
    <h3 className="flex items-center gap-2 text-base font-semibold">
      <Icon className="size-5 text-muted-foreground" aria-hidden />
      {title}
      {count ? (
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-semibold text-white">{count}</span>
      ) : null}
    </h3>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">{children}</p>
}

const card = "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs"

export function PrimeActions() {
  const demo = useDemo()
  const actions = useAppActions()
  const replies = usePrimeReplies()
  // Declines already sent to another shop (demo re-offer from Find suppliers) leave the list.
  const reoffers = useReoffers()
  const phoneHref = usePhoneHref()
  useSyncRepliesWithRouting(actions.routedAt, actions.ready)
  const [focusId, setFocusId] = React.useState<string | null>(null)
  const [confirm, setConfirm] = React.useState<TrainingPackage | null>(null)
  const [funding, setFunding] = React.useState(false)
  const [headlines, setHeadlines] = React.useState<Record<string, string>>({})
  const [replying, setReplying] = React.useState<string | null>(null)
  const [starting, setStarting] = React.useState(false)

  const routed = demo.stage === "routed" || demo.stage === "funded" || actions.events.some((e) => e.kind === "routed")
  const suggestions = React.useMemo(() => demo.gaps?.suggestions ?? [], [demo.gaps])
  const pkgById = React.useMemo(() => new Map(suggestions.map((p) => [p.id, p])), [suggestions])

  const funded = React.useMemo(() => {
    const s = new Set<string>(demo.fundedIds)
    for (const p of suggestions) if (p.status === "funded") s.add(p.id)
    for (const e of actions.events) if (e.kind === "package_funded" && e.package_id) s.add(e.package_id)
    return s
  }, [demo.fundedIds, suggestions, actions.events])

  const unfunded = suggestions.filter((p) => !funded.has(p.id))
  const fundedPkgs = suggestions.filter((p) => funded.has(p.id))

  const requests = Object.values(actions.fundingRequests)
    .filter((r) => r.status !== "funded" && !funded.has(r.package_id))
    .sort((a, b) => a.at.localeCompare(b.at))

  const decisions = Object.values(actions.decisions)
  const questions = decisions.filter((d) => d.decision === "question").sort((a, b) => b.at.localeCompare(a.at))
  const declined = decisions
    .filter((d) => d.decision === "declined" && !declineResolved(reoffers, d.shop_id, d.job_id))
    .sort((a, b) => b.at.localeCompare(a.at))
  // Counter-offers (docs/api.md §9): open ones first, then the ones already answered.
  const counters = decisions
    .filter((d) => d.decision === "counter" && d.counter)
    .sort((a, b) => Number(!!a.counter?.response) - Number(!!b.counter?.response) || b.at.localeCompare(a.at))

  const answerCounter = async (d: OfferDecisionRec, response: "accepted" | "declined") => {
    const k = `${d.shop_id}:${d.job_id}:counter`
    setReplying(k)
    try {
      const r = await actions.respondToCounter(d.shop_id, d.job_id, response)
      if (r) toast.success(response === "accepted" ? t("pa.ctr.accepted") : t("pa.ctr.kept"), { description: `${d.job_id} · ${shopName(d.shop_id)}` })
    } finally {
      setReplying(null)
    }
  }

  /** Latest event for a shop+job+kind (to show the Simulated chip). */
  const simulatedFor = React.useCallback(
    (d: OfferDecisionRec, kind: string) => {
      for (let i = actions.events.length - 1; i >= 0; i--) {
        const e = actions.events[i]
        if (e.kind === kind && e.shop_id === d.shop_id && e.job_id === d.job_id) return isSimulatedEvent(e)
      }
      return false
    },
    [actions.events]
  )

  const stageRef = React.useRef(demo.stage)
  React.useEffect(() => {
    stageRef.current = demo.stage
  }, [demo.stage])

  const startDemo = async () => {
    setStarting(true)
    const wait = async (ok: () => boolean) => {
      for (let i = 0; i < 40 && !ok(); i++) await new Promise((r) => setTimeout(r, 50))
    }
    try {
      if (demo.stage === "empty") {
        await demo.uploadParts()
        await wait(() => stageRef.current !== "empty")
        if (stageRef.current === "empty") return
      }
      await demo.route()
    } finally {
      setStarting(false)
    }
  }

  const doFund = async (p: TrainingPackage) => {
    setFunding(true)
    try {
      const res = await demo.fund(p.id)
      if (res) {
        setHeadlines((h) => ({ ...h, [p.id]: res.headline }))
        setConfirm(null)
        toast.success(t("pa.toast.funded"), { description: res.headline })
      }
    } finally {
      setFunding(false)
    }
  }

  const reply = async (d: OfferDecisionRec, code: string, text: string) => {
    const k = questionId(d)
    setReplying(k)
    try {
      const engine = demo.mode === "live" && actions.source === "engine" ? demo.apiUrl : null
      const r = await sendPrimeReply(engine, d, code, text)
      if (r.via === "engine") toast.success(t("pa.q.sent"), { description: `“${text}” · ${t("pa.q.sentBody", { shop: shopName(d.shop_id) })}` })
      else toast.success(t("pa.q.sentDemo"), { description: t("pa.q.sentDemoBody") })
      setFocusId(k)
    } catch (e) {
      toast.error(t("pa.q.failed"), { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setReplying(null)
    }
  }

  // After a reply, move focus to the card's result line (the buttons it replaced are gone).
  React.useEffect(() => {
    if (!focusId) return
    const el = document.getElementById(`${focusId}-result`)
    if (el) {
      el.focus()
      queueMicrotask(() => setFocusId(null))
    }
  }, [focusId, replies, actions.decisions])

  const loading = !demo.ready || !actions.ready

  return (
    <section aria-labelledby="now-title" className="flex flex-col gap-4" data-testid="prime-actions">
      <div>
        <h2 id="now-title" className="text-xl font-semibold tracking-tight">
          {t("pa.title")}
        </h2>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {t("pa.subtitle")}
          <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium">{t("label.simplifiedItb")}</span>
        </p>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" aria-hidden />
      ) : !routed ? (
        <div className={card}>
          <p className="text-base font-semibold">{t("pa.notRouted.title")}</p>
          <p className="text-sm text-muted-foreground">{demo.mode === "live" ? t("pa.notRouted.bodyLive") : t("pa.notRouted.body")}</p>
          <Button size="touch-lg" className="w-full" disabled={starting || !!demo.busy} onClick={() => void startDemo()} data-testid="prime-start">
            {starting ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Play className="size-5" aria-hidden />}
            {starting ? t("pa.notRouted.busy") : t("pa.notRouted.cta")}
          </Button>
        </div>
      ) : (
        <>
          {/* 1. Fund welder training */}
          <div className="flex flex-col gap-2" data-testid="pa-fund">
            <SubHeading Icon={GraduationCap} title={t("pa.fund.title")} count={unfunded.length} />
            <p className="text-sm text-muted-foreground">{t("pa.fund.subtitle")}</p>
            {unfunded.length === 0 && fundedPkgs.length > 0 ? <Hint>{t("pa.fund.none")}</Hint> : null}
            {unfunded.map((p) => {
              const askedRec = Object.values(actions.fundingRequests).find((r) => r.package_id === p.id)
              const asked = !!askedRec
              return (
                <div key={p.id} className={card} data-testid="fund-card" data-pkg={p.id}>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{p.id}</span>
                    <span aria-hidden>·</span>
                    <span>{shopName(p.shop_id, p.shop_name)}</span>
                    <ShopLabelChip source={p.shop_source} />
                    {asked ? (
                      <span className="inline-flex h-6 items-center gap-1 rounded-full bg-brand/10 px-2 text-xs font-medium text-brand">
                        <HandCoins className="size-3.5" aria-hidden />
                        {t("pa.fund.requested")}
                      </span>
                    ) : null}
                    {asked && requestSimulated(askedRec, actions.events) ? <SimulatedChip /> : null}
                  </div>
                  <p className="text-base leading-snug font-semibold">{pkgTitle(p)}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-lg leading-snug font-semibold tabular-nums">
                    {t("pa.fund.costCredit", {
                      cost: fmtMoney(p.est_cost_cad, { compact: true }),
                      credit: fmtMoney(p.est_credit_cad, { compact: true }),
                      mult: p.multiplier,
                    })}
                    <AssumptionTag note={t("pa.fund.costNote")} />
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("pa.fund.unblocks", { count: p.blocked_job_ids.length, value: fmtMoney(p.unblocks_value_cad, { compact: true }) })}
                  </p>
                  <Button size="touch-lg" className="w-full" onClick={() => setConfirm(p)} data-testid="fund-open">
                    <Wrench className="size-5" aria-hidden />
                    {p.category === "apprentice_sponsorship" ? t("pa.fund.ctaApprentice") : t("pa.fund.cta")}
                  </Button>
                </div>
              )
            })}
            {fundedPkgs.map((p) => (
              <div key={p.id} className="flex items-start gap-3 rounded-xl border border-assigned/25 bg-assigned-soft p-3 text-assigned" data-testid="funded-card">
                <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold">
                    {t("pa.fund.funded")} · {p.id} · {pkgTitle(p)}
                  </p>
                  <p className="mt-0.5 text-sm break-words text-foreground/80">
                    {headlines[p.id] ?? demo.fundResults[p.id]?.headline ?? `${shopName(p.shop_id, p.shop_name)}`}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* 2. Shop questions */}
          <div className="flex flex-col gap-2" data-testid="pa-questions">
            <SubHeading Icon={CircleHelp} title={t("pa.q.title")} count={questions.filter((d) => !replyForDecision(d, replies)).length} />
            {questions.length === 0 ? <Hint>{t("pa.q.none")}</Hint> : null}
            {questions.map((d) => {
              const k = questionId(d)
              const done = replyForDecision(d, replies)
              return (
                <div key={k} className={card} data-testid="question-card">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-base leading-snug font-semibold">
                      <NoBreakIds text={t("pa.q.row", { shop: shopName(d.shop_id), job: d.job_id })} />
                    </p>
                    <time dateTime={d.at} className="shrink-0 text-sm text-muted-foreground tabular-nums">
                      {fmtTime(d.at)}
                    </time>
                  </div>
                  <p className="text-sm break-words text-muted-foreground">
                    “{d.note || (d.question_code ? t(`question.${d.question_code}`) : t("reason.other"))}”
                    {d.note && d.question_code ? (
                      <span className="block text-xs">{t("feed.question.topic", { question: lower(t(`question.${d.question_code}`)) })}</span>
                    ) : null}
                  </p>
                  {isSimulatedRecord(d) || simulatedFor(d, "offer_question") ? <SimulatedChip className="self-start" /> : null}
                  {done ? (
                    <p
                      id={`${k}-result`}
                      tabIndex={-1}
                      className="flex items-start gap-2 rounded-lg border border-assigned/25 bg-assigned-soft px-3 py-2 text-sm text-assigned outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <MessageSquareReply className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        <span className="font-semibold">{done.via === "engine" ? t("pa.q.sent") : t("pa.q.sentDemo")}:</span> “{done.text}”
                      </span>
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                      {replyTemplates(d.question_code).map(({ code, text }) => (
                        <Button
                          key={code}
                          size="touch"
                          variant="outline"
                          className="h-auto min-h-12 whitespace-normal"
                          disabled={replying === k}
                          onClick={() => void reply(d, code, text)}
                          data-testid="reply-template"
                        >
                          {text}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 2b. Counter-offers (setup charge / minimum run) */}
          <div className="flex flex-col gap-2" data-testid="pa-counters">
            <SubHeading Icon={ArrowLeftRight} title={t("pa.ctr.title")} count={counters.filter((d) => !d.counter?.response).length} />
            {counters.length === 0 ? <Hint>{t("pa.ctr.none")}</Hint> : null}
            {counters.map((d) => {
              const k = `${d.shop_id}:${d.job_id}:counter`
              return (
                <div key={k} className={card} data-testid="counter-card">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-base leading-snug font-semibold">
                      <NoBreakIds text={t("pa.ctr.row", { shop: shopName(d.shop_id), job: d.job_id })} />
                    </p>
                    <time dateTime={d.at} className="shrink-0 text-sm text-muted-foreground tabular-nums">
                      {fmtTime(d.at)}
                    </time>
                  </div>
                  <p className="text-sm text-foreground">{counterTermsText(d.counter)}</p>
                  {d.note ? <p className="text-sm break-words text-muted-foreground">“{d.note}”</p> : null}
                  {d.counter?.response ? (
                    <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">{t("pa.ctr.kept")}</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                        <Button size="touch" className="bg-emerald-700 text-white hover:bg-emerald-800" disabled={replying === k} onClick={() => void answerCounter(d, "accepted")}>
                          {t("pa.ctr.accept")}
                        </Button>
                        <Button size="touch" variant="outline" disabled={replying === k} onClick={() => void answerCounter(d, "declined")}>
                          {t("pa.ctr.keep")}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">{t("pa.ctr.demo")}</p>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* 3. Funding requests */}
          <div className="flex flex-col gap-2" data-testid="pa-requests">
            <SubHeading Icon={HandCoins} title={t("pa.req.title")} count={requests.length} />
            {requests.length === 0 ? <Hint>{t("pa.req.none")}</Hint> : null}
            {requests.map((r) => {
              const p = pkgById.get(r.package_id) ?? null
              return (
                <div key={r.package_id} className={card} data-testid="request-card">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-base leading-snug font-semibold">
                      <NoBreakIds text={t("pa.req.row", { shop: shopName(r.shop_id), requirement: fundingNeed(r.requirement) })} />
                    </p>
                    <time dateTime={r.at} className="shrink-0 text-sm text-muted-foreground tabular-nums">
                      {fmtTime(r.at)}
                    </time>
                  </div>
                  {p ? (
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {r.package_id} ·{" "}
                      {t("pa.fund.costCredit", {
                        cost: fmtMoney(p.est_cost_cad, { compact: true }),
                        credit: fmtMoney(p.est_credit_cad, { compact: true }),
                        mult: p.multiplier,
                      })}
                    </p>
                  ) : null}
                  {requestSimulated(r, actions.events) ? <SimulatedChip className="self-start" /> : null}
                  <Button size="touch-lg" className="w-full" disabled={!p || r.pending} onClick={() => p && setConfirm(p)} data-testid="request-approve">
                    <CircleCheck className="size-5" aria-hidden />
                    {t("pa.req.cta")}
                  </Button>
                </div>
              )
            })}
          </div>

          {/* 4. Declined jobs */}
          <div className="flex flex-col gap-2" data-testid="pa-declined">
            <SubHeading Icon={CircleX} title={t("pa.dec.title")} count={declined.length} />
            {declined.length === 0 ? <Hint>{t("pa.dec.none")}</Hint> : null}
            {declined.map((d) => (
              <div key={`${d.shop_id}:${d.job_id}`} className={card} data-testid="declined-card">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-base leading-snug font-semibold">
                    <NoBreakIds text={t("pa.dec.row", {
                      shop: shopName(d.shop_id),
                      job: d.job_id,
                      reason: lower(t(`reason.${d.reason_code ?? "other"}`)),
                    })} />
                  </p>
                  <time dateTime={d.at} className="shrink-0 text-sm text-muted-foreground tabular-nums">
                    {fmtTime(d.at)}
                  </time>
                </div>
                {d.note ? <p className="text-sm break-words text-muted-foreground">“{d.note}”</p> : null}
                <p className="text-sm text-muted-foreground">{t("pa.dec.detail")}</p>
                {isSimulatedRecord(d) || simulatedFor(d, "offer_declined") ? <SimulatedChip className="self-start" /> : null}
                <a
                  href={withBase(phoneHref(`${findAnotherShopHref(d.job_id)}&from=m`))}
                  className={cn(buttonVariants({ variant: "outline", size: "touch" }), "w-full")}
                  data-testid="find-another"
                >
                  {t("pa.dec.cta")}
                  <ArrowUpRight className="size-5" aria-hidden />
                </a>
              </div>
            ))}
          </div>

          {/* 5. Paperwork and kickoff calls for accepted jobs */}
          <AwardsPhoneSection />
        </>
      )}

      <FundSheet pkg={confirm} busy={funding} ledger={demo.ledger} onClose={() => setConfirm(null)} onConfirm={(p) => void doFund(p)} />
    </section>
  )
}


function Row({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2.5 last:border-b-0">
      <span className="text-base text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className="block text-base font-semibold tabular-nums">{value}</span>
        {sub ? <span className="block text-sm text-muted-foreground">{sub}</span> : null}
      </span>
    </div>
  )
}

/** Confirm sheet: cost → credit, what it unblocks, the partner example, then Fund. */
function FundSheet({
  pkg,
  busy,
  ledger,
  onClose,
  onConfirm,
}: {
  pkg: TrainingPackage | null
  busy: boolean
  /** For the training-credit cap line (null before the ledger loads: the line is left out). */
  ledger: LedgerResponse | null
  onClose: () => void
  onConfirm: (p: TrainingPackage) => void
}) {
  // Keep the last package while the sheet animates closed.
  const [last, setLast] = React.useState<TrainingPackage | null>(pkg)
  if (pkg && pkg !== last) setLast(pkg)
  const p = pkg ?? last
  return (
    <BottomSheet
      open={pkg !== null}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      title={p ? t("pa.sheet.title", { pkg: p.id }) : ""}
      description={p ? pkgTitle(p) : undefined}
      footer={
        p ? (
          <Button size="touch-lg" className="w-full" disabled={busy} onClick={() => onConfirm(p)} data-testid="fund-confirm">
            {busy ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden /> : <CircleCheck className="size-5" aria-hidden />}
            {busy ? t("pa.sheet.busy") : t("pa.sheet.confirm", { cost: fmtMoney(p.est_cost_cad, { compact: true }) })}
          </Button>
        ) : null
      }
    >
      {p ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-border px-3">
            <Row
              label={t("pa.sheet.cost")}
              value={
                <span className="inline-flex items-center gap-1.5">
                  {fmtMoney(p.est_cost_cad, { compact: true })}
                  <AssumptionTag note={t("pa.fund.costNote")} />
                </span>
              }
            />
            <Row
              label={t("pa.sheet.credit")}
              value={fmtMoney(p.est_credit_cad, { compact: true })}
              sub={p.multiplier === 10 ? t("pa.sheet.creditMult10") : t("pa.sheet.creditMult", { mult: p.multiplier })}
            />
            <Row
              label={t("pa.sheet.jobs")}
              value={t("pa.sheet.jobsValue", { count: p.blocked_job_ids.length, value: fmtMoney(p.unblocks_value_cad, { compact: true }) })}
              sub={p.blocked_job_ids.join(", ")}
            />
            <Row label={t("pa.sheet.partner")} value={<span className="text-sm font-medium">{p.recipient_example}</span>} />
          </div>
          <p className="text-sm text-muted-foreground">{p.eligibility_note}</p>
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">{t("pa.sheet.creditGloss")}</p>
          {ledger ? (
            <TrainingCapNote ledger={ledger} extraCredit={p.est_credit_cad} mode="wouldUse" rulesLabel={t("label.simplifiedItb")} className="text-muted-foreground" />
          ) : (
            <p className="text-xs text-muted-foreground">{t("label.simplifiedItb")}</p>
          )}
        </div>
      ) : null}
    </BottomSheet>
  )
}
