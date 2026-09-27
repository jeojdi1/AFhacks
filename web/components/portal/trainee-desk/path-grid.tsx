"use client"

// "Path to work" for the laptop: the big number, then one process picture per job.

import type { Job } from "@/lib/api/types"
import { fmtMoney } from "@/lib/format"
import { t } from "@/lib/app/strings"
import { ProcessArt } from "@/components/mobile/art/process-art"

export function PathGrid({ jobs, value, jobsById }: { jobs: string[]; value: number; jobsById: Record<string, Job> }) {
  if (!jobs.length) return null
  const money = fmtMoney(value, { compact: true })
  return (
    <section aria-labelledby="desk-path-title" className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
        <div className="shrink-0 lg:w-64">
          <h2 id="desk-path-title" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("seat.path")}
          </h2>
          <p className="sr-only">{t("seat.pathLine", { count: jobs.length, jobs: jobs.join(" · "), value: money })}</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight tabular-nums" aria-hidden>
            {money}
          </p>
          <p className="mt-1 text-base text-muted-foreground" aria-hidden>
            {jobs.length} {jobs.length === 1 ? "job" : "jobs"} waiting at your shop
          </p>
        </div>
        <ul className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {jobs.map((id) => {
            const job = jobsById[id]
            return (
              <li key={id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
                <ProcessArt tags={job?.process_tags ?? null} className="size-16" />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-medium">{id}</p>
                  {job ? (
                    <>
                      <p className="truncate text-sm text-muted-foreground" title={job.description}>
                        {job.description}
                      </p>
                      <p className="text-lg font-semibold tabular-nums">{fmtMoney(job.est_value_cad, { compact: true })}</p>
                    </>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
