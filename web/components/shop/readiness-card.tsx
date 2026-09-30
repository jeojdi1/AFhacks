"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { ArrowRight, CalendarX, CheckCircle2, ChevronDown, ExternalLink, Send, Sparkles, Target } from "lucide-react"
import { fmtLongDate } from "@/lib/app/today"
import { ruleFor } from "@/lib/app/renewals"
import { cn } from "@/lib/utils"
import { fmtMoney } from "@/lib/format"
import { Term } from "@/components/muster/term"
import { c } from "@/lib/ui/copy"
import { ce } from "@/lib/ui/copy-e"
import { certPlain } from "@/lib/ui/plain"
import { useWithParams } from "@/lib/ui/use-with-params"
import { growHref } from "@/lib/app/readiness"
import { TermText, certShortLabel } from "./badges"
import type { JobInfo, ReadinessT, TrainingT } from "./types"
import { isWeldingTrade, tradeForRequirement, workerNoun } from "@/lib/trades"
import { commonPackageTrade } from "@/lib/ui/trade-copy"

/**
 * Engine readiness messages ("Get CWB W47.1 → qualify for 3 more jobs worth $5.1M") are kept
 * verbatim for the demo; the cert name inside is wrapped in <Term> so it carries its gloss.
 */
function MessageWithTerm({ message, requirement }: { message: string; requirement?: string | null }) {
  const short = requirement ? certShortLabel(requirement) : ""
  const at = short ? message.indexOf(short) : -1
  if (!requirement || at < 0 || !certPlain(requirement).tip) return <>{message}</>
  return (
    <>
      {message.slice(0, at)}
      <Term k={requirement.startsWith("NADCAP") ? "NADCAP" : requirement}>{short}</Term>
      {message.slice(at + short.length)}
    </>
  )
}

/** One plain line under the heading: the CWB line from §8.6, else the cert's plain meaning. */
function plainLine(item: ReadinessT): string | null {
  if (item.kind !== "cert" || !item.requirement) return null
  if (item.renewal) {
    // A lapsed certificate (v0.6): when it lapsed and what that means (data/rules/renewals.json).
    const when = item.lapsed_on ? `It lapsed on ${fmtLongDate(item.lapsed_on)}.` : "It has lapsed."
    const rule = ruleFor(item.requirement)
    return `${when} ${rule.consequence}`
  }
  if (item.requirement === "CWB_W47.1") return c("shop.ready.cwb.plain")
  const p = certPlain(item.requirement)
  return p.tip ? `${p.first}: ${p.tip}` : null
}

function JobList({ ids, jobInfo }: { ids: string[]; jobInfo: Record<string, JobInfo> }) {
  return (
    <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-muted/50">
      {ids.map((id) => {
        const info = jobInfo[id]
        return (
          <li key={id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-mono text-xs text-muted-foreground">{info?.part_no ?? id}</span>
              {info && <span className="ml-2 text-foreground"><TermText text={info.description} /></span>}
            </span>
            {info?.value_cad != null && (
              <span className="shrink-0 text-muted-foreground tabular-nums">{fmtMoney(info.value_cad, { compact: true })}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function trainingFor(item: ReadinessT, training: TrainingT[]): TrainingT | undefined {
  return training.find(
    (t) =>
      (item.kind === "cert" && t.cert_unlock === item.requirement) ||
      (item.kind === "capacity" && t.capacity_unlock != null && Object.keys(t.capacity_unlock).length > 0)
  )
}

/**
 * The shop page's first card (§5.5 "readiness hero"): what one step would unlock.
 * Before funding: "Get CWB W47.1 → qualify for 3 more jobs worth $5.1M" + the plain line + a
 * link to /gaps. After funding the CWB message is never shown (the next item, ISO 9001, is).
 */
export function ReadinessCard({
  items,
  jobInfo,
  training,
  routed,
  funded,
  shopId,
  fundingRequested = [],
}: {
  items: ReadinessT[]
  jobInfo: Record<string, JobInfo>
  training: TrainingT[]
  routed: boolean
  /** The demo has funded training: never show the CWB readiness message again. */
  funded: boolean
  /** The shop's own "ask Northgate to fund this" screen; only Northgate funds training on /gaps. */
  shopId?: string
  /** Requirements the shop asked Northgate to fund ("Ask Northgate to fund this"), not yet funded. */
  fundingRequested?: string[]
}) {
  const wp = useWithParams()
  const [open, setOpen] = useState(false)
  const shown = funded ? items.filter((i) => !(i.kind === "cert" && i.requirement === "CWB_W47.1")) : items
  const top = shown[0]
  const rest = shown.slice(1)
  const fundedEntries = training.filter((t) => t.status === "funded")
  const fundedSeats = fundedEntries.reduce((s, t) => s + (t.trainees ?? 0), 0)
  // Every trade: "welder training seats" only when the funded training trains welders.
  const fundedTrade = commonPackageTrade(fundedEntries)
  const fundedWelding = isWeldingTrade(fundedTrade)

  let body: ReactNode
  if (!routed) {
    body = (
      <p className="flex items-center gap-3 text-[15px] text-muted-foreground">
        <Sparkles className="size-5 shrink-0 text-slate-300" aria-hidden />
        {ce("shop.ready.notRouted")}
      </p>
    )
  } else if (!top) {
    body = (
      <p className="flex items-center gap-3 text-[15px] text-muted-foreground">
        <Sparkles className="size-5 shrink-0 text-slate-300" aria-hidden />
        {ce("shop.ready.none")}
      </p>
    )
  } else {
    const jobs = top.jobs_unlocked ?? []
    const t = trainingFor(top, training)
    const line = plainLine(top)
    body = (
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "mt-1 hidden size-10 shrink-0 items-center justify-center rounded-lg text-white sm:flex",
            top.renewal ? "bg-red-700" : "bg-teal-700"
          )}
        >
          {top.renewal ? <CalendarX className="size-5" aria-hidden /> : <Target className="size-5" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl leading-snug font-semibold tracking-tight text-balance text-foreground sm:text-2xl" data-readiness-message>
            <MessageWithTerm message={top.message} requirement={top.requirement} />
          </h2>
          {line && <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-slate-700">{line}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="text-muted-foreground tabular-nums" title={fmtMoney(top.value_cad)}>
              {ce("shop.ready.jobs", { k: jobs.length, value: fmtMoney(top.value_cad, { compact: true }) })}
            </span>
            {jobs.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex min-h-8 items-center gap-1 font-medium text-slate-700 hover:text-foreground"
                aria-expanded={open}
              >
                {open ? ce("shop.ready.hideJobs") : ce("shop.ready.showJobs", { k: jobs.length })}
                <ChevronDown className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
              </button>
            )}
            {top.renewal && top.requirement ? (
              <>
                <Link
                  href={wp(shopId ? growHref(shopId, top.requirement) : "/gaps")}
                  prefetch={false}
                  className="inline-flex min-h-8 items-center gap-1 font-semibold text-red-800 underline-offset-4 hover:underline"
                  data-testid="shop-renew-steps"
                >
                  See the steps to renew
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
                {ruleFor(top.requirement).source_url ? (
                  <a
                    href={ruleFor(top.requirement).source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-8 items-center gap-1 text-slate-700 underline-offset-4 hover:underline"
                  >
                    Official rule
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : null}
              </>
            ) : null}
            {!funded && top.requirement && fundingRequested.includes(top.requirement) ? (
              <span
                className="inline-flex min-h-8 items-center gap-1.5 font-semibold text-teal-800"
                title={isWeldingTrade(tradeForRequirement(top.requirement)) ? c("shop.ready.fundRequested.sub") : c("shop.ready.fundRequested.sub.trade")}
                data-testid="shop-funding-requested"
              >
                <Send className="size-3.5" aria-hidden />
                {c("shop.ready.fundRequested")}
              </span>
            ) : t && t.status !== "funded" && !funded && (
              <Link
                href={wp(shopId ? growHref(shopId, top.requirement ?? undefined) : "/gaps")}
                prefetch={shopId ? false : undefined}
                className="inline-flex min-h-8 items-center gap-1 font-semibold text-teal-800 underline-offset-4 hover:underline"
              >
                {c("shop.ready.fundLink").replace(/\s*→\s*$/, "")}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            )}
          </div>
          {open && <JobList ids={jobs} jobInfo={jobInfo} />}
        </div>
      </div>
    )
  }

  return (
    <section data-readiness-hero className="rounded-xl border-2 border-teal-200 bg-card px-5 py-5 sm:px-6">
      <p className="mb-2 text-xs font-semibold tracking-[0.08em] text-teal-800 uppercase">{ce("shop.ready.eyebrow")}</p>
      {body}
      {funded && fundedSeats > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
          {fundedWelding
            ? ce("shop.ready.trainingFunded", { seats: fundedSeats })
            : ce("shop.ready.trainingFunded.trade", { seats: fundedSeats, worker: workerNoun(fundedTrade) })}
        </p>
      )}
      {rest.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{ce("shop.ready.more")}</p>
          <ul className="mt-1.5 space-y-1 text-sm text-slate-700">
            {rest.map((r) => (
              <li key={`${r.kind}:${r.requirement}`}>
                <MessageWithTerm message={r.message} requirement={r.requirement} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
