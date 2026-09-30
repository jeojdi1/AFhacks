"use client"

import * as React from "react"
import Link from "next/link"
import { Check, CircleDashed, Clock, FlaskConical, Globe, Landmark, LoaderCircle, MapPin, Send, UserRoundCheck, X } from "lucide-react"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { CERT_IN_TRAINING_NOTE, certInTraining, fmtMoney } from "@/lib/format"
import { Term } from "@/components/muster/term"
import { useWithParams } from "@/lib/ui/use-with-params"
import { COUNTING_STATUSES, certFirst, certStatusPlain, fmtDate, processPlain, trainingWorkers } from "@/lib/search/labels"
import type { ShopResult, ShopSearchQueryEcho } from "@/lib/search/types"

const COUNTING = new Set<string>(COUNTING_STATUSES)

/** Matched / missing in plain words, from the query and the shop's own processes and certificates. */
function matchLists(shop: ShopResult, query: ShopSearchQueryEcho) {
  const matched: string[] = []
  const missing: string[] = []
  // Counts for matching, but not held yet: workers still training (paid by Northgate).
  const training: string[] = []
  const stillTraining: string[] = []
  for (const p of query.process) (shop.processes.includes(p) ? matched : missing).push(`Does ${processPlain(p).toLowerCase()}`)
  for (const c of query.cert) {
    const held = shop.certs.find((x) => x.type === c && COUNTING.has(x.status))
    if (held && certInTraining(held.status)) {
      training.push(`${certFirst(c)}: counts for matching, training ${CERT_IN_TRAINING_NOTE}`)
      stillTraining.push(`${certFirst(c)}: ${trainingWorkers(c)} still training, not held yet`)
    }
    else if (held) matched.push(`${certFirst(c)}: ${certStatusPlain(held.status, shop.source)}`)
    else missing.push(certFirst(c))
  }
  if (shop.distance_km != null && query.near) matched.push(`${shop.distance_km.toFixed(1)} km from ${query.near}`)
  if (query.dnd_history && shop.dnd_history) matched.push("Has National Defence contract history")
  if (query.q) matched.push(`Name or city contains "${query.q}"`)
  if (shop.is_sme && shop.source === "synthetic") matched.push("Small business: its work on the contract counts double (2×)")
  return { matched, missing, training, stillTraining }
}

/** True when the shop has a searched-for certificate only in training (sorted after holders). */
export function hasTrainingOnlyMatch(shop: ShopResult, query: ShopSearchQueryEcho): boolean {
  return query.cert.some((c) => {
    const held = shop.certs.find((x) => x.type === c && COUNTING.has(x.status))
    return !!held && certInTraining(held.status)
  })
}

/** "Find another shop" for a declined job (?job=): offer it to this synthetic shop (demo). */
export interface OfferJob {
  jobId: string
  /** Short shop name for the button and the confirmation ("Tessellate Precision"). */
  shopLabel: string
  /** Resolves true when the offer went through (the page then shows it as sent). */
  onOffer: () => Promise<boolean>
}

function OfferButton({ offer }: { offer: OfferJob }) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const confirm = async () => {
    setBusy(true)
    const ok = await offer.onOffer()
    setBusy(false)
    if (ok) setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <PopoverTrigger
        className="inline-flex h-10 items-center gap-1.5 rounded-md bg-foreground px-3.5 text-sm font-semibold text-background hover:bg-foreground/90 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
        data-testid="offer-job"
      >
        <Send className="size-4" aria-hidden />
        Offer {offer.jobId} to {offer.shopLabel}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-3">
        <PopoverHeader>
          <PopoverTitle>
            Offer {offer.jobId} to {offer.shopLabel}?
          </PopoverTitle>
          <PopoverDescription>
            {offer.shopLabel} will see {offer.jobId} as a new offer. Credit stays counted as placed (demo).
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-semibold text-background hover:bg-foreground/90 disabled:opacity-60"
            data-testid="offer-job-confirm"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            Send the offer
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ShopResultCard({
  shop,
  query,
  offer,
}: {
  shop: ShopResult
  query: ShopSearchQueryEcho
  /** Set on /prime/suppliers?job=… for a synthetic shop that can take the declined job. */
  offer?: OfferJob | null
}) {
  const wp = useWithParams()
  const isPublic = shop.source === "public"
  const { matched, missing, training, stillTraining } = matchLists(shop, query)
  const dnd = shop.dnd_history
  // from=suppliers: the profile shows a way back to this search (its filters live in the URL).
  const profileHref = wp(`/shops/${shop.shop_id}?from=suppliers`)

  return (
    <article
      data-shop-id={shop.shop_id}
      data-source={shop.source}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <h3 className="min-w-0 text-[1.05rem] leading-snug font-semibold break-words">
            <Link href={profileHref} className="underline-offset-4 hover:underline">
              {shop.name}
            </Link>
          </h3>
          {isPublic ? (
            <span
              className="inline-flex h-auto min-h-6 w-fit items-center gap-1 rounded-full border border-public/25 bg-public-soft px-2.5 py-0.5 text-xs font-medium text-public"
              title="Found in public data (Statistics Canada ODBus, company websites). Never sent work."
            >
              <Globe className="size-3.5 shrink-0" aria-hidden />
              <span>Real shop · Public data — unverified — not affiliated</span>
            </span>
          ) : (
            <span
              className="inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-600"
              title="Made up for this demo. Only synthetic shops receive demo offers."
            >
              <FlaskConical className="size-3.5 shrink-0" aria-hidden />
              Synthetic
            </span>
          )}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {shop.city ?? "Location unknown"}
            {shop.distance_km != null && query.near ? ` · ${shop.distance_km.toFixed(1)} km from ${query.near}` : ""}
          </span>
          {shop.is_sme ? (
            <span className="inline-flex items-center gap-1">
              <UserRoundCheck className="size-4 shrink-0" aria-hidden />
              <Term k="SMB">Small business</Term>
              {isPublic ? " (estimated)" : null}
            </span>
          ) : null}
        </p>
      </header>

      <div className="flex flex-col gap-1 text-sm">
        <p>
          <span className="font-medium text-slate-700">Makes: </span>
          {shop.processes.length ? shop.processes.map(processPlain).join(", ") : "not listed"}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-slate-700">Certificates:</span>
          {shop.certs.length ? (
            shop.certs.map((c) => (
              <span
                key={c.type}
                className={cn(
                  "inline-flex min-h-6 items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  certInTraining(c.status)
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : isPublic
                      ? "border-public/25 bg-public-soft text-public"
                      : "border-assigned/25 bg-assigned-soft text-assigned"
                )}
                title={`${certFirst(c.type)}: ${certStatusPlain(c.status, shop.source)}`}
              >
                {certInTraining(c.status) ? (
                  <Clock className="size-3 shrink-0" aria-hidden />
                ) : (
                  <Check className="size-3 shrink-0" aria-hidden />
                )}
                <Term k={c.type.startsWith("NADCAP") ? "NADCAP" : c.type} first>
                  {certFirst(c.type)}
                </Term>
              </span>
            ))
          ) : (
            <span className="text-muted-foreground">{isPublic ? "none stated publicly" : "none held"}</span>
          )}
        </div>
      </div>

      {dnd ? (
        <div
          data-dnd-history
          className="flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
          title={dnd.source}
        >
          <Landmark className="mt-0.5 size-4 shrink-0 text-slate-600" aria-hidden />
          <p className="min-w-0">
            <span className="font-semibold">National Defence contract history: </span>
            {dnd.contracts} contract{dnd.contracts === 1 ? "" : "s"} · {fmtMoney(dnd.value_cad, { compact: true })}
            {dnd.last_date ? ` · last ${fmtDate(dnd.last_date)}` : ""}
            <span className="block text-xs text-muted-foreground">
              Public record (contracts over $10K, Open Government Licence). Matched by company name
              {dnd.confidence ? ` (${dnd.confidence} confidence)` : ""}, unverified.
            </span>
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="font-medium text-slate-700">Why it matches</p>
          <ul className="mt-1 flex flex-col gap-1">
            {matched.length || training.length ? (
              <>
                {matched.map((m) => (
                  <li key={m} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-assigned" aria-hidden />
                    <span>{m}</span>
                  </li>
                ))}
                {training.map((m) => (
                  <li key={m} className="flex items-start gap-1.5 text-amber-800" data-in-training>
                    <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>{m}</span>
                  </li>
                ))}
              </>
            ) : (
              <li className="text-muted-foreground">
                {query.process.length || query.cert.length || query.near || query.dnd_history || query.q
                  ? "None of what you asked for"
                  : "You haven't set any filters yet"}
              </li>
            )}
          </ul>
        </div>
        <div>
          <p className="font-medium text-slate-700">What&apos;s missing</p>
          <ul className="mt-1 flex flex-col gap-1">
            {missing.length || stillTraining.length ? (
              <>
                {missing.map((m) => (
                  <li key={m} className="flex items-start gap-1.5">
                    <X className="mt-0.5 size-4 shrink-0 text-blocked" aria-hidden />
                    <span>{m}</span>
                  </li>
                ))}
                {stillTraining.map((m) => (
                  <li key={m} className="flex items-start gap-1.5 text-amber-800" data-still-training>
                    <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>{m}</span>
                  </li>
                ))}
              </>
            ) : (
              <li className="flex items-start gap-1.5 text-muted-foreground">
                <CircleDashed className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>Nothing you asked for</span>
              </li>
            )}
          </ul>
        </div>
      </div>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">
          {isPublic
            ? "Not onboarded: not sent work until the shop claims its profile."
            : "Demo shop: can receive Northgate's offers."}
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href={profileHref} className="font-medium underline-offset-4 hover:underline">
            View profile →
          </Link>
          {offer && !isPublic ? <OfferButton offer={offer} /> : null}
        </span>
      </footer>
    </article>
  )
}
