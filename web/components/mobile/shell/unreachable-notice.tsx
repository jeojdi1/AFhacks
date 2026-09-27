"use client"

import * as React from "react"
import { RotateCw, WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { useConnection } from "@/lib/app/connection"
import { fmtTime } from "@/lib/app/today"
import { t } from "@/lib/app/strings"
import { Button } from "@/components/ui/button"

/**
 * "Can't reach Muster right now" with a Try again button. Screens show it instead of
 * their "Northgate hasn't sent offers yet" empty state when the data could not load
 * (live mode, phone offline or engine down), and above stale data otherwise.
 * `stale`: data from an earlier load is on screen (the body says when it was saved).
 */
export function UnreachableNotice({ stale = false, className }: { stale?: boolean; className?: string }) {
  const { reason, lastSyncAt, retry } = useConnection()
  const [busy, setBusy] = React.useState(false)
  const onRetry = async () => {
    setBusy(true)
    try {
      await retry()
    } finally {
      setBusy(false)
    }
  }
  const body = stale && lastSyncAt ? t("unreach.bodyStale", { time: fmtTime(lastSyncAt) }) : t("unreach.bodyNone")
  return (
    <div
      role="status"
      data-testid="unreachable-notice"
      className={cn("flex flex-col gap-3 rounded-xl border border-blocked/30 bg-blocked-soft p-4 text-foreground", className)}
    >
      <p className="flex items-start gap-2 text-base font-semibold text-blocked">
        <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden />
        {reason === "device" ? t("unreach.titleOffline") : t("unreach.title")}
      </p>
      <p className="text-base text-foreground/80">{body}</p>
      <Button size="touch" variant="outline" className="self-start bg-background" onClick={() => void onRetry()} disabled={busy}>
        <RotateCw className={cn("size-5", busy && "animate-spin motion-reduce:animate-none")} aria-hidden />
        {busy ? t("unreach.retrying") : t("unreach.retry")}
      </Button>
    </div>
  )
}
