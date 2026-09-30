"use client"

import type { Job } from "@/lib/api/types"
import { fmtMoney } from "@/lib/format"
import { t } from "@/lib/app/strings"
import { isWeldingTrade, type Trade } from "@/lib/trades"
import { PartThumb } from "./seat-art"

/** Big number first ($ and job count), then one part thumbnail per job. The full sentence stays for screen readers. */
export function PathToWork({
  jobs,
  value,
  jobsById,
  trade,
}: {
  jobs: string[]
  value: number
  jobsById: Record<string, Job>
  /** Another trade's package: "Your training helps unlock …" instead of the welder "ticket". */
  trade?: Trade | null
}) {
  if (!jobs.length) return null
  const money = fmtMoney(value, { compact: true })
  const lineKey = trade && !isWeldingTrade(trade) ? "seat.pathLineTrade" : "seat.pathLine"
  return (
    <section aria-labelledby="path-title" className="rounded-xl border border-border bg-card p-4">
      <h3 id="path-title" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t("seat.path")}
      </h3>
      <p className="sr-only">{t(lineKey, { count: jobs.length, jobs: jobs.join(" · "), value: money })}</p>
      <div className="mt-1 flex items-baseline gap-2" aria-hidden>
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{money}</span>
        <span className="text-base text-muted-foreground">· {jobs.length} jobs unlocked</span>
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {jobs.map((id, i) => {
          const job = jobsById[id]
          return (
            <li key={id} className="flex flex-col items-center gap-1 rounded-lg bg-muted p-2 text-center" title={job?.description}>
              <PartThumb variant={i} className="size-12" />
              <span className="font-mono text-sm font-medium">{id}</span>
              {job ? (
                <span className="text-xs tabular-nums text-muted-foreground">{fmtMoney(job.est_value_cad, { compact: true })}</span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
