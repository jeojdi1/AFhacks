"use client"

// GlanceCard (T6 §2.6, section 1): the prime's ITB position from the ledger,
// sized to sit above the fold at 390 px. Labelled "Simplified ITB rules for demo".

import Link from "next/link"
import { ChevronRight, Scale, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtMoney } from "@/lib/format"
import type { LedgerResponse } from "@/lib/api/types"
import { t } from "@/lib/app/strings"
import { TAG_HIT, fmtCredit } from "@/lib/app/feed"
import { AssumptionTag } from "@/components/muster/assumption-tag"

function Bar({ value, className, label }: { value: number; className?: string; label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-secondary"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className={cn("h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500", className)} style={{ width: `${pct}%` }} />
    </div>
  )
}

const pct1 = (f: number) => `${(f * 100).toFixed(1)}%`
const pct0 = (f: number) => `${Math.round(f * 100)}%`
/** Compact money without a trailing ".0" ("$75M", not "$75.0M"), the same helper /scorecard uses. */
const m = (n: number) => fmtMoney(n, { compact: true }).replace(/\.0([MKB])$/, "$1")

export interface GlanceReplies {
  waiting: number
  accepted: number
  declined: number
}

export function GlanceCard({
  ledger,
  fundedCount,
  replies,
  risk,
}: {
  ledger: LedgerResponse | null
  fundedCount: number
  replies: GlanceReplies | null
  /** Supplier renewals at risk: count and credit (links to #supplier-status). */
  risk: { count: number; credit: number } | null
}) {
  const routed = !!ledger && ledger.credit_total_cad > 0
  const training = ledger
    ? ledger.multiplier_breakdown.filter((r) => r.category === "training" || r.category === "indigenous_training").reduce((s, r) => s + r.credit_cad, 0)
    : 0

  return (
    <section aria-labelledby="glance-title" className="rounded-2xl border border-border bg-card p-4 shadow-xs" data-testid="glance-card">
      <div className="flex items-start gap-2">
        <Scale className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <h2 id="glance-title" className="text-base leading-snug font-semibold">
            {t("prime.glance.title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("label.simplifiedItb")}</p>
        </div>
      </div>

      {!routed || !ledger ? (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-muted p-3">
          <p className="text-base font-medium">{t("prime.glance.empty")}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("prime.glance.emptyBody")}</p>
        </div>
      ) : (
        <>
          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-muted-foreground">{t("prime.glance.met")}</span>
              <span className="text-sm text-muted-foreground">
                {fmtMoney(ledger.credit_total_cad, { compact: true })} {t("prime.glance.metOf", { obligation: fmtMoney(ledger.obligation_cad, { compact: true }) })}
              </span>
            </div>
            <p className="flex items-baseline gap-2">
              <span className="text-3xl leading-tight font-bold tracking-tight tabular-nums" data-testid="glance-met">
                {pct1(ledger.obligation_met_pct)}
              </span>
              <span className="text-sm text-muted-foreground">{t("prime.glance.metPct")}</span>
            </p>
            {/* Progress, not an alarm: green meter (the brand red reads as "something is wrong"). */}
            <Bar value={ledger.obligation_met_pct} className="bg-assigned" label={t("prime.glance.met")} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
                <span className="whitespace-nowrap">{t("prime.glance.smb")}</span>
                <AssumptionTag note={t("prime.glance.smbNote")} className={TAG_HIT} />
              </span>
              <p className="text-xl font-semibold tabular-nums">{pct0(ledger.smb.progress_pct)}</p>
              <Bar value={ledger.smb.progress_pct} className="bg-slate-500" label={t("prime.glance.smb")} />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("prime.glance.smbOf", {
                  achieved: m(ledger.smb.achieved_cad),
                  target: m(ledger.smb.target_cad),
                  pct: pct0(ledger.smb.progress_pct),
                })}
              </p>
            </div>
            <div className="min-w-0">
              <span className="text-sm text-muted-foreground">{t("prime.glance.training")}</span>
              <p className="text-xl font-semibold tabular-nums">{fmtMoney(training, { compact: true })}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {fundedCount > 0 ? t("prime.glance.trainingSome", { count: fundedCount }) : t("prime.glance.trainingNone")}
              </p>
            </div>
          </div>

          {replies ? (
            <p className="mt-3 border-t border-border pt-2 text-sm text-muted-foreground" data-testid="glance-replies">
              {t("prime.glance.replies", { ...replies })}
            </p>
          ) : null}

          {risk && risk.count > 0 ? (
            <Link
              href="#supplier-status"
              className="mt-2 flex min-h-12 items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 text-sm font-medium text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">
                {t("prime.glance.risk", {
                  count: risk.count,
                  credit: fmtCredit(risk.credit),
                })}
              </span>
              <ChevronRight className="size-4 shrink-0" aria-hidden />
            </Link>
          ) : null}
        </>
      )}
    </section>
  )
}
