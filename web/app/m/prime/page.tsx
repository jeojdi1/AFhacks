"use client"

// /m/prime: Northgate's supplier-development lead on a shop floor (T6 §2.6).
//   0. "What you can do now": fund training, reply to questions, approve funding
//      requests, re-place declined jobs (PrimeActions)
//   1. GlanceCard from the ledger
//   2. Activity from useAppActions().events, newest first
//   3. Supplier status: certifications in their renewal window, with credit at risk
//
// Live mode: useDemo() in this tab does not hear route/fund steps taken on the
// laptop until reload, so the page re-reads ledger, assignments and jobs from
// the engine whenever a routed/package_funded event arrives (and on Refresh).
// Fixture mode: useDemo() is already mirrored across tabs by the actions store.

import * as React from "react"
import { Activity, Inbox } from "lucide-react"
import { useDemo } from "@/lib/data/store"
import type { Assignment, AssignmentsResponse, Job, JobsResponse, LedgerResponse } from "@/lib/api/types"
import { appFetch } from "@/lib/app/api"
import { decisionKey, onAppRefresh, shopInfo, useAppActions } from "@/lib/app/actions-store"
import { APP_PROGRAM_ID } from "@/lib/app/types"
import { feedItems, type FeedContext } from "@/lib/app/feed"
import { t } from "@/lib/app/strings"
import { UnreachableNotice } from "@/components/mobile/shell/unreachable-notice"
import { useConnection } from "@/lib/app/connection"
import { Button } from "@/components/ui/button"
import { GlanceCard } from "@/components/mobile/prime/glance-card"
import { ActivityItem } from "@/components/mobile/prime/activity-item"
import { SupplierStatus, useSupplierRenewals } from "@/components/mobile/prime/supplier-status"
import { PrimeActions } from "@/components/mobile/prime/prime-actions"

const PAGE = 12

interface LiveProgram {
  ledger: LedgerResponse | null
  assignments: Assignment[]
  jobs: Job[]
}

/** Program data for this page: the engine's current view in live mode, useDemo() otherwise. */
function useProgramData(): LiveProgram & { routed: boolean } {
  const demo = useDemo()
  const { events } = useAppActions()
  const [live, setLive] = React.useState<LiveProgram | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => onAppRefresh(() => setTick((n) => n + 1)), [])

  // Re-read when the program changes shape: a routing or funding event, or an event reset.
  const stepKey = React.useMemo(
    () =>
      events
        .filter((e) => e.kind === "routed" || e.kind === "package_funded")
        .map((e) => e.seq)
        .join(",") + `|${events.length === 0 ? "empty" : "some"}`,
    [events]
  )

  const { ready, mode, apiUrl, stage } = demo
  // The ledger read is a 400 before routing, so only ask once the program is routed.
  const engineRouted = events.some((e) => e.kind === "routed") || stage === "routed" || stage === "funded"
  React.useEffect(() => {
    if (!ready || mode !== "live") return
    let cancelled = false
    if (!engineRouted) {
      queueMicrotask(() => {
        if (!cancelled) setLive({ ledger: null, assignments: [], jobs: [] })
      })
      return () => {
        cancelled = true
      }
    }
    const p = `/programs/${APP_PROGRAM_ID}`
    void (async () => {
      try {
        const [ledger, a, j] = await Promise.all([
          appFetch<LedgerResponse>(apiUrl, `${p}/ledger`, { timeoutMs: 8000 }).catch(() => null),
          appFetch<AssignmentsResponse>(apiUrl, `${p}/assignments`, { timeoutMs: 8000 }),
          appFetch<JobsResponse>(apiUrl, `${p}/jobs`, { timeoutMs: 8000 }).catch(() => null),
        ])
        if (!cancelled) setLive({ ledger, assignments: a.assignments ?? [], jobs: j?.jobs ?? [] })
      } catch {
        if (!cancelled) setLive(null) // fall back to useDemo()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready, mode, apiUrl, stage, stepKey, tick, engineRouted])

  const src: LiveProgram =
    mode === "live" && live
      ? { ledger: live.ledger, assignments: live.assignments, jobs: live.jobs.length ? live.jobs : demo.jobs }
      : { ledger: demo.ledger, assignments: demo.assignments, jobs: demo.jobs }
  return { ...src, routed: src.assignments.length > 0 }
}

export default function PrimeFeedPage() {
  const demo = useDemo()
  const actions = useAppActions()
  const { ledger, assignments, jobs, routed } = useProgramData()
  const [showAll, setShowAll] = React.useState(false)

  const jobsById = React.useMemo(() => {
    const m: Record<string, Job> = {}
    for (const j of jobs) m[j.id] = j
    return m
  }, [jobs])

  const { renewals, loading: suppliersLoading } = useSupplierRenewals(routed ? assignments : [], jobsById)

  const ctx = React.useMemo<FeedContext>(
    () => ({
      prime: (demo.program?.prime_name ?? "Northgate").split(" ")[0] || "Northgate",
      packages: demo.gaps?.suggestions ?? [],
      shopEmail: (id) => shopInfo(id)?.contact_role_email ?? null,
    }),
    [demo.program, demo.gaps]
  )

  const items = React.useMemo(() => feedItems(actions.events, ledger, renewals, ctx), [actions.events, ledger, renewals, ctx])
  const activity = items.filter((i) => i.section === "activity")
  const supplier = items.filter((i) => i.section === "supplier")
  const shown = showAll ? activity : activity.slice(0, PAGE)

  // Highlight rows that arrived while the page was open.
  const [openSeq, setOpenSeq] = React.useState<number | null>(null)
  const maxSeq = actions.events.reduce((m, e) => Math.max(m, e.seq), 0)
  React.useEffect(() => {
    if (!actions.ready) return
    queueMicrotask(() => setOpenSeq((cur) => (cur === null || maxSeq < cur ? maxSeq : cur)))
  }, [actions.ready, maxSeq])

  const replies = React.useMemo(() => {
    if (!routed) return null
    let accepted = 0
    let declined = 0
    for (const a of assignments) {
      const d = actions.decisions[decisionKey(a.shop_id, a.job_id)]?.decision
      const s = d === "accepted" || d === "declined" ? d : d ? "offered" : a.status
      if (s === "accepted") accepted++
      else if (s === "declined") declined++
    }
    return { waiting: assignments.length - accepted - declined, accepted, declined }
  }, [routed, assignments, actions.decisions])

  const fundedCount = React.useMemo(() => {
    const ids = new Set<string>(demo.fundedIds)
    for (const e of actions.events) if (e.kind === "package_funded" && e.package_id) ids.add(e.package_id)
    return ids.size
  }, [demo.fundedIds, actions.events])

  const risk = supplier.length ? { count: supplier.length, credit: supplier.reduce((s, i) => s + (i.credit_cad ?? 0), 0) } : null
  const loading = !demo.ready || !actions.ready
  const { unreachable } = useConnection()

  return (
    <div className="flex flex-col gap-6 pt-2">
      {unreachable ? <UnreachableNotice stale={routed} /> : null}
      {unreachable && !routed ? null : <PrimeActions />}
      {unreachable && !routed ? null : loading ? (
        <div className="h-56 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" aria-hidden />
      ) : (
        <GlanceCard ledger={routed ? ledger : null} fundedCount={fundedCount} replies={replies} risk={risk} />
      )}

      <section aria-labelledby="activity-title" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="activity-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Activity className="size-5 text-muted-foreground" aria-hidden />
            {t("prime.activity.title")}
          </h2>
          {activity.length ? <span className="text-sm text-muted-foreground">{t("prime.activity.count", { count: activity.length })}</span> : null}
        </div>
        <div aria-live="polite" aria-relevant="additions" className="contents">
          {loading ? (
            <div className="h-20 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" aria-hidden />
          ) : activity.length === 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted p-4" data-testid="activity-empty">
              <Inbox className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="text-base font-medium">{t("prime.activity.empty")}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{t("prime.activity.emptyBody")}</p>
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {shown.map((it) => (
                <ActivityItem key={it.id} item={it} fresh={openSeq !== null && it.seq > openSeq} />
              ))}
            </ul>
          )}
        </div>
        {!showAll && activity.length > PAGE ? (
          <Button variant="outline" size="touch" onClick={() => setShowAll(true)} className="w-full">
            {t("prime.activity.showAll", { count: activity.length })}
          </Button>
        ) : null}
      </section>

      <SupplierStatus items={supplier} routed={routed && !loading} loading={suppliersLoading} />
    </div>
  )
}
