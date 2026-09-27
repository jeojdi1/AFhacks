"use client"

import { Check, Inbox, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { fmtMoney } from "@/lib/format"
import { ce } from "@/lib/ui/copy-e"
import { certPlain } from "@/lib/ui/plain"
import { MultiplierPill, NewBadge, TermText } from "./badges"
import type { OfferT } from "./types"

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

type Decision = "accepted" | "declined"

export function OfferInbox({
  offers,
  shopId,
  newJobIds,
  offerStatus,
  onDecide,
  routed,
}: {
  offers: OfferT[]
  shopId: string
  newJobIds: Set<string>
  offerStatus: Record<string, Decision>
  onDecide: (jobId: string, status: Decision) => void
  routed: boolean
}) {
  // Newest (just unblocked by funded training) first, then by value.
  const sorted = [...offers].sort((a, b) => {
    const na = newJobIds.has(a.job_id) ? 1 : 0
    const nb = newJobIds.has(b.job_id) ? 1 : 0
    if (na !== nb) return nb - na
    return b.value_cad - a.value_cad
  })

  const decided = (jobId: string, fallback?: string): string =>
    offerStatus[`${shopId}:${jobId}`] ?? fallback ?? "offered"

  const openCount = sorted.filter((o) => decided(o.job_id, o.status) === "offered").length
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
            const isNew = newJobIds.has(o.job_id)
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
                      {o.reasons.slice(0, 3).map((r) => (
                        <li key={r} className="flex items-center gap-1.5">
                          <Check className="size-3.5 text-emerald-600" aria-hidden />
                          {plainReason(r)}
                        </li>
                      ))}
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

                <div className="mt-4 flex items-center gap-2">
                  {status === "accepted" ? (
                    <>
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white">
                        <Check className="size-4" aria-hidden />
                        {ce("shop.inbox.accepted")}
                      </span>
                      <span className="text-sm text-zinc-500">{ce("shop.inbox.accepted.note", { h: o.hours_week })}</span>
                    </>
                  ) : status === "declined" ? (
                    <>
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-100 px-3 text-sm font-medium text-zinc-500">
                        <X className="size-4" aria-hidden />
                        {ce("shop.inbox.declined")}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => onDecide(o.job_id, "accepted")}>
                        {ce("shop.inbox.acceptInstead")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="lg"
                        className="bg-emerald-700! px-4 text-white! hover:bg-emerald-800!"
                        onClick={() => onDecide(o.job_id, "accepted")}
                      >
                        <Check aria-hidden />
                        Accept
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="px-4"
                        onClick={() => onDecide(o.job_id, "declined")}
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
