"use client"

import { CloudUpload, WifiOff } from "lucide-react"
import { useAppActions } from "@/lib/app/actions-store"
import { useConnection } from "@/lib/app/connection"
import { fmtTime } from "@/lib/app/today"
import { t } from "@/lib/app/strings"

/**
 * "Offline · showing 9:42 PM data · 2 actions waiting" while the phone is offline,
 * "Can't reach Shieldworks · …" while it is online but the engine is not answering, or
 * "Sending 2 actions…" while the outbox drains. Icon + text, never colour alone.
 * With nothing saved yet it says so instead of showing a placeholder time.
 */
export function OfflineBanner() {
  const { pending, ready } = useAppActions()
  const { disconnected, reason, lastSyncAt } = useConnection()
  if (!ready || (!disconnected && pending === 0)) return null
  const p = reason === "engine" ? "unreach" : "offline"
  const text = !disconnected
    ? t("offline.sending", { count: pending })
    : !lastSyncAt
      ? t(`${p}.noData`)
      : pending > 0
        ? t(`${p}.banner`, { time: fmtTime(lastSyncAt), count: pending })
        : t(`${p}.noPending`, { time: fmtTime(lastSyncAt) })
  const Icon = disconnected ? WifiOff : CloudUpload
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-blocked/30 bg-blocked-soft px-4 py-2.5 text-sm font-medium text-blocked"
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  )
}
