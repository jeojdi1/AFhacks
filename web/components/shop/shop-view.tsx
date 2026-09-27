"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { useDemo } from "@/lib/data/store"
import { fmtMoney } from "@/lib/format"
import { Skeleton } from "@/components/ui/skeleton"
import { CapabilitiesCard } from "./capabilities-card"
import { CertificationsCard } from "./certifications-card"
import { OfferInbox } from "./offer-inbox"
import { ReadinessCard } from "./readiness-card"
import { ShopHeader } from "./shop-header"
import { TrainingCard } from "./training-card"
import type { JobInfo, ShopDetail } from "./types"

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: "good" | "warn"
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4">
      <div className="text-sm text-zinc-500">{label}</div>
      <div
        className={
          "mt-1 text-3xl font-semibold tabular-nums tracking-tight " +
          (tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-zinc-900")
        }
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-sm text-zinc-500">{sub}</div>}
    </div>
  )
}

export function ShopView({ id }: { id: string }) {
  const demo = useDemo()
  const { stage, mode, fundResults, jobs, blocked, offerStatus, setOfferStatus } = demo

  // Keep the latest loader in a ref so an unstable function identity never re-triggers the fetch.
  const getShopRef = useRef(demo.getShop)
  useEffect(() => {
    getShopRef.current = demo.getShop
  })

  const fundKey = Object.keys(fundResults ?? {}).sort().join(",")
  const fetchKey = `${id}|${stage}|${mode}|${fundKey}`
  const [result, setResult] = useState<{ key: string; data?: ShopDetail; error?: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    getShopRef
      .current(id)
      .then((data) => {
        if (!cancelled) setResult({ key: fetchKey, data })
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setResult((prev) => ({
            key: fetchKey,
            data: prev?.data,
            error: e instanceof Error ? e.message : String(e),
          }))
      })
    return () => {
      cancelled = true
    }
  }, [id, fetchKey])

  const data = result?.data && result.data.shop.id === id ? result.data : undefined

  const newJobIds = useMemo(() => {
    const s = new Set<string>()
    for (const r of Object.values(fundResults ?? {})) {
      for (const j of r?.unblocked_jobs ?? []) s.add(j.job_id)
    }
    return s
  }, [fundResults])

  const jobInfo = useMemo(() => {
    const m: Record<string, JobInfo> = {}
    for (const j of jobs ?? []) m[j.id] = { part_no: j.part_no, description: j.description, value_cad: j.est_value_cad }
    for (const b of blocked ?? [])
      m[b.job_id] ??= { part_no: b.part_no, description: b.description, value_cad: b.value_cad }
    return m
  }, [jobs, blocked])

  if (!data) {
    if (result?.error) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-5 text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden />
            Could not load shop “{id}”
          </div>
          <p className="mt-1 text-sm">{result.error}</p>
          <Link href="/network" className="mt-3 inline-block text-sm font-medium underline">
            Back to the network
          </Link>
        </div>
      )
    }
    return (
      <div className="space-y-6" aria-busy>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-12">
          <Skeleton className="h-96 lg:col-span-7" />
          <Skeleton className="h-96 lg:col-span-5" />
        </div>
      </div>
    )
  }

  const { shop, certifications, offers, readiness, training } = data
  const routed = stage === "routed" || stage === "funded" || offers.length > 0
  const offeredValue = offers.reduce((s, o) => s + o.value_cad, 0)
  const creditValue = offers.reduce((s, o) => s + o.credit_cad, 0)
  const readinessValue = readiness.reduce((s, r) => s + (r.value_cad ?? 0), 0)
  const readinessJobs = readiness.reduce((s, r) => s + (r.jobs_unlocked?.length ?? 0), 0)
  const funded = training.filter((t) => t.status === "funded")
  const trainees = funded.reduce((s, t) => s + (t.trainees ?? 0), 0)
  const newCount = offers.filter((o) => newJobIds.has(o.job_id)).length

  return (
    <div className="space-y-8">
      <ShopHeader shop={shop} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Defence work offered"
          value={fmtMoney(offeredValue, { compact: true })}
          sub={
            `${offers.length} job${offers.length === 1 ? "" : "s"}` +
            (newCount > 0 ? ` · ${newCount} new after training` : "")
          }
        />
        <Stat
          label="ITB credit it earns the prime"
          value={fmtMoney(creditValue, { compact: true })}
          sub={shop.is_sme ? "Small or mid-sized enterprise (SME): work counts 2x" : "Counts 1x (not an SME)"}
        />
        <Stat
          label="Within reach"
          value={fmtMoney(readinessValue, { compact: true })}
          sub={`${readinessJobs} more job${readinessJobs === 1 ? "" : "s"} one step away`}
          tone={readinessValue > 0 ? "warn" : undefined}
        />
        <Stat
          label="Workers in training"
          value={String(trainees)}
          sub={funded.length > 0 ? "Funded by the prime" : "None funded yet"}
          tone={trainees > 0 ? "good" : undefined}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <OfferInbox
            offers={offers}
            shopId={shop.id}
            newJobIds={newJobIds}
            offerStatus={offerStatus ?? {}}
            onDecide={(jobId, status) => setOfferStatus(shop.id, jobId, status)}
            routed={routed}
          />
        </div>
        <div className="space-y-6 lg:col-span-5">
          <ReadinessCard items={readiness} jobInfo={jobInfo} training={training} routed={routed} />
          <TrainingCard training={training} />
        </div>
      </div>

      <CertificationsCard certifications={certifications} shopId={shop.id} />
      <CapabilitiesCard shop={shop} />
    </div>
  )
}
