"use client"

import { Check, Inbox, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { fmtMoney } from "@/lib/format"
import { MultiplierPill, NewBadge } from "./badges"
import type { OfferT } from "./types"

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
    <section className="rounded-xl border border-zinc-200 bg-white">
      <header className="flex items-end justify-between gap-6 border-b border-zinc-100 px-6 py-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Offer inbox</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Defence jobs Muster routed to this shop. Accepting tells the prime you will take the work.
          </p>
        </div>
        {sorted.length > 0 && (
          <div className="shrink-0 text-right">
            <div className="text-2xl font-semibold tabular-nums text-zinc-900">
              {fmtMoney(totalValue, { compact: true })}
            </div>
            <div className="text-xs text-zinc-500">
              {sorted.length} offer{sorted.length === 1 ? "" : "s"} · {openCount} awaiting reply
            </div>
          </div>
        )}
      </header>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Inbox className="size-8 text-zinc-300" aria-hidden />
          <p className="text-base font-medium text-zinc-700">No offers yet</p>
          <p className="max-w-sm text-sm text-zinc-500">
            {routed
              ? "No jobs in the current work package fit this shop. See the readiness list for what would unlock more."
              : "Offers appear here once the prime uploads a parts list and Muster routes it."}
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
                  "px-6 py-5 transition-colors",
                  isNew && status === "offered" && "bg-emerald-50/40",
                  status === "declined" && "opacity-60"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
                      <span className="font-medium text-zinc-700">
                        {o.prime_name} <span className="font-normal text-zinc-600">(fictional)</span>
                      </span>
                      <span aria-hidden>·</span>
                      <span className="font-mono text-xs">{o.part_no}</span>
                      {isNew && <NewBadge />}
                    </div>
                    <p className="mt-1 text-base font-medium leading-snug text-zinc-900">
                      {o.description}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
                      {o.reasons.slice(0, 3).map((r) => (
                        <li key={r} className="flex items-center gap-1.5">
                          <Check className="size-3.5 text-emerald-600" aria-hidden />
                          {r}
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
                    <div className="text-sm tabular-nums text-zinc-500">
                      {o.hours_week} h/week in production
                    </div>
                    <div
                      className="flex items-center gap-1.5 text-sm text-zinc-600"
                      title={`${fmtMoney(o.credit_cad)} ITB credit to the prime`}
                    >
                      Prime earns {fmtMoney(o.credit_cad, { compact: true })} credit
                      <MultiplierPill multiplier={o.multiplier} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  {status === "accepted" ? (
                    <>
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white">
                        <Check className="size-4" aria-hidden />
                        Accepted
                      </span>
                      <span className="text-sm text-zinc-500">
                        Added to your production plan: {o.hours_week} h/week
                      </span>
                    </>
                  ) : status === "declined" ? (
                    <>
                      <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-100 px-3 text-sm font-medium text-zinc-500">
                        <X className="size-4" aria-hidden />
                        Declined
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => onDecide(o.job_id, "accepted")}>
                        Accept instead
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="lg" className="px-4" onClick={() => onDecide(o.job_id, "accepted")}>
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
