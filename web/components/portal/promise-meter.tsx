"use client"

import type { LedgerResponse } from "@/lib/api/types"
import { fmtMoney, fmtPct } from "@/lib/format"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { CREDIT_EXPLAINER, Plain, TIP } from "./plain"

/**
 * "Credit so far $57.5M of $500M · 11.5% of what Northgate owes".
 * Before matching: "Northgate owes Canada $500M of business".
 */
export function PromiseMeter({ ledger, obligation }: { ledger: LedgerResponse | null; obligation: number }) {
  const total = ledger?.obligation_cad ?? obligation
  const credit = ledger?.credit_total_cad ?? 0
  const pct = ledger?.obligation_met_pct ?? 0
  const width = Math.max(0, Math.min(1, pct))

  return (
    <div className="flex flex-col gap-3" data-testid="promise-meter">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {ledger ? (
          <>
            <span className="text-sm font-medium text-muted-foreground">Credit so far</span>
            <span className="text-[2rem] leading-none font-semibold tracking-tight tabular-nums" title={fmtMoney(credit)}>
              {fmtMoney(credit, { compact: true })}
            </span>
            <span className="text-lg text-slate-700">
              of {fmtMoney(total, { compact: true })} · <strong className="font-semibold">{fmtPct(pct)}</strong> of what
              Northgate owes
            </span>
          </>
        ) : (
          <span className="text-lg text-slate-700">
            Northgate owes Canada <strong className="font-semibold">{fmtMoney(total, { compact: true })}</strong> of
            business. No credit yet.
          </span>
        )}
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width * 1000) / 10}
        aria-label="Share of what Northgate owes, covered by credit so far"
      >
        <div
          className="h-full rounded-full bg-assigned transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${width * 100}%` }}
        />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {CREDIT_EXPLAINER} The promise comes from{" "}
        <Plain label="Canada's defence-contract rule" abbr="ITB" tip={TIP.ITB} />; this credit is from one parts list.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex h-5 items-center rounded-full border border-slate-300 px-2 font-medium text-slate-600">
          Simplified ITB rules for demo
        </span>
        {ledger?.smb ? (
          <span className="inline-flex items-center gap-1.5">
            Small-business target: {fmtMoney(ledger.smb.achieved_cad, { compact: true })} of{" "}
            {fmtMoney(ledger.smb.target_cad, { compact: true })} ({fmtPct(ledger.smb.progress_pct, 0)})
            <AssumptionTag note={`Basis: ${ledger.smb.basis}`} />
          </span>
        ) : null}
      </div>
    </div>
  )
}
