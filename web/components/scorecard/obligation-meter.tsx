"use client";

import { ArrowUpRight } from "lucide-react";

import type { LedgerResponse } from "@/lib/api/types";
import { AssumptionTag } from "@/components/muster/assumption-tag";
import { BeforeAfterBar } from "@/components/muster/before-after-bar";
import { Card } from "@/components/ui/card";
import { fmtMoney, fmtPct } from "@/lib/format";
import { Rich } from "@/lib/ui/copy";
import { cc } from "@/lib/ui/copy-c";

import type { FundingSummary } from "./funding";

const m = (n: number) => fmtMoney(n, { compact: true });

/**
 * "What Northgate owes Canada" (docs/ux-simplification.md §5.3).
 *
 * No layout jump after funding: the percentage sits in the same place before and after, and
 * the rows that only fill in after funding (scale labels, green chips, the training caveat)
 * keep a fixed minimum height at all times, so nothing below them reflows either.
 */
export function ObligationMeter({
  ledger,
  funding,
}: {
  ledger: LedgerResponse;
  funding: FundingSummary | null;
}) {
  const current = ledger.obligation_met_pct;
  const obligation = m(ledger.obligation_cad);
  const baseline = funding?.baseline ?? null;
  const hasJump = !!baseline && current - baseline.obligation_met_pct > 0.00005;
  const before = hasJump && baseline ? baseline.obligation_met_pct : current;

  return (
    <Card className="gap-4 px-6 py-6 [--card-spacing:--spacing(6)]" data-testid="obligation-meter">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-600">{cc("score.meter.label")}</div>
          <div
            className="mt-1 text-3xl tracking-tight text-slate-500 tabular-nums sm:text-4xl [&_strong]:text-5xl [&_strong]:font-semibold [&_strong]:text-slate-900 sm:[&_strong]:text-6xl"
            title={fmtMoney(ledger.credit_total_cad)}
          >
            <Rich text={cc("score.meter.value", { credit: m(ledger.credit_total_cad), obligation })} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className="text-4xl font-semibold tracking-tight text-slate-900 tabular-nums sm:text-5xl"
            data-testid="obligation-pct"
          >
            {fmtPct(current)}
          </div>
          <div className="ml-auto max-w-[6.5rem] text-sm leading-snug text-slate-500 sm:max-w-none">{cc("score.meter.pct.sub")}</div>
        </div>
      </div>

      <div>
        <BeforeAfterBar
          before={before}
          after={current}
          height={24}
          ariaLabel={cc("score.meter.aria", { pct: fmtPct(current), obligation })}
        />
        {/* One fixed-height label row: the 0–100% scale before funding, before/after once funded. */}
        <div className="mt-1.5 grid min-h-[2lh] grid-cols-[1fr_auto_1fr] items-start gap-2 text-xs text-slate-600 tabular-nums sm:min-h-[1lh] sm:text-sm">
          {hasJump && baseline ? (
            <>
              <span className="min-w-0 text-left">
                {cc("score.meter.before", { credit: m(baseline.credit_total_cad), pct: fmtPct(before) })}
              </span>
              <span className="text-center font-semibold text-assigned">
                {cc("score.meter.delta", { delta: m(ledger.credit_total_cad - baseline.credit_total_cad) })}
              </span>
              <span className="min-w-0 text-right font-medium text-slate-900">
                {cc("score.meter.after", { credit: m(ledger.credit_total_cad), pct: fmtPct(current) })}
              </span>
            </>
          ) : (
            <>
              <span className="text-left">{cc("score.meter.scale.start")}</span>
              <span />
              <span className="text-right">{cc("score.meter.scale.end", { obligation })}</span>
            </>
          )}
        </div>
      </div>

      {/* Reserved at all times (min-h): the chip row and the caveat under it never reflow the page. */}
      <div className="flex min-h-[7.5rem] flex-col gap-2 sm:min-h-[3.75rem]" data-testid="funding-chips">
        {funding ? <FundingChips funding={funding} /> : <PendingChip />}
      </div>

      <p className="text-sm text-slate-600">{cc("score.meter.caption")}</p>
    </Card>
  );
}

const CHIP =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold";

function PendingChip() {
  return (
    <div className="flex flex-wrap gap-2">
      <span className={`${CHIP} border border-dashed border-slate-300 font-medium text-slate-500`}>
        {cc("score.meter.pending")}
      </span>
    </div>
  );
}

function FundingChips({ funding }: { funding: FundingSummary }) {
  const jobsValue = funding.funded.reduce(
    (a, f) => a + (f.unblocked_jobs ?? []).reduce((s, j) => s + (j.value_cad ?? 0), 0),
    0,
  );
  const green = `${CHIP} bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20`;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {funding.training.map((t) => (
          <span
            key={t.packageId}
            className={green}
            title={cc("score.chip.training.title", {
              id: t.packageId,
              cost: fmtMoney(t.costCad),
              mult: `${t.multiplier}×`,
              credit: fmtMoney(t.creditCad),
            })}
          >
            <ArrowUpRight className="size-4" aria-hidden />
            {cc("score.chip.training", { training: m(t.creditCad) }).replace("5×", `${t.multiplier}×`)}
          </span>
        ))}
        {funding.jobsCreditCad > 0 ? (
          <span
            className={green}
            title={cc("score.chip.jobs.title", { credit: fmtMoney(funding.jobsCreditCad), value: fmtMoney(jobsValue) })}
          >
            <ArrowUpRight className="size-4" aria-hidden />
            {cc("score.chip.jobs", {
              jobsCredit: m(funding.jobsCreditCad),
              n: funding.unblockedJobs,
              jobsValue: m(jobsValue),
            })}
          </span>
        ) : null}
      </div>
      <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-slate-600" data-testid="training-caveat">
        <AssumptionTag note={cc("score.meter.caveat.note")} />
        {cc("score.meter.caveat")}
        {funding.training.some((t) => t.multiplier === 10) ? cc("score.meter.caveat.indigenous") : ""}
      </p>
    </>
  );
}
