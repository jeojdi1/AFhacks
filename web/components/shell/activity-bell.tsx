"use client"

// Desktop ActivityBell (T6 §2.6): the laptop half of the two-sided demo moment.
// A bell with an unread count, a popover with the last 10 events, and a Sonner
// toast for each new shop event while the page is open ("Tallowfield
// Fabricating Ltd. accepted NG-021 (+$1.68M credit)").
//
// Events come from useAppActions(): live mode polls the engine every 3 s while
// visible; fixture mode hears other tabs through the `storage` event. Events the
// laptop caused itself (routed, package_funded) are listed but never toasted.

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Bell, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { shopInfo, useAppActions } from "@/lib/app/actions-store"
import { SHOP_EVENT_KINDS, eventItem, eventToast, type FeedContext } from "@/lib/app/feed"
import { fmtTime } from "@/lib/app/today"
import { t } from "@/lib/app/strings"
import type { AppEvent } from "@/lib/app/types"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

const SEEN_KEY = "muster.app.v1.bellSeen"
/** Events older than this when they first arrive are history, not news. */
const TOAST_MAX_AGE_MS = 2 * 60 * 1000
/** Bottom-right so the stack never covers the bell (the Toaster default is top-right). */
const TOAST_POSITION = "bottom-right" as const
/** At most this many toasts per batch; the rest are summarised. */
const TOAST_BURST = 3

function readSeen(): number {
  try {
    const v = Number(window.localStorage.getItem(SEEN_KEY))
    return Number.isFinite(v) && v > 0 ? v : 0
  } catch {
    return 0
  }
}

function writeSeen(n: number) {
  try {
    window.localStorage.setItem(SEEN_KEY, String(n))
  } catch {
    /* storage unavailable: unread count resets on reload */
  }
}

const isShopEvent = (e: AppEvent) => SHOP_EVENT_KINDS.includes(e.kind)

export function ActivityBell({ className }: { className?: string }) {
  const router = useRouter()
  const { program, gaps } = useDemo()
  const { events, ready } = useAppActions()
  const [open, setOpen] = React.useState(false)
  const [seen, setSeen] = React.useState(0)
  /** Highest seq already considered for a toast; null until the first ready render. */
  const toastedRef = React.useRef<number | null>(null)

  const ctx = React.useMemo<FeedContext>(
    () => ({
      prime: (program?.prime_name ?? "Northgate").split(" ")[0] || "Northgate",
      packages: gaps?.suggestions ?? [],
      shopEmail: (id) => shopInfo(id)?.contact_role_email ?? null,
    }),
    [program, gaps]
  )
  const ctxRef = React.useRef(ctx)
  React.useEffect(() => {
    ctxRef.current = ctx
  }, [ctx])

  const maxSeq = events.reduce((m, e) => Math.max(m, e.seq), 0)

  // Last-seen seq (shared by this browser's tabs). A reset restarts seq at 1, so clamp.
  React.useEffect(() => {
    if (!ready) return
    const stored = readSeen()
    const next = stored > maxSeq ? 0 : stored
    if (next !== stored) writeSeen(next)
    queueMicrotask(() => setSeen(next))
  }, [ready, maxSeq])

  // Toast each new shop event while the page is open.
  React.useEffect(() => {
    if (!ready) return
    if (toastedRef.current === null || maxSeq < toastedRef.current) {
      // First render with data (history, not news), or the demo was reset.
      toastedRef.current = toastedRef.current === null ? maxSeq : 0
      if (toastedRef.current === maxSeq) return
    }
    const since = toastedRef.current
    if (maxSeq <= since) return
    toastedRef.current = maxSeq
    const now = Date.now()
    const fresh = events
      .filter((e) => e.seq > since && isShopEvent(e))
      .filter((e) => {
        const ts = Date.parse(e.ts)
        return !Number.isFinite(ts) || now - ts < TOAST_MAX_AGE_MS
      })
      .sort((a, b) => a.seq - b.seq)
    const burst = fresh.slice(-TOAST_BURST)
    for (const e of burst) {
      const msg = eventToast(e, ctxRef.current)
      if (!msg) continue
      const opts = {
        id: `activity-${e.seq}-${e.ts}`,
        description: msg.description ?? undefined,
        duration: 7000,
        position: TOAST_POSITION,
        action:
          e.kind === "funding_requested"
            ? { label: t("feed.action.review"), onClick: () => router.push("/gaps") }
            : undefined,
      }
      if (msg.tone === "success") toast.success(msg.title, opts)
      else if (msg.tone === "danger" || msg.tone === "warn") toast.warning(msg.title, opts)
      else toast.info(msg.title, opts)
    }
    if (fresh.length > burst.length) {
      toast.info(t("bell.unread", { count: fresh.length - burst.length }), { id: `activity-more-${maxSeq}`, position: TOAST_POSITION })
    }
  }, [ready, maxSeq, events, router])

  const recent = React.useMemo(() => [...events].sort((a, b) => b.seq - a.seq).slice(0, 10), [events])
  const unread = ready ? events.filter((e) => e.seq > seen && isShopEvent(e)).length : 0

  const markRead = React.useCallback(() => {
    writeSeen(maxSeq)
    setSeen(maxSeq)
  }, [maxSeq])

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) markRead()
  }

  const label = unread ? `${t("bell.label")}: ${t("bell.unread", { count: unread })}` : t("bell.label")

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={<Button variant="outline" size="icon-lg" />}
        aria-label={label}
        title={label}
        data-testid="activity-bell"
        className={cn("relative", className)}
      >
        <Bell aria-hidden />
        {unread > 0 ? (
          <span
            data-testid="activity-bell-count"
            className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] leading-none font-semibold text-white tabular-nums ring-2 ring-background"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] gap-0 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">{t("bell.title")}</p>
          <Link
            href="/m/prime"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Smartphone className="size-3.5" aria-hidden />
            {t("bell.openPhone")}
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground" data-testid="activity-bell-empty">
            {t("bell.empty")}
          </p>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto" data-testid="activity-bell-list">
            {recent.map((e) => {
              const it = eventItem(e, null, ctx)
              if (!it) return null
              const dot =
                it.tone === "success"
                  ? "bg-assigned"
                  : it.tone === "danger"
                    ? "bg-destructive"
                    : it.tone === "warn"
                      ? "bg-blocked"
                      : it.tone === "action"
                        ? "bg-brand"
                        : "bg-muted-foreground/50"
              return (
                <li key={it.id} className="flex gap-2.5 px-3 py-2.5">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", dot)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug font-medium">{it.title}</p>
                    {it.detail ? <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{it.detail}</p> : null}
                  </div>
                  <time dateTime={e.ts} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {fmtTime(e.ts)}
                  </time>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
