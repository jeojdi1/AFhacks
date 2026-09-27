"use client"

// One "is this training plan funded?" check for the desktop desks (/college, /trainee),
// matching the phone's seat card (components/mobile/trainee/seat-card.tsx): funded when this
// tab funded it, when the engine's gaps say so, or when the polled event log has a
// package_funded event (live mode: Fund clicked in another browser or on the laptop).

import * as React from "react"
import { useDemo } from "@/lib/data/store"
import { useAppActions } from "@/lib/app/actions-store"
import { isFunded } from "@/lib/app/readiness"
import type { TrainingPackage } from "@/lib/api/types"

export function usePackageFunded(): (pkg: TrainingPackage | string | null | undefined) => boolean {
  const { gaps, fundResults, fundedIds } = useDemo()
  const { fundingRequests, events } = useAppActions()
  const fundedByEvent = React.useMemo(() => {
    const ids = new Set<string>()
    for (const e of events) if (e.kind === "package_funded" && e.package_id) ids.add(e.package_id)
    return ids
  }, [events])

  return React.useCallback(
    (p) => {
      if (!p) return false
      const id = typeof p === "string" ? p : p.id
      const pkg = typeof p === "string" ? (gaps?.suggestions.find((s) => s.id === id) ?? fundResults[id]?.package ?? null) : p
      if (fundedByEvent.has(id)) return true
      const request = fundingRequests[id] ?? null
      if (pkg) return isFunded(pkg, { fundResults, fundedIds }, null, request)
      return fundedIds.includes(id) || !!fundResults[id] || request?.status === "funded"
    },
    [gaps, fundResults, fundedIds, fundingRequests, fundedByEvent]
  )
}
