import type { CreditTxn } from "@/lib/api/types";
import { CreditEquation } from "@/components/muster/credit-equation";
import { Card } from "@/components/ui/card";
import { cc } from "@/lib/ui/copy-c";

export interface ShopRef {
  name: string;
  city?: string | null;
  part?: string | null;
}

/**
 * The job §5.3 explains ("$2.81M work × 90% × 2 = $5.06M"): NG-004, the controlled job that
 * Program pins and its "Why?" popover walks through, so the same example appears on both pages.
 */
export const EXAMPLE_JOB = "NG-004";

/** NG-004 when it earned small-business credit, else the largest small-business transaction. */
export function pickExample(transactions: CreditTxn[]): CreditTxn | null {
  const sme = transactions.filter((t) => t.category === "sme_direct" && t.origin === "assignment");
  if (sme.length === 0) return null;
  return (
    sme.find((t) => t.ref_id === EXAMPLE_JOB) ??
    sme.reduce((best, t) => (t.credit_cad > best.credit_cad ? t : best), sme[0])
  );
}

/** "How one job earns credit" (docs/ux-simplification.md §5.3): four tiles, always visible. */
export function WorkedExample({ txn, shop }: { txn: CreditTxn; shop?: ShopRef }) {
  return (
    <Card className="gap-4 px-6 py-6 [--card-spacing:--spacing(6)]" data-testid="worked-example">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold text-slate-900">{cc("score.example.title")}</h2>
        <p className="min-w-0 truncate text-xs text-slate-500" title={shop?.part ?? undefined}>
          {cc("score.example.job", {
            id: txn.ref_id,
            shop: shop ? `${shop.name}${shop.city ? ` (${shop.city})` : ""}` : txn.shop_id,
          })}
        </p>
      </div>

      <CreditEquation
        value={txn.value_cad}
        ccv={txn.ccv_pct}
        multiplier={txn.multiplier}
        credit={txn.credit_cad}
        className="max-w-3xl"
      />

      <p className="text-sm text-slate-600">{cc("score.example.caption")}</p>
    </Card>
  );
}
