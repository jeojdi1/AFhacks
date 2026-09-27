"use client"

import Link from "next/link"
import { ArrowRight, GraduationCap, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { CATEGORY_LABEL, PROCESS_LABEL } from "@/lib/format"
import { ce } from "@/lib/ui/copy-e"
import { certPlain } from "@/lib/ui/plain"
import { useWithParams } from "@/lib/ui/use-with-params"
import { growHref } from "@/lib/app/readiness"
import { TrainingStatusBadge } from "./badges"
import type { TrainingT } from "./types"

function unlockText(t: TrainingT): string | null {
  const parts: string[] = []
  if (t.cert_unlock) parts.push(certPlain(t.cert_unlock).first)
  if (t.capacity_unlock) {
    for (const [proc, hours] of Object.entries(t.capacity_unlock)) {
      parts.push(`+${hours} hours a week of ${(PROCESS_LABEL?.[proc] ?? proc).toLowerCase()}`)
    }
  }
  return parts.length ? parts.join(" · ") : null
}

/**
 * The package headline in plain words. The engine's suggested text says "certify 4 welders",
 * which the wording rules forbid (W47.1 is a company certification): say training seats.
 */
function headline(t: TrainingT): string {
  if (t.trainees != null && t.cert_unlock) {
    const cert = certPlain(t.cert_unlock).first
    const lc = cert.charAt(0).toLowerCase() + cert.slice(1)
    return t.status === "funded"
      ? ce("shop.training.funded", { seats: t.trainees, cert: lc })
      : ce("shop.training.suggested", { seats: t.trainees, cert: lc })
  }
  return t.message
}

/** `shopId`: link "See how Northgate can fund this" to the shop's own ask-to-fund screen, not /gaps. */
export function TrainingCard({ training, shopId }: { training: TrainingT[]; shopId?: string }) {
  const wp = useWithParams()
  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <header className="border-b border-zinc-100 px-5 py-5 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">{ce("shop.training.title")}</h2>
        <p className="mt-0.5 text-sm text-zinc-500">{ce("shop.training.sub")}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-zinc-600" data-testid="training-caveat">
          <AssumptionTag note="Training cost is an estimate for the demo, not a quote" />
          {ce("shop.training.caveat")}
        </p>
      </header>
      {training.length === 0 ? (
        <div className="flex items-center gap-3 px-6 py-8 text-sm text-zinc-500">
          <GraduationCap className="size-5 text-zinc-300" aria-hidden />
          {ce("shop.training.none")}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {training.map((t) => {
            const funded = t.status === "funded"
            const unlock = unlockText(t)
            return (
              <li key={t.package_id} className={cn("px-5 py-5 sm:px-6", funded && "bg-emerald-50/40")}>
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                      funded ? "bg-emerald-600 text-white" : "bg-amber-100 text-amber-800"
                    )}
                  >
                    <Users className="size-4.5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <TrainingStatusBadge status={t.status} />
                      <span className="font-mono text-xs text-zinc-400">{t.package_id}</span>
                    </div>
                    <p className="mt-1.5 text-lg font-semibold leading-snug tracking-tight text-zinc-900">
                      {headline(t)}
                    </p>
                    <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      <div className="flex gap-1.5">
                        <dt className="text-zinc-500">{ce("shop.training.partner")}</dt>
                        <dd className="text-zinc-800">{t.recipient_example}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-zinc-500">{ce("shop.training.type")}</dt>
                        <dd className="text-zinc-800">{CATEGORY_LABEL?.[t.category] ?? t.category}</dd>
                      </div>
                      {t.trainees != null && (
                        <div className="flex gap-1.5">
                          <dt className="text-zinc-500">{ce("shop.training.seats")}</dt>
                          <dd className="tabular-nums text-zinc-800">{t.trainees}</dd>
                        </div>
                      )}
                      {unlock && (
                        <div className="flex gap-1.5">
                          <dt className="text-zinc-500">{ce("shop.training.unlocks")}</dt>
                          <dd className="text-zinc-800">{unlock}</dd>
                        </div>
                      )}
                    </dl>
                    {!funded && (
                      <Link
                        href={wp(shopId ? growHref(shopId, t.cert_unlock ?? undefined) : "/gaps")}
                        prefetch={shopId ? false : undefined}
                        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-800 underline-offset-4 hover:underline"
                      >
                        {ce("shop.ready.fundLink").replace(/\s*→\s*$/, "")}
                        <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
