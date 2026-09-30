"use client"

import { CircleCheck, CircleDashed, Clock, ExternalLink, GraduationCap, Send } from "lucide-react"
import { cn } from "@/lib/utils"
import { t } from "@/lib/app/strings"
import { fmtDay } from "@/lib/app/today"
import type { GrowItem } from "@/lib/app/readiness"
import { fundedChipText } from "@/lib/app/copy"

const CHIP = "inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm leading-tight font-medium"

/** "One gap" / "Funded · training under way" (not certified yet): colour, icon and text together. */
export function TierChip({ tier, className }: { tier: GrowItem["tier"]; className?: string }) {
  if (tier === "in_training") {
    return (
      <span className={cn(CHIP, "border-funded/30 bg-funded-soft text-funded", className)}>
        <GraduationCap className="size-3.5" aria-hidden />
        {t("grow.tier.inTraining")}
      </span>
    )
  }
  return (
    <span className={cn(CHIP, "border-blocked/30 bg-blocked-soft text-blocked", className)}>
      <CircleDashed className="size-3.5" aria-hidden />
      {t("grow.tier.oneGap")}
    </span>
  )
}

function trainees(item: GrowItem): number {
  return item.pkg?.trainees ?? item.training?.trainees ?? 0
}

/**
 * Funding request status chip ("Requested Sep 26 · awaiting Northgate" / "Funded · 4 welders in training" / "Funded · 2 CNC machinists in training").
 * With `link`, a funded chip jumps to the seats summary on the same Grow item page (#seats): the
 * shop sees each seat's stage there, never the trainee's private seat card.
 */
export function FundingChip({ item, link = false, className }: { item: GrowItem; link?: boolean; className?: string }) {
  if (item.funding === "funded") {
    const n = trainees(item)
    const text = fundedChipText(item.requirement, n, item.pkg ?? item.training)
    const body = (
      <>
        <GraduationCap className="size-4 shrink-0" aria-hidden />
        <span>{text}</span>
      </>
    )
    if (link && n > 0) {
      return (
        <a
          href="#seats"
          onClick={(e) => {
            const el = document.getElementById("seats")
            if (!el) return
            e.preventDefault()
            const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
            el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
            el.focus({ preventScroll: true })
            try {
              window.history.replaceState(window.history.state, "", "#seats")
            } catch {
              /* no history access */
            }
          }}
          className={cn(
            CHIP,
            "min-h-12 border-funded/30 bg-funded-soft px-4 text-base text-funded outline-none hover:bg-funded/10 focus-visible:ring-3 focus-visible:ring-ring/50",
            className
          )}
        >
          {body}
          <span className="ml-1 underline underline-offset-4">{t("ready.seeSeat")}</span>
        </a>
      )
    }
    return <span className={cn(CHIP, "border-funded/30 bg-funded-soft text-funded", className)}>{body}</span>
  }
  if (item.funding === "requested" && item.request) {
    return (
      <span className={cn(CHIP, "border-public/25 bg-public-soft text-public", className)}>
        <Send className="size-3.5 shrink-0" aria-hidden />
        <span>{t("ready.requested", { date: fmtDay(item.request.at) })}</span>
        {item.request.pending ? (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-background px-1.5 text-xs text-muted-foreground">
            <Clock className="size-3" aria-hidden />
            {t("offline.willSend")}
          </span>
        ) : null}
      </span>
    )
  }
  return null
}

/** Evidence flag for a step: "official source" / "inferred" / "assumption". */
export function FlagChip({ flag }: { flag: "verified" | "inferred" | "assumption" }) {
  const cls =
    flag === "verified"
      ? "border-assigned/25 bg-assigned-soft text-assigned"
      : flag === "inferred"
        ? "border-slate-300 bg-slate-50 text-slate-700"
        : "border-dashed border-slate-400 bg-background text-slate-600"
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium", cls)}>
      {flag === "verified" ? <CircleCheck className="size-3" aria-hidden /> : <CircleDashed className="size-3" aria-hidden />}
      {t(`ready.flag.${flag}`)}
    </span>
  )
}

/** External link row (opens in a new tab), 44 px tall. */
export function SourceLink({ href, label, className }: { href: string; label: string; className?: string }) {
  let host = href
  try {
    host = new URL(href).hostname.replace(/^www\./, "")
  } catch {
    /* keep the raw href */
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-md text-sm font-medium text-foreground underline decoration-border underline-offset-4 outline-none hover:decoration-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
    >
      <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">
        {label} · {host}
      </span>
    </a>
  )
}
