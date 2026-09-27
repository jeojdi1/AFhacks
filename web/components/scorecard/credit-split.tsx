import Link from "next/link";

import type { LedgerResponse } from "@/lib/api/types";
import { Card } from "@/components/ui/card";
import { fmtMoney, fmtPct } from "@/lib/format";

import { SC } from "./tokens";

export function CreditSplit({ ledger }: { ledger: LedgerResponse }) {
  const direct = ledger.direct_credit_cad;
  const indirect = ledger.indirect_credit_cad;
  const total = direct + indirect || 1;
  const directShare = direct / total;
  const indirectShare = indirect / total;

  return (
    <Card className="gap-4 px-6 py-6 [--card-spacing:--spacing(6)]">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Direct vs indirect credit</h2>
        <p className="text-sm text-slate-500">Where the credit comes from.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: SC.ink }} aria-hidden />
            Direct
          </div>
          <div className="mt-0.5 text-3xl font-semibold tracking-tight text-slate-900" title={fmtMoney(direct)}>
            {fmtMoney(direct, { compact: true })}
          </div>
          <div className="text-sm text-slate-500">Work on the contract itself</div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: SC.funded }} aria-hidden />
            Indirect
          </div>
          <div className="mt-0.5 text-3xl font-semibold tracking-tight text-slate-900" title={fmtMoney(indirect)}>
            {fmtMoney(indirect, { compact: true })}
          </div>
          <div className="text-sm text-slate-500">
            {indirect > 0 ? (
              "Other eligible activity, e.g. training"
            ) : (
              <>
                None yet —{" "}
                <Link href="/gaps" className="font-medium text-[#B42318] hover:underline">
                  fund training →
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      <div>
        <div
          className="flex h-2 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: SC.inkSoft }}
          role="img"
          aria-label={`Direct ${fmtPct(directShare)}, indirect ${fmtPct(indirectShare)}`}
        >
          {directShare > 0 ? (
            <div className="h-full" style={{ width: `${directShare * 100}%`, backgroundColor: SC.ink }} />
          ) : null}
          {indirectShare > 0 ? (
            <div
              className="h-full"
              style={{
                width: `${indirectShare * 100}%`,
                minWidth: 6,
                backgroundColor: SC.funded,
                boxShadow: directShare > 0 ? "inset 2px 0 0 0 #fff" : undefined,
              }}
            />
          ) : null}
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-slate-500 tabular-nums">
          <span>Direct {fmtPct(directShare)}</span>
          <span>Indirect {fmtPct(indirectShare)}</span>
        </div>
      </div>
    </Card>
  );
}
