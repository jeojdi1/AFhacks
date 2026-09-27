"use client"

import * as React from "react"
import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAppActions } from "@/lib/app/actions-store"
import { fmtTime } from "@/lib/app/today"
import { t } from "@/lib/app/strings"
import { Button } from "@/components/ui/button"

/**
 * "Updated 9:42 PM" + Refresh. Refresh re-reads actions (and flushes the
 * outbox in live mode) and tells open pages to reload their data.
 */
export function FreshnessStamp({ className }: { className?: string }) {
  const { lastSyncAt, refresh, ready } = useAppActions()
  const [busy, setBusy] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    queueMicrotask(() => setMounted(true))
  }, [])

  const onRefresh = async () => {
    setBusy(true)
    try {
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  // Times render only after mount so server HTML never disagrees with the phone's clock.
  const label = !mounted || !ready ? t("empty.loading") : lastSyncAt ? t("fresh.updated", { time: fmtTime(lastSyncAt) }) : t("fresh.never")

  return (
    <div className={cn("flex items-center justify-between gap-2 pl-4 pr-1", className)}>
      <p className="text-sm text-muted-foreground" aria-live="polite" aria-atomic="true">
        {busy ? t("fresh.refreshing") : label}
      </p>
      <Button variant="ghost" size="touch" onClick={() => void onRefresh()} disabled={busy || !ready} className="text-muted-foreground">
        <RefreshCw className={cn("size-5", busy && "animate-spin motion-reduce:animate-none")} aria-hidden />
        {t("fresh.refresh")}
      </Button>
    </div>
  )
}
