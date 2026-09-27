"use client"

import { WifiOff } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useDemo } from "@/lib/data/store"
import { t } from "@/lib/app/strings"
import { SeatCard } from "@/components/mobile/trainee/seat-card"

/**
 * The seat page, unless Shieldworks could not be reached at load and nothing was saved on this phone
 * (`useDemo().loadFailed`): then "This seat isn't funded yet" would be a guess, so the page says
 * it can't reach Shieldworks instead (the phone's UnreachableNotice title). The engine watcher
 * reconnects on its own and the seat card appears.
 */
export function SeatGate({ packageId, seat }: { packageId: string; seat: number | null }) {
  const { ready, loadFailed } = useDemo()
  if (!ready || !loadFailed) return <SeatCard packageId={packageId} seat={seat} />
  return (
    <div className="flex flex-col gap-5 pt-2" data-testid="seat-unreachable">
      <div
        role="status"
        data-testid="unreachable-notice"
        className="flex flex-col gap-3 rounded-xl border border-blocked/30 bg-blocked-soft p-4 text-foreground"
      >
        <p className="flex items-start gap-2 text-base font-semibold text-blocked">
          <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden />
          {t("unreach.title")}
        </p>
        <p className="text-base text-foreground/80">
          Your seat details ({packageId}) will appear here when it&apos;s back. Shieldworks keeps trying on its own.
        </p>
      </div>
    </div>
  )
}

/**
 * GitHub Pages export (static, no server): reads ?seat= in the browser with the same rules as
 * the server page. No ?seat= means seat 1; anything but a whole number from 1 up is null.
 * useSearchParams needs a Suspense boundary (page.tsx wraps it).
 */
export function SeatGateFromUrl({ packageId }: { packageId: string }) {
  const raw = useSearchParams().get("seat") ?? undefined
  const seat = raw === undefined || raw === "" ? 1 : /^\d+$/.test(raw.trim()) && Number(raw) > 0 ? Number(raw) : null
  return <SeatGate packageId={packageId} seat={seat} />
}
