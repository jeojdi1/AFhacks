"use client"

// Declined jobs Northgate has sent to another shop (demo re-offer, docs/api.md §6): the
// engine's `reoffered` events since the latest routing, plus re-offers made from this browser
// (useDemo().reoffers, the only record in demo-data mode). A re-offer never changes the
// assignment, its credit or the promise %: it only resolves the decline in Northgate's lists.

import * as React from "react"
import { useDemo, type Reoffer } from "@/lib/data/store"
import { useAppActions } from "@/lib/app/actions-store"

/** job_id → the shop it was re-offered to (the latest re-offer wins). */
export function useReoffers(): Map<string, Reoffer> {
  const { reoffers, stage } = useDemo()
  const { events, routedAt } = useAppActions()
  return React.useMemo(() => {
    const out = new Map<string, Reoffer>()
    if (stage !== "routed" && stage !== "funded") return out
    let since: Reoffer[] = []
    for (const e of events) {
      const kind = e.kind
      if (kind === "routed") since = []
      else if (kind === "reoffered" && e.job_id && e.shop_id) {
        const from = (e.payload ?? {})["from_shop_id"]
        since.push({
          job_id: e.job_id,
          shop_id: e.shop_id,
          shop_name: e.shop_name,
          from_shop_id: typeof from === "string" ? from : null,
          at: e.ts,
        })
      }
    }
    for (const r of since) out.set(r.job_id, r)
    for (const r of Object.values(reoffers)) {
      if (routedAt && r.at < routedAt) continue // made before the latest routing
      const cur = out.get(r.job_id)
      if (!cur || cur.at < r.at) out.set(r.job_id, r)
    }
    return out
  }, [reoffers, stage, events, routedAt])
}

/** True when this shop's decline on this job is resolved: the job went to another shop since. */
export function declineResolved(reoffers: Map<string, Reoffer>, shopId: string, jobId: string): boolean {
  const r = reoffers.get(jobId)
  return !!r && r.shop_id !== shopId
}
