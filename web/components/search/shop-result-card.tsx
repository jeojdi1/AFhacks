"use client"

import Link from "next/link"
import { Check, CircleDashed, Clock, FlaskConical, Globe, Landmark, MapPin, UserRoundCheck, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { CERT_IN_TRAINING_NOTE, certInTraining, fmtMoney } from "@/lib/format"
import { Term } from "@/components/muster/term"
import { useWithParams } from "@/lib/ui/use-with-params"
import { COUNTING_STATUSES, certFirst, certStatusPlain, fmtDate, processPlain } from "@/lib/search/labels"
import type { ShopResult, ShopSearchQueryEcho } from "@/lib/search/types"

const COUNTING = new Set<string>(COUNTING_STATUSES)

/** Matched / missing in plain words, from the query and the shop's own processes and certificates. */
function matchLists(shop: ShopResult, query: ShopSearchQueryEcho) {
  const matched: string[] = []
  const missing: string[] = []
  // Counts for matching, but not held yet: welders still training (paid by Northgate).
  const training: string[] = []
  for (const p of query.process) (shop.processes.includes(p) ? matched : missing).push(`Does ${processPlain(p).toLowerCase()}`)
  for (const c of query.cert) {
    const held = shop.certs.find((x) => x.type === c && COUNTING.has(x.status))
    if (held && certInTraining(held.status)) training.push(`${certFirst(c)}: in training (${CERT_IN_TRAINING_NOTE}), not held yet`)
    else if (held) matched.push(`${certFirst(c)}: ${certStatusPlain(held.status, shop.source)}`)
    else missing.push(certFirst(c))
  }
  if (shop.distance_km != null && query.near) matched.push(`${shop.distance_km.toFixed(1)} km from ${query.near}`)
  if (query.dnd_history && shop.dnd_history) matched.push("Has National Defence contract history")
  if (query.q) matched.push(`Name or city contains "${query.q}"`)
  if (shop.is_sme && shop.source === "synthetic") matched.push("Small business: its work on the contract counts double (2×)")
  return { matched, missing, training }
}

export function ShopResultCard({ shop, query }: { shop: ShopResult; query: ShopSearchQueryEcho }) {
  const wp = useWithParams()
  const isPublic = shop.source === "public"
  const { matched, missing, training } = matchLists(shop, query)
  const dnd = shop.dnd_history

  return (
    <article
      data-shop-id={shop.shop_id}
      data-source={shop.source}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <h3 className="min-w-0 text-[1.05rem] leading-snug font-semibold break-words">
            <Link href={wp(`/shops/${shop.shop_id}`)} className="underline-offset-4 hover:underline">
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
                  c.status === "pending_training"
                    ? "border-funded/30 bg-funded-soft text-funded"
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
                  <li key={m} className="flex items-start gap-1.5 text-funded" data-in-training>
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
            {missing.length ? (
              missing.map((m) => (
                <li key={m} className="flex items-start gap-1.5">
                  <X className="mt-0.5 size-4 shrink-0 text-blocked" aria-hidden />
                  <span>{m}</span>
                </li>
              ))
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
        <Link href={wp(`/shops/${shop.shop_id}`)} className="font-medium underline-offset-4 hover:underline">
          View profile →
        </Link>
      </footer>
    </article>
  )
}
