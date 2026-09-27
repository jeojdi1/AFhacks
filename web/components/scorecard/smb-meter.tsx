import type { LedgerResponse } from "@/lib/api/types";
import { AssumptionTag } from "@/components/muster/assumption-tag";
import { Card } from "@/components/ui/card";
import { fmtMoney, fmtPct } from "@/lib/format";

import type { FundingSummary } from "./funding";
import { MeterBar, type MeterSegment } from "./meter-bar";
import { SC } from "./tokens";

export function SmbMeter({
  ledger,
  funding,
}: {
  ledger: LedgerResponse;
  funding: FundingSummary | null;
}) {
  const { smb } = ledger;
  const current = smb.progress_pct;
  const base = funding?.baseline?.smb_progress_pct;
  const hasJump = base !== undefined && current - base > 0.00005;

  const segments: MeterSegment[] = hasJump
    ? [
        { value: base, color: SC.ink, label: `Before funding: ${fmtPct(base)}` },
        { value: current - base, color: SC.funded, label: `Unblocked SME jobs: +${fmtPct(current - base)}` },
      ]
    : [{ value: current, color: SC.ink, label: `SMB work so far: ${fmtPct(current)}` }];

  return (
    <Card className="gap-5 px-6 py-6 [--card-spacing:--spacing(6)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-slate-600">Small &amp; medium business target</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              className="text-4xl font-semibold tracking-tight text-slate-900"
              title={fmtMoney(smb.achieved_cad)}
            >
              {fmtMoney(smb.achieved_cad, { compact: true })}
            </span>
            <span className="text-base text-slate-500">
              of {fmtMoney(smb.target_cad, { compact: true })} target
            </span>
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Target = {fmtPct(smb.target_pct, 0)} of the contract value
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tracking-tight text-slate-900">{fmtPct(current)}</div>
          <div className="text-sm text-slate-500">of SMB target</div>
        </div>
      </div>

      <MeterBar
        ariaLabel="Progress toward the SMB target"
        segments={segments}
        valueLabel={fmtPct(current)}
        ticks={[0, 0.5, 1]}
        tickFormat={(t) => (t === 1 ? `${fmtMoney(smb.target_cad, { compact: true })} target` : fmtMoney(smb.target_cad * t, { compact: true }))}
        height="h-4"
      />

      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <span>Basis: {smb.basis.replace(/\s*\(assumption\)\s*$/i, "")}.</span>
        <AssumptionTag />
      </p>
    </Card>
  );
}

