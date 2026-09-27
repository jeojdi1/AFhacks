import type { LedgerResponse } from "@/lib/api/types";
import { AssumptionTag } from "@/components/muster/assumption-tag";
import { Term } from "@/components/muster/term";
import { Card } from "@/components/ui/card";
import { fmtMoney, fmtPct } from "@/lib/format";
import { Rich } from "@/lib/ui/copy";
import { cc } from "@/lib/ui/copy-c";

import type { FundingSummary } from "./funding";
import { MeterBar, MeterLegend, type MeterSegment } from "./meter-bar";
import { SC } from "./tokens";

/** Compact money without a trailing ".0" ("$75M", not "$75.0M"), as §5.3 writes the target. */
const m = (n: number) => fmtMoney(n, { compact: true }).replace(/\.0([MKB])$/, "$1");

/** "Small-business target" (docs/ux-simplification.md §5.3). The legend row keeps its height before funding. */
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
  // Labels are whole percents, so the added part is after − before as shown (36% + 7% = 43%),
  // not the rounded raw difference (QA Q34: 36% + 6% = 43%).
  const addedPct = hasJump ? `${Math.round(current * 100) - Math.round(base * 100)}%` : "";

  const segments: MeterSegment[] = hasJump
    ? [
        { value: base, color: SC.ink, label: cc("score.smb.before", { pct: fmtPct(base, 0) }) },
        { value: current - base, color: SC.funded, label: cc("score.smb.added", { pct: addedPct }) },
      ]
    : [{ value: current, color: SC.ink, label: fmtPct(current, 0) }];

  return (
    <Card className="gap-4 px-6 py-6 [--card-spacing:--spacing(6)]" data-testid="smb-meter">
      <div>
        <div className="text-sm font-medium text-slate-600">
          <Term k="SMB_TARGET" first />
        </div>
        <div
          className="mt-1 text-xl text-slate-500 tabular-nums [&_strong]:text-4xl [&_strong]:font-semibold [&_strong]:tracking-tight [&_strong]:text-slate-900"
          title={`${fmtMoney(smb.achieved_cad)} of ${fmtMoney(smb.target_cad)}`}
        >
          <Rich
            text={cc("score.smb.value", {
              achieved: m(smb.achieved_cad),
              target: m(smb.target_cad),
              pct: fmtPct(current, 0),
            })}
          />
        </div>
        <p className="mt-1 text-sm text-slate-600">{cc("score.smb.caption")}</p>
      </div>

      <div className="space-y-2">
        <MeterBar
          ariaLabel={cc("score.smb.aria", { achieved: m(smb.achieved_cad), target: m(smb.target_cad) })}
          segments={segments}
          ticks={[0, 0.5, 1]}
          tickFormat={(t) => m(smb.target_cad * t)}
          height="h-4"
        />
        <div className="min-h-[2lh] text-xs sm:min-h-[1lh]">
          {hasJump ? (
            <MeterLegend
              items={[
                { color: SC.ink, label: cc("score.smb.before", { pct: fmtPct(base, 0) }) },
                { color: SC.funded, label: cc("score.smb.added", { pct: addedPct }) },
              ]}
            />
          ) : null}
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span>{cc("score.smb.basis").replace(/\s*\(assumption\)\s*$/i, "")}</span>
        <AssumptionTag />
      </p>
    </Card>
  );
}
