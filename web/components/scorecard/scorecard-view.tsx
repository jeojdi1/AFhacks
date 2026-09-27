"use client";

import { useMemo } from "react";
import { Info } from "lucide-react";

import { AutoNextStep } from "@/components/muster/next-step";
import { Details } from "@/components/muster/details";
import { EmptyState } from "@/components/muster/empty-state";
import { SectionHeader } from "@/components/muster/section-header";
import { StoryBanner } from "@/components/muster/story-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { useDemo } from "@/lib/data/store";
import { fmtMoney, fmtPct } from "@/lib/format";
import { c, Rich } from "@/lib/ui/copy";
import { cc } from "@/lib/ui/copy-c";
import { sc } from "@/components/gaps/story-copy";

import { CreditSplit } from "./credit-split";
import { EvidencePackButton } from "./evidence-pack-button";
import { summarizeFunding } from "./funding";
import { MultiplierChart } from "./multiplier-chart";
import { ObligationMeter } from "./obligation-meter";
import { SmbMeter } from "./smb-meter";
import { TransactionsTable } from "./transactions-table";
import { pickExample, WorkedExample, type ShopRef } from "./worked-example";

const PAGE = "mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8";
const RULES_LABEL = "Simplified ITB rules for demo";

/** Step 3 "Credit earned" (docs/ux-simplification.md §5.3). */
export function ScorecardView() {
  const demo = useDemo();
  const { ledger, assignments, fundResults, lastFund, gaps, stage } = demo;

  const funding = useMemo(() => summarizeFunding(fundResults, lastFund), [fundResults, lastFund]);
  const funded = stage === "funded" || !!funding;

  // shop_id → name/city, and job id → description, for labelling ledger rows.
  const { shops, jobParts } = useMemo(() => {
    const shops: Record<string, ShopRef> = {};
    const jobParts: Record<string, string> = {};
    const add = (a: { job_id: string; shop_id: string; shop_name: string; shop_city: string; description: string }) => {
      shops[a.shop_id] ??= { name: a.shop_name, city: a.shop_city };
      jobParts[a.job_id] ??= a.description;
    };
    for (const a of assignments ?? []) add(a);
    for (const f of Object.values(fundResults ?? {})) {
      for (const a of f.unblocked_jobs ?? []) add(a);
      if (f.package) shops[f.package.shop_id] ??= { name: f.package.shop_name, city: f.package.shop_city };
    }
    if (lastFund?.package) {
      shops[lastFund.package.shop_id] ??= { name: lastFund.package.shop_name, city: lastFund.package.shop_city };
    }
    for (const p of gaps?.suggestions ?? []) shops[p.shop_id] ??= { name: p.shop_name, city: p.shop_city };
    return { shops, jobParts };
  }, [assignments, fundResults, lastFund, gaps]);

  const example = useMemo(() => (ledger ? pickExample(ledger.transactions) : null), [ledger]);

  const fundedCategories = useMemo(() => {
    const s = new Set<string>();
    for (const f of funding?.funded ?? []) if (f.training_txn?.category) s.add(f.training_txn.category);
    return s;
  }, [funding]);

  const header = (
    <SectionHeader
      size="page"
      title={c("score.h1")}
      className="mb-4"
      right={
        <div className="flex flex-wrap items-start gap-2 sm:justify-end">
          <span className="inline-flex h-7 items-center self-center rounded-full border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700">
            {ledger?.rules_label || RULES_LABEL}
          </span>
          <EvidencePackButton ledger={ledger} />
        </div>
      }
    />
  );

  if (!ledger && !demo.ready) {
    return (
      <div className={PAGE}>
        <Skeleton className="mb-6 h-[7.5rem] rounded-xl" />
        {header}
        <div className="grid grid-cols-1 gap-5" aria-busy>
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!ledger) {
    return (
      <div className={PAGE}>
        <StoryBanner step={3} summary={<Rich text={cc("score.b.empty")} />} lookAt={cc("score.b.empty.look")} next={<AutoNextStep />} />
        {header}
        <EmptyState title={c("score.empty.title")} body={c("score.empty.body")} run={{ label: c("run.loadAndMatch") }} />
      </div>
    );
  }

  const credit = fmtMoney(ledger.credit_total_cad, { compact: true });
  const pct = fmtPct(ledger.obligation_met_pct);
  // The number of jobs training unstuck, from the fund results (3 after TP-01, 4 after TP-01 and
  // TP-02); a sentence without a count if the fund results are not loaded.
  const unstuck = funding?.unblockedJobs ?? 0;
  const summary = !funded
    ? cc("score.b", { credit, pct })
    : unstuck === 1
      ? sc("score.b.funded.one", { credit, pct })
      : unstuck > 1
        ? sc("score.b.funded.n", { unstuck, credit, pct })
        : sc("score.b.funded.any", { credit, pct });
  const explainer = c("app.creditExplainer").replace(/^(Credit isn't cash\.)/, "**$1**");

  return (
    <div className={PAGE}>
      <StoryBanner
        step={3}
        // Two lines reserved: the funded summary is shorter, and the meter below must not move.
        summary={<Rich text={summary} className="block min-h-[2lh]" />}
        lookAt={funded ? sc("score.b.funded.look") : cc("score.b.look")}
        next={<AutoNextStep />}
      />
      {header}

      <div className="grid grid-cols-1 gap-5">
        <p
          className="flex items-start gap-2.5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-[15px] leading-snug text-slate-700"
          data-testid="credit-explainer"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-blue-700" aria-hidden />
          <span>
            <Rich text={explainer} />
          </span>
        </p>

        <ObligationMeter ledger={ledger} funding={funding} />

        {example ? (
          <WorkedExample
            txn={example}
            shop={shops[example.shop_id] ? { ...shops[example.shop_id], part: jobParts[example.ref_id] ?? null } : undefined}
          />
        ) : null}

        <MultiplierChart ledger={ledger} fundedCategories={fundedCategories} />

        <SmbMeter ledger={ledger} funding={funding} />

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:px-5">
          <Details summary={c("score.details.split")}>
            <CreditSplit ledger={ledger} />
          </Details>
          <Details summary={c("score.details.ledger", { n: ledger.transactions.length })}>
            <TransactionsTable
              transactions={ledger.transactions}
              shops={shops}
              highlightRefs={funding?.packageIds ?? new Set<string>()}
              totalCredit={ledger.credit_total_cad}
            />
          </Details>
          {ledger.rules_version ? (
            <Details summary={c("score.details.rules")}>
              <span className="inline-flex h-7 items-center rounded-full bg-slate-100 px-3 font-mono text-xs text-slate-600">
                {cc("score.rules.chip", { version: ledger.rules_version })}
              </span>
            </Details>
          ) : null}
        </div>

        <div className="flex justify-end">
          <AutoNextStep />
        </div>
      </div>
    </div>
  );
}
