"use client"

// Picture-first pieces for Northgate's desk (/prime): promise ring, welding pictogram,
// reply tiles and a small (i) popover that holds the longer explanations.
// Every number is passed in from the desk (useDemo); nothing here is hardcoded.

import * as React from "react"
import { CheckCircle2, Clock, Info, XCircle, type LucideIcon } from "lucide-react"
import type { LedgerResponse } from "@/lib/api/types"
import { cn } from "@/lib/utils"
import { fmtMoney, fmtPct } from "@/lib/format"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CREDIT_EXPLAINER, Plain, TIP } from "./plain"
import { moneyShort } from "./promise-meter"

/** Small (i) button: the explanation lives in a popover instead of on the card. */
export function InfoTip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring",
          className
        )}
      >
        <Info className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 leading-relaxed text-slate-700">{children}</PopoverContent>
    </Popover>
  )
}

/** Progress ring: credit so far as a share of what Northgate owes. */
function Ring({ pct }: { pct: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  const w = Math.max(0, Math.min(1, pct))
  return (
    <svg viewBox="0 0 128 128" className="size-32 shrink-0 -rotate-90" aria-hidden>
      <circle cx="64" cy="64" r={r} fill="none" strokeWidth="14" className="stroke-muted" />
      {w > 0 ? (
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${c * w} ${c}`}
          className="stroke-assigned transition-[stroke-dasharray] duration-500 motion-reduce:transition-none"
        />
      ) : null}
    </svg>
  )
}

/**
 * "The promise" as a picture: a ring with the % in the middle, the credit big beside it.
 * The long explanation moved behind (i). Guardrail chips stay on screen.
 */
export function PromiseRing({ ledger, obligation }: { ledger: LedgerResponse | null; obligation: number }) {
  const total = ledger?.obligation_cad ?? obligation
  const credit = ledger?.credit_total_cad ?? 0
  const pct = ledger?.obligation_met_pct ?? 0
  const width = Math.max(0, Math.min(1, pct))
  return (
    <div className="flex flex-col gap-3" data-testid="promise-meter">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div
          className="relative"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(width * 1000) / 10}
          aria-label="Share of what Northgate owes, covered by credit so far"
        >
          <Ring pct={pct} />
          <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold tabular-nums">
            {fmtPct(pct)}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          {ledger ? (
            <>
              <span className="text-sm font-medium text-muted-foreground">Credit so far</span>
              <span className="text-5xl leading-none font-semibold tracking-tight tabular-nums" title={fmtMoney(credit)}>
                {fmtMoney(credit, { compact: true })}
              </span>
              <span className="flex items-center gap-1 text-lg text-slate-700">
                of {fmtMoney(total, { compact: true })} Northgate owes
                <InfoTip label="What is credit?">
                  <p>{CREDIT_EXPLAINER}</p>
                  <p>
                    The promise comes from <Plain label="Canada's defence-contract rule" abbr="ITB" tip={TIP.ITB} />; this
                    credit is from one parts list.
                  </p>
                </InfoTip>
              </span>
            </>
          ) : (
            <>
              <span className="text-5xl leading-none font-semibold tracking-tight tabular-nums">
                {fmtMoney(total, { compact: true })}
              </span>
              <span className="text-lg text-slate-700">Northgate owes Canada in business. No credit yet.</span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex h-5 items-center rounded-full border border-slate-300 px-2 font-medium text-slate-600">
          Simplified ITB rules for demo
        </span>
        {ledger?.smb ? (
          <span className="inline-flex items-center gap-1.5">
            Small-business target: {moneyShort(ledger.smb.achieved_cad)} of {moneyShort(ledger.smb.target_cad)} (
            {fmtPct(ledger.smb.progress_pct, 0)})
            <AssumptionTag note={`Basis: ${ledger.smb.basis}`} />
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** Welding pictogram: torch, arc sparks and a bead on a plate. Decorative. */
export function WeldArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={cn("size-24 shrink-0", className)} aria-hidden>
      <circle cx="48" cy="48" r="46" className="fill-blocked/10" />
      {/* plate + bead */}
      <rect x="16" y="66" width="64" height="10" rx="2" className="fill-slate-300" />
      <path d="M22 66c4-4 8 0 12-4s8 0 12-4" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-slate-500" />
      {/* torch */}
      <path d="M70 18 50 50" strokeWidth="9" strokeLinecap="round" className="stroke-slate-700" />
      <path d="M52 47 46 57" strokeWidth="5" strokeLinecap="round" className="stroke-slate-500" />
      {/* arc + sparks */}
      <circle cx="46" cy="60" r="5" className="fill-blocked" />
      <g strokeWidth="3" strokeLinecap="round" className="stroke-blocked">
        <path d="M36 54l-6-4" />
        <path d="M38 64l-8 3" />
        <path d="M46 49l-1-7" />
        <path d="M55 62l7 3" />
      </g>
    </svg>
  )
}

/** One row of dots per job: filled = matched. Decorative (the numbers are in text). */
export function JobDots({ matched, total }: { matched: number; total: number }) {
  const n = Math.max(0, Math.min(total, 60))
  return (
    <div className="flex flex-wrap gap-1" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={cn("size-2.5 rounded-full", i < matched ? "bg-assigned" : "bg-blocked")} />
      ))}
    </div>
  )
}

const TILE: Record<"accepted" | "waiting" | "declined", { Icon: LucideIcon; tone: string; bg: string }> = {
  accepted: { Icon: CheckCircle2, tone: "text-assigned", bg: "bg-assigned-soft" },
  waiting: { Icon: Clock, tone: "text-slate-700", bg: "bg-muted/70" },
  declined: { Icon: XCircle, tone: "text-destructive", bg: "bg-destructive/10" },
}

/** Big icon tile: icon, number, one-word label. */
export function ReplyTile({ kind, n }: { kind: "accepted" | "waiting" | "declined"; n: number }) {
  const { Icon, tone, bg } = TILE[kind]
  const muted = kind === "declined" && n === 0
  return (
    <div className={cn("flex min-w-0 flex-col items-center gap-1 rounded-xl px-3 py-3", muted ? "bg-muted/60" : bg)}>
      <Icon className={cn("size-7", muted ? "text-muted-foreground" : tone)} aria-hidden />
      <span className={cn("text-3xl leading-none font-semibold tabular-nums", muted ? "text-muted-foreground" : tone)}>
        {n}
      </span>
      <span className="text-sm text-muted-foreground">{kind}</span>
    </div>
  )
}
