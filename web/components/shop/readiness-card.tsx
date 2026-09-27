"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, ChevronDown, Sparkles, Target } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtMoney } from "@/lib/format"
import { certLabel } from "./badges"
import type { JobInfo, ReadinessT, TrainingT } from "./types"

const KIND_LABEL: Record<string, string> = {
  cert: "Certification",
  capacity: "Capacity",
  process: "New process",
}

function ReadinessRow({
  item,
  jobInfo,
  training,
}: {
  item: ReadinessT
  jobInfo: Record<string, JobInfo>
  training?: TrainingT
}) {
  const [open, setOpen] = useState(false)
  const jobs = item.jobs_unlocked ?? []
  return (
    <li className="px-6 py-5">
      <div className="flex items-start gap-4">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white">
          <Target className="size-4.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {KIND_LABEL[item.kind] ?? item.kind}
            {item.kind === "cert" && item.requirement ? ` · ${certLabel(item.requirement)}` : ""}
          </div>
          <p className="mt-1 text-xl font-semibold leading-snug tracking-tight text-zinc-900">
            {item.message}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="tabular-nums text-zinc-600">
              <span className="font-semibold text-zinc-900">{jobs.length}</span> job
              {jobs.length === 1 ? "" : "s"} ·{" "}
              <span className="font-semibold text-zinc-900" title={fmtMoney(item.value_cad)}>
                {fmtMoney(item.value_cad, { compact: true })}
              </span>
            </span>
            {jobs.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-zinc-900"
                aria-expanded={open}
              >
                {open ? "Hide jobs" : "Show jobs"}
                <ChevronDown
                  className={cn("size-4 transition-transform", open && "rotate-180")}
                  aria-hidden
                />
              </button>
            )}
            {training && training.status === "suggested" && (
              <Link
                href="/gaps"
                className="inline-flex items-center gap-1 font-medium text-[#B42318] hover:underline"
              >
                Your prime can fund this training
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            )}
          </div>
          {open && (
            <ul className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-zinc-50/60">
              {jobs.map((id) => {
                const info = jobInfo[id]
                return (
                  <li key={id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-zinc-500">
                        {info?.part_no ?? id}
                      </span>
                      {info && <span className="ml-2 text-zinc-800">{info.description}</span>}
                    </span>
                    {info?.value_cad != null && (
                      <span className="shrink-0 tabular-nums text-zinc-600">
                        {fmtMoney(info.value_cad, { compact: true })}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </li>
  )
}

export function ReadinessCard({
  items,
  jobInfo,
  training,
  routed,
}: {
  items: ReadinessT[]
  jobInfo: Record<string, JobInfo>
  training: TrainingT[]
  routed: boolean
}) {
  const totalValue = items.reduce((s, i) => s + (i.value_cad ?? 0), 0)
  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-100 px-6 py-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">What would unlock more work</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Jobs this shop misses on exactly one requirement, grouped by that requirement.
          </p>
        </div>
        {items.length > 0 && (
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums text-zinc-900">
              {fmtMoney(totalValue, { compact: true })}
            </div>
            <div className="text-xs text-zinc-500">within reach</div>
          </div>
        )}
      </header>
      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-6 py-8 text-sm text-zinc-500">
          <Sparkles className="size-5 text-zinc-300" aria-hidden />
          {routed
            ? "Nothing is one step away right now: this shop already qualifies for everything it is close to."
            : "Readiness is computed against a routed work package. Upload and route a parts list first."}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {items.map((item) => (
            <ReadinessRow
              key={`${item.kind}:${item.requirement}`}
              item={item}
              jobInfo={jobInfo}
              training={training.find(
                (t) =>
                  (item.kind === "cert" && t.cert_unlock === item.requirement) ||
                  (item.kind === "capacity" &&
                    t.capacity_unlock != null &&
                    Object.keys(t.capacity_unlock).length > 0)
              )}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
