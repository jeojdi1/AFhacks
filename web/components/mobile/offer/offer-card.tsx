"use client"

import * as React from "react"
import { toast } from "sonner"
import Link from "next/link"
import { Check, CircleHelp, Clock, Eye, FileLock2, Lock, MapPin, MessageSquareReply, Send, ShieldCheck, Wallet, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { MATERIAL_LABEL, PROCESS_LABEL, fmtKm, fmtMoney, label } from "@/lib/format"
import { useShopBundle } from "@/lib/app/shop-bundle"
import { useConnection } from "@/lib/app/connection"
import { UnreachableNotice } from "@/components/mobile/shell/unreachable-notice"
import { fitChecklist, isInTrainingReason, plainReason, type AcceptedJobLoad } from "@/lib/app/fit"
import { shopInfo } from "@/lib/app/actions-store"
import { shortShopName } from "@/lib/app/feed"
import { replyForDecision, usePrimeReplies } from "@/lib/app/prime-replies"
import { isSimulatedRecord } from "@/lib/app/sim-flag"
import { useFromPrimeState } from "@/components/mobile/shell/use-from-prime"
import { SimulatedChip } from "@/components/mobile/shell/simulation"
import { certPlain } from "@/lib/ui/plain"
import { GENERIC_TRADE, isWeldingTrade, tradeForCert } from "@/lib/trades"
import { fmtDateTime, fmtWeekday } from "@/lib/app/today"
import { t } from "@/lib/app/strings"
import type { QuestionCode, ReasonCode } from "@/lib/app/types"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/muster/empty-state"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { FitChecklist } from "./fit-checklist"
import { DecisionBar } from "./decision-bar"
import { DeclineSheet } from "./decline-sheet"
import { AskSheet } from "./ask-sheet"
import {
  DecisionChip,
  NewChip,
  ReplyByChip,
  WillSendChip,
  offerState,
  questionText,
  reasonText,
  replyByFrom,
  routedAtFrom,
  useNewOfferIds,
  type OfferState,
} from "./shared"
import "./strings"
import { useGoToAward } from "@/components/award/use-go-to-award"
import { AwardLink } from "@/components/award/award-link"

/**
 * /m/shops/[id]/offers/[jobId]: "can we do it, is it worth it, what's the
 * catch" on one screen, then Accept · Decline · Ask Northgate.
 *
 * Opened by the defence company from its feed (?from=prime), the card is read-only:
 * no Accept / Decline / Ask / Change answer / Send to estimator, a status line with the
 * shop's answer instead, and copy addressed to Northgate ("You offered this job only to …").
 */
export function OfferCard({ shopId, jobId }: { shopId: string; jobId: string }) {
  const { stage, ready } = useDemo()
  const { unreachable } = useConnection()
  const b = useShopBundle(shopId)
  const [busy, setBusy] = React.useState(false)
  const [sheet, setSheet] = React.useState<"decline" | "ask" | null>(null)

  const offer = b.offers.find((o) => o.job_id === jobId) ?? null
  const job = b.jobsById[jobId] ?? null
  const assignment = b.assignmentsById[jobId]?.shop_id === shopId ? b.assignmentsById[jobId] : null
  const decision = b.actions.decisions[jobId] ?? null
  const state = offer ? offerState(offer, decision) : "open"
  const newIds = useNewOfferIds(b.certs, b.jobsById, b.offers)
  const replyBy = replyByFrom(routedAtFrom(b.actions.routedAt, b.actions.events))
  const prime = offer?.prime_name?.split(" ")[0] || "Northgate"
  const { fromPrime, known: viewKnown } = useFromPrimeState()
  const shopName = shortShopName(b.detail?.shop.name ?? shopInfo(shopId)?.name ?? shopId) || shopId
  const simulated = !!decision && isSimulatedRecord(decision)
  const localReplies = usePrimeReplies()
  const reply = replyForDecision(decision, localReplies)

  const fit = React.useMemo(() => {
    if (!job || !b.shop) return null
    let load = 0
    let n = 0
    const accepted: AcceptedJobLoad[] = []
    for (const o of b.offers) {
      if (o.job_id === jobId) continue
      const d = b.actions.decisions[o.job_id]
      if (offerState(o, d) === "accepted") {
        load += o.hours_week
        n += 1
        accepted.push({
          job_id: o.job_id,
          hours_week: o.hours_week,
          process_tags: b.jobsById[o.job_id]?.process_tags ?? [],
          accepted_at: d?.decision === "accepted" ? d.at : null,
        })
      }
    }
    return fitChecklist(job, b.shop, b.certs, load, {
      confirmedCapacity: b.actions.capacity ?? null,
      acceptedJobs: accepted,
      acceptedCount: n,
    })
  }, [job, b.shop, b.offers, b.certs, b.actions.decisions, b.actions.capacity, b.jobsById, jobId])

  const decide = b.actions.decide
  const goToAward = useGoToAward(true)

  const run = React.useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true)
      try {
        return await fn()
      } finally {
        setBusy(false)
      }
    },
    []
  )

  const accept = () =>
    void run(async () => {
      const r = await decide(jobId, { decision: "accepted" })
      // Queued offline: the outbox toast ("Saved on this phone") already says so;
      // "Northgate sees it now" would be false.
      if (!r || r.pending) return
      toast.success(t("o.toast.accepted"), {
        description: t("o.toast.acceptedBody", { prime }),
      })
      goToAward(shopId, jobId)
    })

  const decline = (reason: ReasonCode, note: string | null) =>
    void run(async () => {
      const r = await decide(jobId, { decision: "declined", reason_code: reason, note })
      if (!r) return
      setSheet(null)
      if (r.pending) return
      toast.message(t("o.toast.declined", { reason: t(`reason.${reason}`).toLowerCase() }), {
        description: t("o.toast.declinedBody", { prime }),
      })
    })

  const ask = (q: QuestionCode) =>
    void run(async () => {
      const r = await decide(jobId, { decision: "question", question_code: q })
      if (!r) return
      setSheet(null)
      if (r.pending) return
      toast.message(t("o.toast.question", { question: t(`question.${q}`).toLowerCase() }), {
        description: t("o.toast.questionBody", { prime }),
      })
    })

  const routed = stage === "routed" || stage === "funded"
  if (ready && !routed && unreachable) return <UnreachableNotice className="mt-4" />
  if (ready && !routed) return <EmptyState className="mt-4" title={t("empty.notRouted")} body={t("empty.notRoutedBody")} />
  if (b.loading && !b.detail) return <CardSkeleton />
  if (!offer) {
    return (
      <EmptyState
        className="mt-4"
        title={b.error ?? t("o.card.notFound")}
        body={t("o.card.notFoundBody")}
        action={
          fromPrime
            ? { label: t("o.prime.back"), href: "/m/prime" }
            : { label: t("o.card.backToOffers"), href: `/m/shops/${encodeURIComponent(shopId)}/offers` }
        }
      />
    )
  }

  const controlled = job?.controlled ?? assignment?.controlled ?? false
  // A required certificate the shop holds only as pending_training (funded training for its trade).
  const trainingCert = (job?.required_certs ?? []).find((ct) => b.certs.find((c) => c.type === ct)?.status === "pending_training") ?? null
  const multLabel =
    offer.multiplier === 2 ? t("o.card.mult.sme", { mult: offer.multiplier }) : t("o.card.mult.plain", { mult: offer.multiplier })
  const credit = fmtCredit(offer.credit_cad)
  const creditLine = fromPrime
    ? t(state === "accepted" ? (simulated ? "o.prime.creditSimulated" : "o.prime.creditAccepted") : "o.prime.credit", {
        credit,
        mult: multLabel,
        shop: shopName,
      })
    : t(state === "accepted" ? (simulated ? "o.card.creditSimulated" : "o.card.creditAccepted") : "o.card.credit", {
        prime,
        credit,
        mult: multLabel,
      })

  return (
    <div className="flex flex-col gap-4 pt-2">
      {/* 1. What it is */}
      <section aria-labelledby="offer-title" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <DecisionChip state={state} decision={decision} />
          {simulated ? <SimulatedChip /> : null}
          {decision?.pending ? <WillSendChip /> : null}
          {newIds.has(jobId) && (state === "open" || state === "question") ? <NewChip /> : null}
          {replyBy && (state === "open" || state === "question") ? <ReplyByChip date={replyBy} withTag /> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {t("o.card.part", { part: offer.part_no })} · {offer.job_id}
        </p>
        <h2 id="offer-title" className="text-xl leading-snug font-semibold">
          {offer.description}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {job ? <Chip>{label(MATERIAL_LABEL, job.material)}</Chip> : null}
          {job?.process_tags.map((p) => <Chip key={p}>{label(PROCESS_LABEL, p)}</Chip>)}
          {controlled ? (
            <Chip className="border-controlled/25 bg-controlled-soft text-controlled">
              <Lock className="size-3.5" aria-hidden />
              {t("o.card.controlled")}
            </Chip>
          ) : null}
        </div>

        <dl className="mt-1 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border bg-card p-3">
            <dt className="text-sm text-muted-foreground">{t("o.card.totalValue")}</dt>
            <dd className="mt-0.5 text-[28px] leading-none font-semibold tabular-nums">{fmtMoney(offer.value_cad, { compact: true })}</dd>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <dt className="text-sm text-muted-foreground">{t("o.card.hoursWeek")}</dt>
            <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-1 gap-y-1">
              <span className="text-[28px] leading-none font-semibold tabular-nums">{offer.hours_week}</span>
              <span className="text-base font-medium text-muted-foreground">{t("o.card.hoursUnit")}</span>
              <AssumptionTag note="Weekly shop load during production; a demo estimate, not a quoted figure" />
            </dd>
          </div>
        </dl>

        {/* 2. No bidding + credit: the reason to say yes, above the fold */}
        <div className="rounded-xl border border-assigned/25 bg-assigned-soft px-4 py-3 text-base text-foreground">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-assigned" aria-hidden />
            <span>
              <strong>{t("o.card.noBidding")}</strong>{" "}
              {fromPrime ? t("o.prime.onlyYou", { shop: shopName }) : t("o.card.onlyYou", { prime })} <strong>{creditLine}</strong>
            </span>
          </p>
          <p className="mt-1 pl-7 text-sm text-muted-foreground">
            {fromPrime ? t("o.prime.itbGloss") : t("o.card.itbGloss")} {t("label.simplifiedItb")}
          </p>
        </div>

        {/* Northgate's reply to the shop's question */}
        {!fromPrime && state === "question" && reply ? (
          <p
            className="flex items-start gap-2 rounded-xl border border-controlled/25 bg-controlled-soft px-4 py-3 text-base text-foreground"
            data-testid="offer-reply"
          >
            <MessageSquareReply className="mt-0.5 size-5 shrink-0 text-controlled" aria-hidden />
            <span>
              <strong>{t("o.reply.title", { prime })}:</strong> “{reply.text}”
              {reply.via === "local" ? <span className="block text-sm text-muted-foreground">{t("o.reply.demo")}</span> : null}
            </span>
          </p>
        ) : null}
      </section>

      {fromPrime ? (
        <PrimeStatus state={state} decision={decision} shop={shopName} simulated={simulated} reply={reply} />
      ) : null}

      {trainingCert ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-900" data-testid="offer-training">
          <Clock className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            {(() => {
              // Welding (CWB W47.1) keeps the original copy; another trade names its workers.
              const trade = tradeForCert(trainingCert)
              const other = !trade ? GENERIC_TRADE : isWeldingTrade(trade) ? null : trade
              const vars = {
                cert: certPlain(trainingCert).first.replace(/^./, (c) => c.toLowerCase()),
                shop: shopName,
                workers: other?.workers ?? "",
                Workers: other ? other.workers.replace(/^./, (c) => c.toUpperCase()) : "",
              }
              const head = fromPrime ? (other ? "o.prime.trainingTrade" : "o.prime.training") : other ? "o.card.trainingTrade" : "o.card.training"
              const body = fromPrime
                ? other
                  ? "o.prime.trainingBodyTrade"
                  : "o.prime.trainingBody"
                : other
                  ? "o.card.trainingBodyTrade"
                  : "o.card.trainingBody"
              return (
                <>
                  <strong>{t(head, vars)}</strong> {t(body, vars)}
                </>
              )
            })()}
          </span>
        </div>
      ) : null}

      {/* 3. Can we do it? (verdict first; rows expand on tap) */}
      {/* The shop's own capacity and profile checks: not shown to the defence company. */}
      {fromPrime ? null : fit ? (
        <FitChecklist items={fit} collapsible />
      ) : (
        <p className="text-base text-muted-foreground">{t("o.card.noJobData")}</p>
      )}

      {/* Quantity, unit price, distance */}
      <ul className="flex flex-col gap-1 text-base text-muted-foreground">
        {job ? (
          <>
            <li>{t("o.card.qty", { qty: job.qty.toLocaleString("en-US") })}</li>
            <li>{t("o.card.unitPrice", { price: fmtMoney(job.unit_price_cad) })}</li>
          </>
        ) : null}
        {assignment ? (
          <li className="flex items-center gap-1.5">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {t("o.card.distance", { km: fmtKm(assignment.distance_km) })}
          </li>
        ) : null}
      </ul>

      {/* 4. Why you */}
      {offer.reasons.length ? (
        <section aria-labelledby="why-title" className="rounded-xl border border-border bg-card px-4 py-3">
          <h2 id="why-title" className="text-lg font-semibold">
            {fromPrime ? t("o.prime.why", { shop: shopName }) : t("o.card.why")}
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {offer.reasons.slice(0, 3).map((r) => {
              const text = plainReason(r, b.certs, prime, fromPrime ? "prime" : "shop")
              const training = isInTrainingReason(text)
              return (
                <li key={r} className="flex items-start gap-2 text-base">
                  {training ? (
                    <Clock className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden />
                  ) : (
                    <Check className="mt-0.5 size-5 shrink-0 text-assigned" aria-hidden />
                  )}
                  {text}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {/* 5. Payment terms */}
      <p className="flex items-start gap-2 text-base text-muted-foreground">
        <Wallet className="mt-0.5 size-5 shrink-0" aria-hidden />
        <span>
          {fromPrime ? t("o.prime.payment") : t("o.card.payment")} <AssumptionTag className="align-middle" note={t("o.card.paymentNote")} />
        </span>
      </p>

      {/* 6. Drawings */}
      <p
        className={cn(
          "flex items-start gap-2 rounded-xl border px-4 py-3 text-base",
          controlled ? "border-controlled/25 bg-controlled-soft text-foreground" : "border-border bg-muted text-foreground"
        )}
      >
        <FileLock2 className={cn("mt-0.5 size-5 shrink-0", controlled ? "text-controlled" : "text-muted-foreground")} aria-hidden />
        <span>
          {fromPrime
            ? t(controlled ? "o.prime.drawings.controlled" : "o.prime.drawings.plain", { shop: shopName })
            : controlled
              ? t("o.card.drawings.controlled")
              : t("o.card.drawings.plain")}
        </span>
      </p>

      {/* 7-8. Shop-only controls: never rendered for the defence company, nor before the view is known. */}
      {viewKnown && !fromPrime ? (
        <>
          <ShareButton
            jobId={offer.job_id}
            part={offer.part_no}
            desc={offer.description}
            qty={job?.qty ?? null}
            value={offer.value_cad}
            hours={offer.hours_week}
            replyBy={replyBy}
          />

          {state === "accepted" ? <AwardLink shopId={shopId} jobId={jobId} phone className="self-start" /> : null}

          <DecisionBar
            state={state}
            decision={decision}
            pending={!!decision?.pending}
            busy={busy}
            onAccept={accept}
            onDecline={() => setSheet("decline")}
            onAsk={() => setSheet("ask")}
            simulated={simulated}
            reply={reply}
            prime={prime}
          />

          <DeclineSheet
            open={sheet === "decline"}
            onOpenChange={(o) => setSheet(o ? "decline" : null)}
            jobId={offer.job_id}
            primeName={prime}
            busy={busy}
            onSubmit={decline}
          />
          <AskSheet open={sheet === "ask"} onOpenChange={(o) => setSheet(o ? "ask" : null)} jobId={offer.job_id} busy={busy} onSubmit={ask} />
        </>
      ) : null}
    </div>
  )
}

const PRIME_TONE: Record<OfferState, string> = {
  accepted: "border-assigned/25 bg-assigned-soft text-assigned",
  declined: "border-blocked/30 bg-blocked-soft text-blocked",
  question: "border-controlled/25 bg-controlled-soft text-controlled",
  open: "border-border bg-muted text-foreground",
}
const PRIME_ICON: Record<OfferState, typeof Check> = { accepted: Check, declined: X, question: CircleHelp, open: Clock }

/** Read-only answer line for the defence company: "Accepted by Tallowfield · Sep 26, 9:41 PM". */
function PrimeStatus({
  state,
  decision,
  shop,
  simulated,
  reply,
}: {
  state: OfferState
  decision: ReturnType<typeof useShopBundle>["actions"]["decisions"][string] | null
  shop: string
  simulated: boolean
  reply: { text: string; via: "engine" | "local" } | null
}) {
  const Icon = PRIME_ICON[state]
  let line: string
  if (state === "accepted") line = decision?.at ? t("o.prime.status.accepted", { shop, date: fmtDateTime(decision.at) }) : t("o.prime.status.acceptedNoDate", { shop })
  else if (state === "declined") {
    const r = reasonText(decision)
    line = r ? t("o.prime.status.declined", { shop, reason: r.toLowerCase() }) : t("o.prime.status.declinedNoReason", { shop })
  } else if (state === "question") line = t("o.prime.status.question", { shop, question: (questionText(decision) ?? "").toLowerCase() })
  else line = t("o.prime.status.open", { shop })
  return (
    <section aria-label={t("o.prime.status.label", { shop })} className="flex flex-col gap-2" data-testid="prime-offer-status">
      <div className={cn("flex items-start gap-2 rounded-xl border px-4 py-3", PRIME_TONE[state])}>
        <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-base leading-snug font-semibold">{line}</p>
          {decision?.note && (state === "declined" || state === "question") ? (
            <p className="text-sm break-words text-foreground/80">“{decision.note}”</p>
          ) : null}
          {simulated ? <p className="text-sm text-foreground/80">{t("o.prime.status.sim", { shop })}</p> : null}
          {state === "question" && reply ? (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-foreground">
              <MessageSquareReply className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("o.prime.replied", { text: reply.text })}
            </p>
          ) : null}
        </div>
        {simulated ? <SimulatedChip /> : null}
      </div>
      {state === "question" && !reply ? (
        <Link href="/m/prime" className="text-base font-medium text-brand underline underline-offset-4">
          {t("o.prime.replyCta")}
        </Link>
      ) : null}
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("o.prime.readOnly", { shop })}
      </p>
    </section>
  )
}

/** Credit to two decimals in millions ("$1.68M"), so the strip matches the prime's ledger; otherwise compact. */
function fmtCredit(n: number): string {
  if (n >= 1e6 && n < 1e8) return `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`
  return fmtMoney(n, { compact: true })
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-sm font-medium text-foreground",
        className
      )}
    >
      {children}
    </span>
  )
}

/** Web Share with the deep link and a plain-text summary (no geometry); falls back to copying the link. */
function ShareButton({
  jobId,
  part,
  desc,
  qty,
  value,
  hours,
  replyBy,
}: {
  jobId: string
  part: string
  desc: string
  qty: number | null
  value: number
  hours: number
  replyBy: Date | null
}) {
  const share = async () => {
    const url = window.location.href.split("#")[0]
    const vars = {
      job: jobId,
      part,
      desc: desc.replace(/\.$/, ""),
      qty: qty === null ? "—" : qty.toLocaleString("en-US"),
      value: fmtMoney(value),
      hours,
      date: replyBy ? fmtWeekday(replyBy) : null,
    }
    const text = replyBy ? t("o.card.shareText", vars) : t("o.card.shareTextNoDate", vars)
    const title = t("o.card.shareTitle", { job: jobId })
    const nav = typeof navigator !== "undefined" ? navigator : null
    if (nav && typeof nav.share === "function") {
      try {
        await nav.share({ title, text, url })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
        // fall through to copy
      }
    }
    try {
      await nav?.clipboard?.writeText(`${text}\n${url}`)
      toast.success(t("o.card.linkCopied"), { description: t("o.card.linkCopiedBody") })
    } catch {
      toast.error(t("o.card.shareFailed"), { description: url })
    }
  }
  return (
    <Button size="touch" variant="outline" className="w-full" onClick={() => void share()}>
      <Send className="size-5" aria-hidden />
      {t("o.card.share")}
    </Button>
  )
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 pt-2" aria-busy="true" aria-label={t("empty.loading")}>
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-14 w-full" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
