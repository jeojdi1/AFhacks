"use client"

// Desktop ActivityBell (T6 §2.6): the laptop half of the two-sided demo moment.
// A bell with an unread count, a popover with the last 10 events, and a Sonner
// toast for each new shop event while the page is open ("Tallowfield
// Fabricating Ltd. accepted NG-021 (+$1.68M credit)").
//
// Events come from useAppActions(): live mode polls the engine every 3 s while
// visible; fixture mode hears other tabs through the `storage` event. Events the
// laptop caused itself (routed, package_funded) are listed but never toasted.
//
// Signed in as a shop, the bell is that shop's own: only its events plus Northgate
// funding its training, with no credit or "counted as routed" prime copy. Events
// written by the demo simulator carry a "Simulated" chip (rows) or prefix (toasts).

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Bell, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { shopInfo, useAppActions } from "@/lib/app/actions-store"
import { SHOP_EVENT_KINDS, eventItem, eventToast, type FeedContext, type FeedItem, type FeedTone } from "@/lib/app/feed"
import { isSimulatedEvent } from "@/lib/app/sim-flag"
import { fmtTime } from "@/lib/app/today"
import { extendStrings, t } from "@/lib/app/strings"
import type { AppEvent } from "@/lib/app/types"
import { useSession } from "@/lib/auth/session"
import { SimulatedChip } from "@/components/mobile/shell/simulation"
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

extendStrings("en", {
  "bell.shop.label": "Your activity",
  "bell.shop.title": "Your activity",
  "bell.shop.empty": "No activity yet. Your answers and Northgate's training decisions appear here.",
  "bell.shop.funded": "{prime} paid for your training ({package})",
  "bell.shop.funded.detail": "{count} jobs unblocked for you: {jobs}",
  "bell.shop.funded.detail_one": "1 job unblocked for you: {jobs}",
  "bell.simPrefix": "Simulated · {title}",
})

const isShopEvent = (e: AppEvent) => SHOP_EVENT_KINDS.includes(e.kind)

/**
 * A row as the signed-in shop sees it: the prime's credit and "counted as routed"
 * notes are dropped, and a funded package reads as news for the shop.
 */
function shopRow(it: FeedItem, e: AppEvent, prime: string): FeedItem {
  switch (e.kind) {
    case "offer_accepted":
    case "offer_declined":
    case "funding_requested":
      return { ...it, detail: null, credit_cad: null }
    case "package_funded": {
      const raw = (e.payload ?? {}).unblocked_job_ids
      const ids = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []
      return {
        ...it,
        title: t("bell.shop.funded", { prime, package: e.package_id ?? "" }),
        detail: ids.length ? t("bell.shop.funded.detail", { count: ids.length, jobs: ids.join(" · ") }) : null,
        credit_cad: null,
      }
    }
    default:
      return it
  }
}

function toastWith(tone: FeedTone, title: string, opts: Parameters<typeof toast.info>[1]) {
  if (tone === "success") toast.success(title, opts)
  else if (tone === "danger" || tone === "warn") toast.warning(title, opts)
  else toast.info(title, opts)
}

export function ActivityBell({ className }: { className?: string }) {
  const router = useRouter()
  const { program, gaps } = useDemo()
  const { events: allEvents, ready } = useAppActions()
  const { session } = useSession()
  /** The signed-in shop's id, or null for the prime / signed out (the full program feed). */
  const viewerShop = session?.role === "shop" ? session.accountId : null
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

  // A shop sees only its own events and Northgate funding one of its training packages.
  const events = React.useMemo(() => {
    if (!viewerShop) return allEvents
    const myPackages = new Set((gaps?.suggestions ?? []).filter((p) => p.shop_id === viewerShop).map((p) => p.id))
    return allEvents.filter(
      (e) => e.shop_id === viewerShop || (e.kind === "package_funded" && !!e.package_id && myPackages.has(e.package_id))
    )
  }, [allEvents, viewerShop, gaps])
  /** Events that count as news (unread, toasted): shop answers for the prime; everything shown for a shop. */
  const isNews = React.useCallback((e: AppEvent) => (viewerShop ? true : isShopEvent(e)), [viewerShop])

  /** The row for an event as this viewer sees it (null for kinds the feed does not show). */
  const rowFor = React.useCallback(
    (e: AppEvent, c: FeedContext): FeedItem | null => {
      const it = eventItem(e, null, c)
      if (!it) return null
      return viewerShop ? shopRow(it, e, c.prime ?? "Northgate") : it
    },
    [viewerShop]
  )

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
      .filter((e) => e.seq > since && isNews(e))
      .filter((e) => {
        const ts = Date.parse(e.ts)
        return !Number.isFinite(ts) || now - ts < TOAST_MAX_AGE_MS
      })
      .sort((a, b) => a.seq - b.seq)
    const burst = fresh.slice(-TOAST_BURST)
    for (const e of burst) {
      let msg: { title: string; description: string | null; tone: FeedTone } | null
      if (viewerShop) {
        const it = rowFor(e, ctxRef.current)
        msg = it ? { title: it.title, description: it.detail, tone: it.tone } : null
      } else {
        msg = eventToast(e, ctxRef.current)
      }
      if (!msg) continue
      // Simulator events must never read as a real shop's answer.
      const title = isSimulatedEvent(e) ? t("bell.simPrefix", { title: msg.title }) : msg.title
      toastWith(msg.tone, title, {
        id: `activity-${e.seq}-${e.ts}`,
        description: msg.description ?? undefined,
        duration: 7000,
        position: TOAST_POSITION,
        action:
          e.kind === "funding_requested" && !viewerShop
            ? { label: t("feed.action.review"), onClick: () => router.push("/gaps") }
            : undefined,
      })
    }
    if (fresh.length > burst.length) {
      toast.info(t("bell.unread", { count: fresh.length - burst.length }), { id: `activity-more-${maxSeq}`, position: TOAST_POSITION })
    }
  }, [ready, maxSeq, events, router, isNews, rowFor, viewerShop])

  const recent = React.useMemo(() => [...events].sort((a, b) => b.seq - a.seq).slice(0, 10), [events])
  const unread = ready ? events.filter((e) => e.seq > seen && isNews(e)).length : 0

  const markRead = React.useCallback(() => {
    writeSeen(maxSeq)
    setSeen(maxSeq)
  }, [maxSeq])

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) markRead()
  }

  const baseLabel = t(viewerShop ? "bell.shop.label" : "bell.label")
  const label = unread ? `${baseLabel}: ${t("bell.unread", { count: unread })}` : baseLabel

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
          <p className="text-sm font-semibold">{t(viewerShop ? "bell.shop.title" : "bell.title")}</p>
          <Link
            href={viewerShop ? `/m/shops/${encodeURIComponent(viewerShop)}` : "/m/prime"}
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Smartphone className="size-3.5" aria-hidden />
            {t("bell.openPhone")}
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground" data-testid="activity-bell-empty">
            {t(viewerShop ? "bell.shop.empty" : "bell.empty")}
          </p>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto" data-testid="activity-bell-list">
            {recent.map((e) => {
              const it = rowFor(e, ctx)
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
                    {it.simulated ? <SimulatedChip className="mt-1.5" /> : null}
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
