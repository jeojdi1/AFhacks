"use client"

import { useId, useState } from "react"
import { Check, Clock, Inbox, MessageCircleQuestion, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { fmtMoney } from "@/lib/format"
import { ce } from "@/lib/ui/copy-e"
import { certPlain } from "@/lib/ui/plain"
import { MultiplierPill, NewBadge, TermText } from "./badges"
import { t } from "@/lib/app/strings"
import { DECISION_NOTE_MAX, REASON_CODES, type ReasonCode } from "@/lib/app/types"
import type { CertT, OfferT } from "./types"

/**
 * Engine routing reasons in plain words (docs/ux-simplification.md §2): "SME: 2x direct credit"
 * → "Small business: work counts double"; a cert name gets its plain label first.
 */
function plainReason(r: string): string {
  if (/^SME\b/.test(r)) return ce("shop.reason.sme")
  const lc = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
  return r
    .replace(/\bCWB W47\.1\b/g, lc(certPlain("CWB_W47.1").first))
    .replace(/^CGP-registered\b/, certPlain("CGP").first)
    .replace(/\bCGP\b/g, lc(certPlain("CGP").first))
    .replace(/\bCPCSC Level 1\b/g, lc(certPlain("CPCSC_L1").first))
}

/** Reason codes and question codes are the engine's (docs/api.md §6). */
export interface InboxDecision {
  decision: "accepted" | "declined" | "question"
  reason_code?: ReasonCode | null
  question_code?: string | null
  /** Saved on this device, not yet sent. */
  pending?: boolean
}

const CERT_IN_REASON: [RegExp, string][] = [
  [/\bCWB W47\.1\b/, "CWB_W47.1"],
  [/\bCGP\b/, "CGP"],
  [/\bCPCSC Level 1\b/, "CPCSC_L1"],
]

/** True when a routing reason names a certificate this shop holds only as pending_training. */
function reasonInTraining(r: string, certStatus: Map<string, string>): boolean {
  return CERT_IN_REASON.some(([re, type]) => re.test(r) && certStatus.get(type) === "pending_training")
}

export function OfferInbox({
  offers,
  newJobIds,
  decisions,
  certifications = [],
  onAccept,
  onDecline,
  routed,
}: {
  offers: OfferT[]
  newJobIds: Set<string>
  /** key job_id: this shop's answers (engine decisions in live mode, local status in fixtures). */
  decisions: Record<string, InboxDecision>
  certifications?: CertT[]
  onAccept: (jobId: string) => void | Promise<unknown>
  onDecline: (jobId: string, reason: ReasonCode, note: string | null) => void | Promise<unknown>
  routed: boolean
}) {
  const [declining, setDeclining] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const certStatus = new Map(certifications.map((c) => [c.type as string, c.status as string]))

  const run = async (jobId: string, fn: () => void | Promise<unknown>) => {
    setBusy(jobId)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  // Newest (just unblocked by funded training) first, then by value.
  const sorted = [...offers].sort((a, b) => {
    const na = newJobIds.has(a.job_id) ? 1 : 0
    const nb = newJobIds.has(b.job_id) ? 1 : 0
    if (na !== nb) return nb - na
    return b.value_cad - a.value_cad
  })

  const decided = (jobId: string, fallback?: string): string => decisions[jobId]?.decision ?? fallback ?? "offered"

  const openCount = sorted.filter((o) => {
    const st = decided(o.job_id, o.status)
    return st === "offered" || st === "question"
  }).length
  const totalValue = sorted.reduce((s, o) => s + o.value_cad, 0)

  return (
    <section className="rounded-xl border border-zinc-200 bg-white" data-offer-inbox>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-zinc-100 px-5 py-5 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">{ce("shop.inbox.title")}</h2>
          <p className="mt-0.5 text-sm text-zinc-500">{ce("shop.inbox.sub")}</p>
        </div>
        {sorted.length > 0 && (
          <div className="shrink-0 text-right">
            <div className="text-2xl font-semibold tabular-nums text-zinc-900">
              {fmtMoney(totalValue, { compact: true })}
            </div>
            <div className="text-xs text-zinc-500">{ce("shop.inbox.total", { n: sorted.length, open: openCount })}</div>
          </div>
        )}
      </header>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Inbox className="size-8 text-zinc-300" aria-hidden />
          <p className="text-base font-medium text-zinc-700">{ce("shop.inbox.none")}</p>
          <p className="max-w-sm text-sm text-zinc-500">
            {routed ? ce("shop.inbox.none.routed") : ce("shop.inbox.none.empty")}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {sorted.map((o) => {
            const status = decided(o.job_id, o.status)
            const dec = decisions[o.job_id]
            const isNew = newJobIds.has(o.job_id)
            const isBusy = busy === o.job_id
            return (
              <li
                key={o.job_id}
                className={cn(
                  "px-5 py-5 transition-colors sm:px-6",
                  isNew && status === "offered" && "bg-emerald-50/40",
                  status === "declined" && "opacity-60"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
                      <span className="font-medium text-zinc-700">
                        {o.prime_name} <span className="font-normal text-zinc-600">{ce("shop.inbox.fictional")}</span>
                      </span>
                      <span aria-hidden>·</span>
                      <span className="font-mono text-sm font-semibold text-zinc-800" data-job-id>{o.job_id}</span>
                      {o.part_no ? <span className="font-mono text-xs text-zinc-500">Part {o.part_no}</span> : null}
                      {isNew && <NewBadge />}
                    </div>
                    <p className="mt-1 text-base font-medium leading-snug text-zinc-900">
                      <TermText text={o.description} />
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
                      {o.reasons.slice(0, 3).map((r) =>
                        reasonInTraining(r, certStatus) ? (
                          <li key={r} className="flex items-center gap-1.5" data-reason-training>
                            <Clock className="size-3.5 text-amber-700" aria-hidden />
                            {plainReason(r)} (welders in training)
                          </li>
                        ) : (
                          <li key={r} className="flex items-center gap-1.5">
                            <Check className="size-3.5 text-emerald-600" aria-hidden />
                            {plainReason(r)}
                          </li>
                        )
                      )}
                    </ul>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <div className="text-xl font-semibold tabular-nums text-zinc-900">
                      <span title={fmtMoney(o.value_cad)}>
                        {fmtMoney(o.value_cad, { compact: true })}
                      </span>
                    </div>
                    <div className="text-sm tabular-nums text-zinc-500">{ce("shop.inbox.hours", { h: o.hours_week })}</div>
                    <div
                      className="flex flex-wrap items-center justify-end gap-1.5 text-sm text-zinc-600"
                      title={`${fmtMoney(o.credit_cad)} credit toward what Northgate owes`}
                    >
                      {ce("shop.inbox.earns", { credit: fmtMoney(o.credit_cad, { compact: true }) })}
                      <MultiplierPill multiplier={o.multiplier} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2" data-offer-actions={o.job_id}>
                  {status === "accepted" ? (
                    <>
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white">
                        <Check className="size-4" aria-hidden />
                        {ce("shop.inbox.accepted")}
                      </span>
                      <span className="text-sm text-zinc-500">{ce("shop.inbox.accepted.note", { h: o.hours_week })}</span>
                      {dec?.pending ? <WillSend /> : null}
                    </>
                  ) : status === "declined" ? (
                    <>
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-100 px-3 text-sm font-medium text-zinc-600">
                        <X className="size-4" aria-hidden />
                        {dec?.reason_code ? t("decision.declinedWith", { reason: t(`reason.${dec.reason_code}`) }) : ce("shop.inbox.declined")}
                      </span>
                      {dec?.pending ? <WillSend /> : null}
                      <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => void run(o.job_id, () => onAccept(o.job_id))}>
                        {ce("shop.inbox.acceptInstead")}
                      </Button>
                    </>
                  ) : declining === o.job_id ? (
                    <DeclinePicker
                      jobId={o.job_id}
                      prime={o.prime_name?.split(" ")[0] || "Northgate"}
                      busy={isBusy}
                      onCancel={() => setDeclining(null)}
                      onSubmit={(reason, note) =>
                        void run(o.job_id, async () => {
                          await onDecline(o.job_id, reason, note)
                          setDeclining(null)
                        })
                      }
                    />
                  ) : (
                    <>
                      {status === "question" ? (
                        <span className="mr-1 inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-50 px-3 text-sm font-medium text-sky-800">
                          <MessageCircleQuestion className="size-4" aria-hidden />
                          {dec?.question_code ? t("decision.questionSent", { question: t(`question.${dec.question_code}`) }) : "Question sent"}
                        </span>
                      ) : null}
                      <Button
                        size="lg"
                        className="bg-emerald-700! px-4 text-white! hover:bg-emerald-800!"
                        disabled={isBusy}
                        onClick={() => void run(o.job_id, () => onAccept(o.job_id))}
                      >
                        <Check aria-hidden />
                        Accept
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="px-4"
                        disabled={isBusy}
                        onClick={() => setDeclining(o.job_id)}
                      >
                        Decline
                      </Button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function WillSend() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
      <Clock className="size-3" aria-hidden />
      Will send when back online
    </span>
  )
}

/** Inline decline: pick one of the engine's reason codes (required) and an optional note. */
function DeclinePicker({
  jobId,
  prime,
  busy,
  onCancel,
  onSubmit,
}: {
  jobId: string
  prime: string
  busy: boolean
  onCancel: () => void
  onSubmit: (reason: ReasonCode, note: string | null) => void
}) {
  const [reason, setReason] = useState<ReasonCode | null>(null)
  const [note, setNote] = useState("")
  const groupId = useId()
  const noteId = useId()
  return (
    <div className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-4" data-decline-picker={jobId}>
      <p id={groupId} className="text-sm font-medium text-zinc-900">
        Decline {jobId}? Pick a reason. {prime} sees it right away.
      </p>
      <div role="radiogroup" aria-labelledby={groupId} className="mt-2 flex flex-wrap gap-2">
        {REASON_CODES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={reason === r}
            data-reason={r}
            onClick={() => setReason(r)}
            className={cn(
              "h-8 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              reason === r ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
            )}
          >
            {t(`reason.${r}`)}
          </button>
        ))}
      </div>
      <label htmlFor={noteId} className="mt-3 block text-sm text-zinc-600">
        Note (optional). No drawings, dimensions or technical data.
      </label>
      <input
        id={noteId}
        value={note}
        maxLength={DECISION_NOTE_MAX}
        onChange={(e) => setNote(e.target.value.slice(0, DECISION_NOTE_MAX))}
        placeholder={t("decision.notePlaceholder")}
        className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" disabled={!reason || busy} onClick={() => reason && onSubmit(reason, note.trim() ? note.trim() : null)}>
          {reason ? "Send decline" : "Pick a reason first"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
