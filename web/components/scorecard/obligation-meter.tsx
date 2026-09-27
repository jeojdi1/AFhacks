import { AssumptionTag } from "@/components/muster/assumption-tag";
import { ArrowUpRight } from "lucide-react";

import type { LedgerResponse } from "@/lib/api/types";
import { Card } from "@/components/ui/card";
import { fmtMoney, fmtPct } from "@/lib/format";

import type { FundingSummary } from "./funding";
import { MeterBar, MeterLegend, type MeterSegment } from "./meter-bar";
import { SC } from "./tokens";

export function ObligationMeter({
  ledger,
  funding,
}: {
  ledger: LedgerResponse;
  funding: FundingSummary | null;
}) {
  const current = ledger.obligation_met_pct;
  const base = funding?.baseline?.obligation_met_pct;
  const hasJump = base !== undefined && current - base > 0.00005;

  const segments: MeterSegment[] = hasJump
    ? [
        { value: base, color: SC.ink, label: `Before funding: ${fmtPct(base)}` },
        {
          value: current - base,
          color: SC.funded,
          label: `Added by funded training: +${fmtPct(current - base)}`,
        },
      ]
    : [{ value: current, color: SC.ink, label: `Credit so far: ${fmtPct(current)}` }];

  return (
    <Card className="gap-5 px-6 py-6 [--card-spacing:--spacing(6)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-slate-600">
            ITB credit earned toward the obligation
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className="text-5xl font-semibold tracking-tight text-slate-900"
              title={fmtMoney(ledger.credit_total_cad)}
            >
              {fmtMoney(ledger.credit_total_cad, { compact: true })}
            </span>
            <span className="text-lg text-slate-500">
              of {fmtMoney(ledger.obligation_cad, { compact: true })} obligation
            </span>
          </div>
          {funding ? <FundingChips funding={funding} /> : null}
        </div>
        <div className="text-right">
          <div className="text-4xl font-semibold tracking-tight text-slate-900">
            {fmtPct(current)}
          </div>
          <div className="text-sm text-slate-500">of obligation met</div>
        </div>
      </div>

      <div className="space-y-2">
        <MeterBar
          ariaLabel="Share of the ITB obligation met"
          segments={segments}
          valueLabel={fmtPct(current)}
          height="h-5"
        />
        {hasJump ? (
          <MeterLegend
            items={[
              { color: SC.ink, label: `Before funding (${fmtPct(base)})` },
              { color: SC.funded, label: `Added after funding training (+${fmtPct(current - base)})` },
            ]}
          />
        ) : null}
      </div>

      <p className="text-sm text-slate-500">
        Credit counts toward the 100% obligation; excess can be banked (up to 10 years).
      </p>
    </Card>
  );
}

function FundingChips({ funding }: { funding: FundingSummary }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {funding.training.map((t) => (
        <span
          key={t.packageId}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-600/20"
          title={`${t.packageId}: ${fmtMoney(t.costCad)} training × ${t.multiplier} = ${fmtMoney(t.creditCad)} credit`}
        >
          <ArrowUpRight className="size-4" aria-hidden />+{fmtMoney(t.creditCad, { compact: true })} from
          training ({t.multiplier}x)
        </span>
      ))}
      {funding.jobsCreditCad > 0 ? (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-600/20"
          title={`${fmtMoney(funding.jobsCreditCad)} credit from jobs that were blocked and are now assigned`}
        >
          <ArrowUpRight className="size-4" aria-hidden />+{fmtMoney(funding.jobsCreditCad, { compact: true })}{" "}
          from {funding.unblockedJobs} unblocked {funding.unblockedJobs === 1 ? "job" : "jobs"}
        </span>
      ) : null}
      <p className="flex w-full flex-wrap items-center gap-1.5 text-[13px] text-slate-600" data-testid="training-caveat">
        <AssumptionTag note="Training cost is an estimate for the demo, not a quote" />
        Training cost is an assumption
        {funding.training.some((t) => t.multiplier === 10)
          ? " · 10x Indigenous workforce credit needs Defence Investment Agency confirmation"
          : ""}
      </p>
    </div>
  );
}
