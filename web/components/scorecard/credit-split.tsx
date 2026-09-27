"use client";

import Link from "next/link";

import type { LedgerResponse } from "@/lib/api/types";
import { Term } from "@/components/muster/term";
import { Card } from "@/components/ui/card";
import { fmtMoney, fmtPct } from "@/lib/format";
import { cc } from "@/lib/ui/copy-c";
import { useWithParams } from "@/lib/ui/use-with-params";

import { SC } from "./tokens";

/** Details: "Work on this contract vs other activity" (direct vs indirect credit). */
export function CreditSplit({ ledger }: { ledger: LedgerResponse }) {
  const wp = useWithParams();
  const direct = ledger.direct_credit_cad;
  const indirect = ledger.indirect_credit_cad;
  const total = direct + indirect || 1;
  const directShare = direct / total;
  const indirectShare = indirect / total;
  const directLabel = cc("score.kind.direct");
  const indirectLabel = cc("score.kind.indirect");

  return (
    <Card className="gap-4 px-6 py-6 [--card-spacing:--spacing(6)]" data-testid="credit-split">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: SC.ink }} aria-hidden />
            <Term k="DIRECT">{directLabel}</Term>
          </div>
          <div className="mt-0.5 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums" title={fmtMoney(direct)}>
            {fmtMoney(direct, { compact: true })}
          </div>
          <div className="text-sm text-slate-600">{cc("score.split.direct.sub")}</div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: SC.funded }} aria-hidden />
            <Term k="INDIRECT">{indirectLabel}</Term>
          </div>
          <div className="mt-0.5 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums" title={fmtMoney(indirect)}>
            {fmtMoney(indirect, { compact: true })}
          </div>
          <div className="text-sm text-slate-600">
            {indirect > 0 ? (
              cc("score.split.indirect.sub")
            ) : (
              <>
                {cc("score.split.indirect.none")}{" "}
                <Link href={wp("/gaps")} className="font-medium text-slate-900 underline underline-offset-4 hover:text-slate-700">
                  {cc("score.split.indirect.link")}
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
          aria-label={`${directLabel} ${fmtPct(directShare)}, ${indirectLabel} ${fmtPct(indirectShare)}`}
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
        <div className="mt-1.5 flex justify-between gap-3 text-xs text-slate-600 tabular-nums">
          <span>
            {directLabel} {fmtPct(directShare)}
          </span>
          <span className="text-right">
            {indirectLabel} {fmtPct(indirectShare)}
          </span>
        </div>
      </div>

      <p className="text-sm text-slate-600">{cc("score.details.split.note")}</p>
    </Card>
  );
}
