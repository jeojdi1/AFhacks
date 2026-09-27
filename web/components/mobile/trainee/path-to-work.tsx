"use client"

import { Briefcase } from "lucide-react"
import type { Job } from "@/lib/api/types"
import { fmtMoney } from "@/lib/format"
import { t } from "@/lib/app/strings"

/** "Your ticket helps unlock 3 jobs at your shop: NG-031 · NG-032 · NG-033 ($5.1M)". */
export function PathToWork({ jobs, value, jobsById }: { jobs: string[]; value: number; jobsById: Record<string, Job> }) {
  if (!jobs.length) return null
  return (
    <section aria-labelledby="path-title" className="rounded-xl border border-border bg-card p-4">
      <h3 id="path-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Briefcase className="size-5 text-muted-foreground" aria-hidden />
        {t("seat.path")}
      </h3>
      <p className="mt-2 text-base leading-snug">
        {t("seat.pathLine", { count: jobs.length, jobs: jobs.join(" · "), value: fmtMoney(value, { compact: true }) })}
      </p>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {jobs.map((id) => (
          <li key={id} className="py-2">
            <span className="font-mono text-sm font-medium">{id}</span>
            {jobsById[id] ? (
              <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{jobsById[id].description}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
