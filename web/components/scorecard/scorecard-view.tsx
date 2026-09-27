"use client";

import { useMemo } from "react";

import { EmptyState, SectionHeader } from "@/components/muster";
import { Skeleton } from "@/components/ui/skeleton";
import { useDemo } from "@/lib/data/store";

import { CreditSplit } from "./credit-split";
import { summarizeFunding } from "./funding";
import { MultiplierChart } from "./multiplier-chart";
import { ObligationMeter } from "./obligation-meter";
import { SmbMeter } from "./smb-meter";
import { TransactionsTable } from "./transactions-table";
import { pickExample, WorkedExample, type ShopRef } from "./worked-example";

const EXPLANATION = (
  <>
    Industrial and Technological Benefits (ITB): every major defence contract obliges the prime to do business in
    Canada equal to 100% of its value. Muster counts the credit each routed job earns: value × Canadian content ×
    multiplier.
  </>
);

export function ScorecardView() {
  const demo = useDemo();
  const { ledger, assignments, fundResults, lastFund, gaps, jobs } = demo;

  const funding = useMemo(() => summarizeFunding(fundResults, lastFund), [fundResults, lastFund]);

  // shop_id → name/city, and job id → description, for labelling ledger rows.
  // job id → part number, so ledger rows match the part numbers on Program, Gaps and Shop.
  const { shops, jobParts, partNos } = useMemo(() => {
    const shops: Record<string, ShopRef> = {};
    const jobParts: Record<string, string> = {};
    const partNos: Record<string, string> = {};
    for (const j of jobs ?? []) if (j.part_no) partNos[j.id] ??= j.part_no;
    const addAssignment = (a: {
      job_id: string;
      part_no?: string;
      shop_id: string;
      shop_name: string;
      shop_city: string;
      description: string;
    }) => {
      shops[a.shop_id] ??= { name: a.shop_name, city: a.shop_city };
      jobParts[a.job_id] ??= a.description;
      if (a.part_no) partNos[a.job_id] ??= a.part_no;
    };
    for (const a of assignments ?? []) addAssignment(a);
    for (const f of Object.values(fundResults ?? {})) {
      for (const a of f.unblocked_jobs ?? []) addAssignment(a);
      if (f.package) shops[f.package.shop_id] ??= { name: f.package.shop_name, city: f.package.shop_city };
    }
    if (lastFund?.package) {
      shops[lastFund.package.shop_id] ??= { name: lastFund.package.shop_name, city: lastFund.package.shop_city };
    }
    for (const p of gaps?.suggestions ?? []) shops[p.shop_id] ??= { name: p.shop_name, city: p.shop_city };
    for (const b of gaps?.blocked ?? []) if (b.part_no) partNos[b.job_id] ??= b.part_no;
    return { shops, jobParts, partNos };
  }, [assignments, fundResults, lastFund, gaps, jobs]);

  const example = useMemo(() => (ledger ? pickExample(ledger.transactions) : null), [ledger]);

  const fundedCategories = useMemo(() => {
    const s = new Set<string>();
    for (const f of funding?.funded ?? []) if (f.training_txn?.category) s.add(f.training_txn.category);
    return s;
  }, [funding]);

  const header = (
    <SectionHeader
      size="page"
      title="ITB Scorecard"
      subtitle={EXPLANATION}
      right={
        <>
          <span className="inline-flex h-7 items-center rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700">
            {ledger?.rules_label ?? "Simplified ITB rules for demo"}
          </span>
          {ledger?.rules_version ? (
            <span className="inline-flex h-7 items-center rounded-full bg-slate-100 px-3 font-mono text-xs text-slate-600">
              rules {ledger.rules_version}
            </span>
          ) : null}
        </>
      }
    />
  );

  if (!ledger && !demo.ready) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-6 py-8">
        {header}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12" aria-busy>
          <Skeleton className="h-64 rounded-xl lg:col-span-7" />
          <Skeleton className="h-64 rounded-xl lg:col-span-5" />
          <Skeleton className="h-80 rounded-xl lg:col-span-12" />
        </div>
      </div>
    );
  }

  if (!ledger) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-6 py-8">
        {header}
        <EmptyState
          title="No credit to count yet"
          body="Upload Northgate's parts list and route it to shops first. The scorecard fills in as soon as jobs are assigned."
          action={{ label: "Upload a parts list first", href: "/program" }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-6 py-8">
      {header}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ObligationMeter ledger={ledger} funding={funding} />
        </div>
        <div className="lg:col-span-5">
          <SmbMeter ledger={ledger} funding={funding} />
        </div>

        <div className="lg:col-span-12">
          <MultiplierChart ledger={ledger} fundedCategories={fundedCategories} />
        </div>

        <div className="lg:col-span-7">
          {example ? (
            <WorkedExample
              txn={example}
              partNo={partNos[example.ref_id]}
              shop={
                shops[example.shop_id]
                  ? { ...shops[example.shop_id], part: jobParts[example.ref_id] ?? null }
                  : undefined
              }
            />
          ) : null}
        </div>
        <div className={example ? "lg:col-span-5" : "lg:col-span-12"}>
          <CreditSplit ledger={ledger} />
        </div>

        <div className="lg:col-span-12">
          <TransactionsTable
            transactions={ledger.transactions}
            shops={shops}
            partNos={partNos}
            highlightRefs={funding?.packageIds ?? new Set<string>()}
            totalCredit={ledger.credit_total_cad}
          />
        </div>
      </div>
    </div>
  );
}
