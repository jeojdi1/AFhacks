"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import type { CreditTxn } from "@/lib/api/types";
import { AssumptionTag } from "@/components/muster/assumption-tag";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL, fmtMoney, fmtPct, label } from "@/lib/format";

import type { ShopRef } from "./worked-example";

const PREVIEW_ROWS = 6;

export function TransactionsTable({
  transactions,
  shops,
  partNos = {},
  highlightRefs,
  totalCredit,
}: {
  transactions: CreditTxn[];
  shops: Record<string, ShopRef>;
  /** job id → part number; assignment rows show the part number, training rows keep the package id. */
  partNos?: Record<string, string>;
  /** ref_ids (training package ids) to highlight as newly added. */
  highlightRefs: Set<string>;
  totalCredit: number;
}) {
  const [open, setOpen] = useState(false);

  // New training credit first, then the largest credits.
  const sorted = useMemo(() => {
    return [...transactions].sort((a, b) => {
      const ha = highlightRefs.has(a.ref_id) ? 1 : 0;
      const hb = highlightRefs.has(b.ref_id) ? 1 : 0;
      if (ha !== hb) return hb - ha;
      return b.credit_cad - a.credit_cad;
    });
  }, [transactions, highlightRefs]);

  const visible = open ? sorted : sorted.slice(0, PREVIEW_ROWS);
  const hidden = sorted.length - visible.length;

  return (
    <Card className="gap-4 px-0 py-6 [--card-spacing:--spacing(6)]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Credit transactions</h3>
          <p className="text-sm text-slate-500">
            {transactions.length} entries in the ledger. Every row: value × CCV × multiplier = credit.
          </p>
        </div>
        {sorted.length > PREVIEW_ROWS ? (
          <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? (
              <>
                Show fewer <ChevronUp />
              </>
            ) : (
              <>
                Show all {sorted.length} <ChevronDown />
              </>
            )}
          </Button>
        ) : null}
      </div>

      <Table className="text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-6 text-slate-600">Part / package</TableHead>
            <TableHead className="text-slate-600">Shop</TableHead>
            <TableHead className="text-slate-600">Type</TableHead>
            <TableHead className="text-slate-600">Category</TableHead>
            <TableHead className="text-right text-slate-600">Value</TableHead>
            <TableHead className="text-right text-slate-600">CCV</TableHead>
            <TableHead className="text-right text-slate-600">Multiplier</TableHead>
            <TableHead className="text-right text-slate-600">Credit</TableHead>
            <TableHead className="pr-6 text-slate-600">Flags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((t) => {
            const isNew = highlightRefs.has(t.ref_id);
            const shop = shops[t.shop_id];
            return (
              <TableRow
                key={t.id}
                className={cn(isNew && "bg-emerald-50 hover:bg-emerald-50/80")}
              >
                <TableCell className="pl-6 font-medium text-slate-900 tabular-nums">
                  <span className="inline-flex items-center gap-2">
                    <span title={t.ref_id}>{t.origin === "assignment" ? (partNos[t.ref_id] ?? t.ref_id) : t.ref_id}</span>
                    {isNew ? (
                      <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        New
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="max-w-[220px] truncate text-slate-700" title={shop?.name ?? t.shop_id}>
                  {shop?.name ?? t.shop_id}
                </TableCell>
                <TableCell className="text-slate-700 capitalize">{t.type}</TableCell>
                <TableCell className="text-slate-700">{label(CATEGORY_LABEL, t.category).replace(/\s*\(\d+x\)$/, "")}</TableCell>
                <TableCell className="text-right text-slate-700 tabular-nums">{fmtMoney(t.value_cad)}</TableCell>
                <TableCell className="text-right text-slate-700 tabular-nums">{fmtPct(t.ccv_pct, 0)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <span
                    className={cn(
                      "font-semibold",
                      t.multiplier >= 5 ? "text-emerald-700" : t.multiplier === 2 ? "text-[#B42318]" : "text-slate-600",
                    )}
                  >
                    {t.multiplier}x
                  </span>
                </TableCell>
                <TableCell className="text-right font-semibold text-slate-900 tabular-nums">
                  {fmtMoney(t.credit_cad)}
                </TableCell>
                <TableCell className="pr-6">
                  <span className="inline-flex flex-wrap gap-1">
                    {t.flags.map((f) =>
                      f === "assumption" ? (
                        <AssumptionTag key={f} />
                      ) : (
                        <span
                          key={f}
                          className="rounded-full border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-500"
                        >
                          {f === "simplified-demo" ? "Simplified demo" : f}
                        </span>
                      ),
                    )}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={7} className="pl-6 text-slate-600">
              {hidden > 0 ? `Total of all ${sorted.length} transactions (${hidden} hidden)` : "Total credit"}
            </TableCell>
            <TableCell className="text-right font-semibold text-slate-900 tabular-nums">
              {fmtMoney(totalCredit)}
            </TableCell>
            <TableCell className="pr-6" />
          </TableRow>
        </TableFooter>
      </Table>
    </Card>
  );
}
