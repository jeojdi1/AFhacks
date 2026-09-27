"use client"

import Link from "next/link"
import { ArrowRight, GraduationCap, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { CATEGORY_LABEL, PROCESS_LABEL } from "@/lib/format"
import { TrainingStatusBadge, certLabel } from "./badges"
import type { TrainingT } from "./types"

function unlockText(t: TrainingT): string | null {
  const parts: string[] = []
  if (t.cert_unlock) parts.push(certLabel(t.cert_unlock))
  if (t.capacity_unlock) {
    for (const [proc, hours] of Object.entries(t.capacity_unlock)) {
      parts.push(`+${hours} h/week ${PROCESS_LABEL?.[proc] ?? proc}`)
    }
  }
  return parts.length ? parts.join(" · ") : null
}

export function TrainingCard({ training }: { training: TrainingT[] }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <header className="border-b border-zinc-100 px-6 py-5">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Workforce training</h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          Training the prime can fund for this shop&apos;s workers. It counts toward the prime&apos;s ITB
          obligation at 5x (10x for Indigenous workforce development).
        </p>
      </header>
      {training.length === 0 ? (
        <div className="flex items-center gap-3 px-6 py-8 text-sm text-zinc-500">
          <GraduationCap className="size-5 text-zinc-300" aria-hidden />
          No training suggested or funded for this shop yet.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {training.map((t) => {
            const funded = t.status === "funded"
            const unlock = unlockText(t)
            return (
              <li key={t.package_id} className={cn("px-6 py-5", funded && "bg-emerald-50/40")}>
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
                    <p className="mt-1.5 text-xl font-semibold leading-snug tracking-tight text-zinc-900">
                      {t.message}
                    </p>
                    <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      <div className="flex gap-1.5">
                        <dt className="text-zinc-500">Training partner</dt>
                        <dd className="text-zinc-800">{t.recipient_example}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-zinc-500">ITB category</dt>
                        <dd className="text-zinc-800">{CATEGORY_LABEL?.[t.category] ?? t.category}</dd>
                      </div>
                      {t.trainees != null && (
                        <div className="flex gap-1.5">
                          <dt className="text-zinc-500">Trainees</dt>
                          <dd className="tabular-nums text-zinc-800">{t.trainees}</dd>
                        </div>
                      )}
                      {unlock && (
                        <div className="flex gap-1.5">
                          <dt className="text-zinc-500">Unlocks</dt>
                          <dd className="text-zinc-800">{unlock}</dd>
                        </div>
                      )}
                    </dl>
                    {!funded && (
                      <Link
                        href="/gaps"
                        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#B42318] hover:underline"
                      >
                        Fund this on Gaps &amp; Training
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
