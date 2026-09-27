import type { ReactNode } from "react";

import type { CreditTxn } from "@/lib/api/types";
import { Card } from "@/components/ui/card";
import { fmtMoney, fmtPct } from "@/lib/format";

import { SC } from "./tokens";

export interface ShopRef {
  name: string;
  city?: string | null;
  part?: string | null;
}

/** Pick the SME direct transaction that best illustrates the 2x rule (the largest one). */
export function pickExample(transactions: CreditTxn[]): CreditTxn | null {
  const sme = transactions.filter((t) => t.category === "sme_direct" && t.origin === "assignment");
  if (sme.length === 0) return null;
  return sme.reduce((best, t) => (t.credit_cad > best.credit_cad ? t : best), sme[0]);
}

export function WorkedExample({ txn, shop, partNo }: { txn: CreditTxn; shop?: ShopRef; partNo?: string }) {
  return (
    <Card className="gap-4 px-6 py-6 [--card-spacing:--spacing(6)]">
      <div>
        <h3 className="text-base font-semibold text-slate-900">How one job earns credit</h3>
        <p className="text-sm text-slate-500">
          Part <span className="font-medium text-slate-700 tabular-nums">{partNo ?? txn.ref_id}</span>
          {shop ? (
            <>
              {" "}
              at <span className="font-medium text-slate-700">{shop.name}</span>
              {shop.city ? ` (${shop.city})` : ""}
            </>
          ) : null}
          {shop?.part ? <span className="block truncate">{shop.part}</span> : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-3 text-slate-400">
        <Term value={fmtMoney(txn.value_cad)} caption="job value" />
        <Op>×</Op>
        <Term value={fmtPct(txn.ccv_pct, 0)} caption="Canadian content" />
        <Op>×</Op>
        <Term value={`${txn.multiplier}x`} caption="SME direct" accent />
        <Op>=</Op>
        <Term value={fmtMoney(txn.credit_cad)} caption="ITB credit" strong />
      </div>

      <p className="text-sm text-slate-500">
        The same job at a large (non-SME) shop would earn{" "}
        <span className="font-medium text-slate-700 tabular-nums">
          {fmtMoney(txn.value_cad * txn.ccv_pct)}
        </span>{" "}
        — half the credit.
      </p>
    </Card>
  );
}

function Term({
  value,
  caption,
  accent,
  strong,
}: {
  value: string;
  caption: string;
  accent?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span
        className={
          "text-lg font-semibold tabular-nums leading-tight " +
          (strong ? "text-slate-900" : "text-slate-800")
        }
        style={accent ? { color: SC.accent } : undefined}
      >
        {value}
      </span>
      <span className="text-xs text-slate-500">{caption}</span>
    </div>
  );
}

function Op({ children }: { children: ReactNode }) {
  return (
    <span className="self-start text-lg font-medium leading-tight" aria-hidden>
      {children}
    </span>
  );
}
