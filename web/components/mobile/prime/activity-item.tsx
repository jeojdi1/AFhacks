"use client"

// One activity row on /m/prime (T6 §2.6): at least 64 px tall, one verb, one
// button. Tone uses colour + icon + text together (WCAG 1.4.1).

import Link from "next/link"
import { CircleCheck, CircleHelp, CircleX, Clock, HandCoins, Info, Route, ShieldCheck, TriangleAlert, Undo2, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { fmtTime } from "@/lib/app/today"
import type { FeedItem, FeedTone } from "@/lib/app/feed"
import { SimulatedChip } from "@/components/mobile/shell/simulation"

const TONE: Record<FeedTone, string> = {
  success: "bg-assigned-soft text-assigned",
  danger: "bg-destructive/10 text-destructive",
  warn: "bg-blocked-soft text-blocked",
  action: "bg-brand/10 text-brand",
  info: "bg-secondary text-muted-foreground",
}

function KindIcon({ item }: { item: FeedItem }) {
  const cls = "size-5"
  switch (item.kind) {
    case "offer_accepted":
      return <CircleCheck className={cls} aria-hidden />
    case "offer_declined":
      return <CircleX className={cls} aria-hidden />
    case "offer_question":
      return <CircleHelp className={cls} aria-hidden />
    case "offer_undo":
      return <Undo2 className={cls} aria-hidden />
    case "funding_requested":
      return <HandCoins className={cls} aria-hidden />
    case "package_funded":
      return <Wrench className={cls} aria-hidden />
    case "capacity_confirmed":
      return item.tone === "warn" ? <TriangleAlert className={cls} aria-hidden /> : <Clock className={cls} aria-hidden />
    case "cert_declared":
      return <ShieldCheck className={cls} aria-hidden />
    case "routed":
      return <Route className={cls} aria-hidden />
    default:
      return <Info className={cls} aria-hidden />
  }
}

const ID_RE = /([A-Z]{2,}-\d+)/

/** Keeps ids like "NG-022" on one line (browsers otherwise break after the hyphen). */
export function NoBreakIds({ text }: { text: string }) {
  const parts = text.split(ID_RE)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className="whitespace-nowrap">
            {p}
          </span>
        ) : (
          p
        )
      )}
    </>
  )
}

export function ActivityItem({ item, fresh = false }: { item: FeedItem; fresh?: boolean }) {
  const a = item.action
  const btn = cn(buttonVariants({ variant: "outline", size: "touch" }), "shrink-0")
  return (
    <li
      data-testid="activity-item"
      data-kind={item.kind}
      className={cn(
        "flex min-h-16 flex-col gap-2 rounded-xl border border-border bg-card p-3 pl-3.5 shadow-xs",
        fresh && "ring-2 ring-brand/30 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1"
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full", TONE[item.tone])}>
          <KindIcon item={item} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base leading-snug font-semibold break-words">
            <NoBreakIds text={item.title} />
          </p>
          {item.detail ? (
            <p className="mt-0.5 text-sm leading-snug text-muted-foreground break-words">
              <NoBreakIds text={item.detail} />
            </p>
          ) : null}
          {item.simulated ? <SimulatedChip className="mt-1.5" /> : null}
        </div>
        {item.ts ? (
          <time dateTime={item.ts} className="shrink-0 pt-0.5 text-sm text-muted-foreground tabular-nums">
            {fmtTime(item.ts)}
          </time>
        ) : null}
      </div>
      {a ? (
        <div className="flex flex-wrap items-center justify-end gap-2 pl-12">
          {a.disabled || !a.href ? (
            <>
              {a.note ? <span className="text-sm text-muted-foreground">{a.note}</span> : null}
              <button type="button" disabled className={btn} aria-disabled="true">
                {a.label}
              </button>
            </>
          ) : a.external ? (
            <a href={a.href} className={btn}>
              {a.label}
            </a>
          ) : (
            <Link href={a.href} className={btn}>
              {a.label}
            </Link>
          )}
        </div>
      ) : null}
    </li>
  )
}
