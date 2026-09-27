"use client";

import { useMemo, useState } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";

import type { Assignment, BlockedJob, TrainingPackage } from "@/lib/api/types";
import { useDemo } from "@/lib/data/store";
import { useAppActions } from "@/lib/app/actions-store";
import { fmtMoney } from "@/lib/format";
import { EmptyState } from "@/components/muster/empty-state";
import { SectionHeader } from "@/components/muster/section-header";
import { StatCard } from "@/components/muster/stat-card";
import { Term } from "@/components/muster/term";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockedJobCard } from "./blocked-job-card";
import { FundMoment, MOMENT } from "./fund-moment";
import { SuggestionCard } from "./suggestion-card";
import { useArmed, usePrefersReducedMotion } from "./motion";

const PAGE_TITLE = "Gaps & Training";
const PAGE_SUBTITLE = (
  <>
    Some jobs have no qualified shop with capacity — here, because of a shortage of Canadian Welding Bureau (
    <Term abbr="CWB" />) certified welders. Muster proposes <Term abbr="ITB" />-eligible training the prime can fund.
    Funding it earns 5x credit (10x for Indigenous workforce development) and unblocks the work.
  </>
);

interface Row {
  id: string;
  blocked?: BlockedJob;
  resolved?: Assignment;
  pkgId?: string;
}

export function GapsView() {
  const demo = useDemo();
  const reduced = usePrefersReducedMotion();

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Blocked jobs as they looked before a fund click, so the cards can flip
  // even after the store swaps in the post-fund gaps.
  const [preFund, setPreFund] = useState<Record<string, BlockedJob>>({});

  const routed = demo.stage === "routed" || demo.stage === "funded";
  const blockedNow: BlockedJob[] = useMemo(() => demo.gaps?.blocked ?? demo.blocked ?? [], [demo.gaps, demo.blocked]);
  const { fundingRequests } = useAppActions();
  // Packages the shop asked Northgate to fund (phone app, §2.5) sort first; order is otherwise unchanged.
  const suggestions: TrainingPackage[] = useMemo(() => {
    const list = demo.gaps?.suggestions ?? [];
    return list
      .map((p, i) => ({ p, i, r: fundingRequests[p.id] ? 0 : 1 }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((x) => x.p);
  }, [demo.gaps, fundingRequests]);

  // job_id → assignment created by funding a package
  const resolved = useMemo(() => {
    const m = new Map<string, { a: Assignment; pkgId: string }>();
    for (const [pkgId, fr] of Object.entries(demo.fundResults ?? {})) {
      for (const a of fr?.unblocked_jobs ?? []) m.set(a.job_id, { a, pkgId });
    }
    return m;
  }, [demo.fundResults]);

  const rows: Row[] = useMemo(() => {
    const byId = new Map<string, Row>();
    for (const b of blockedNow) byId.set(b.job_id, { id: b.job_id, blocked: b });
    for (const [id, r] of resolved) {
      // Keep the pre-fund blocked data (if we saw it) so the card can flip.
      const before = byId.get(id)?.blocked ?? preFund[id];
      byId.set(id, { id, blocked: before, resolved: r.a, pkgId: r.pkgId });
    }
    return [...byId.values()].sort((x, y) => x.id.localeCompare(y.id, undefined, { numeric: true }));
  }, [preFund, blockedNow, resolved]);

  const jobsById = useMemo(() => new Map((demo.jobs ?? []).map((j) => [j.id, j])), [demo.jobs]);
  const partNoById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const j of demo.jobs ?? []) m[j.id] = j.part_no;
    for (const b of blockedNow) m[b.job_id] ??= b.part_no;
    return m;
  }, [demo.jobs, blockedNow]);

  const stillBlocked = rows.filter((r) => !r.resolved && r.blocked);
  const stillBlockedValue = stillBlocked.reduce((s, r) => s + (r.blocked?.value_cad ?? 0), 0);
  const unblockedCount = resolved.size;
  const creditFromFunding = Object.values(demo.fundResults ?? {}).reduce((s, fr) => s + (fr?.credit_added ?? 0), 0);
  const totalJobs = demo.routeStats?.jobs ?? demo.jobs?.length ?? 0;

  const isFunded = (pkg: TrainingPackage) => pkg.status === "funded" || Boolean(demo.fundResults?.[pkg.id]);

  // Flip the list cards for the package that was just funded.
  const runKey = animatingId && !reduced && demo.fundResults?.[animatingId] ? animatingId : null;
  const listArmed = useArmed(runKey, MOMENT.start);
  // Stagger order for the cards of the just-funded package.
  const flipOrder = new Map(
    rows.filter((r) => r.resolved && r.pkgId === runKey).map((r, i) => [r.id, i] as const),
  );

  async function handleFund(pkg: TrainingPackage) {
    setErrors((e) => ({ ...e, [pkg.id]: "" }));
    setPreFund((prev) => {
      const next = { ...prev };
      for (const b of blockedNow) if (!next[b.job_id]) next[b.job_id] = b;
      return next;
    });
    setAnimatingId(pkg.id);
    setPendingId(pkg.id);
    try {
      // On failure the store sets demo.error (shown in the banner above).
      await demo.fund(pkg.id);
    } catch (err) {
      setErrors((e) => ({
        ...e,
        [pkg.id]: err instanceof Error ? err.message : "Could not fund this package. Please try again.",
      }));
    } finally {
      setPendingId(null);
    }
  }

  const header = <SectionHeader size="page" title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} />;

  if (!demo.ready) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-6 py-8">
        {header}
        <Skeleton className="h-28 rounded-xl" />
      </div>
    );
  }

  if (!routed) {
    return (
      <div className="mx-auto w-full max-w-[1280px] px-6 py-8">
        {header}
        <EmptyState
          title="Route the parts list first"
          body="Gaps appear once Muster has tried to place every job. Upload Northgate's parts list and run routing on the Program page."
          action={{ label: "Go to Program", href: "/program" }}
        />
      </div>
    );
  }

  const loading = !demo.gaps && blockedNow.length === 0 && resolved.size === 0;
  const topReason = stillBlocked.length === 0 ? "None" : demo.gaps?.summary.top_reason ?? stillBlocked[0]?.blocked?.reason_code ?? "—";

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-6 py-8">
      {/* Header sits directly in the gap-8 column so its own margin is not added on top. */}
      <SectionHeader size="page" title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} className="-mb-2" />
      {demo.error ? (
        <div className="-mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {demo.error}
        </div>
      ) : null}

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Blocked jobs"
          value={loading ? "…" : stillBlocked.length}
          sub={totalJobs ? `of ${totalJobs} jobs in the parts list` : undefined}
          tone={stillBlocked.length ? "warning" : "success"}
        />
        <StatCard
          label="Blocked value"
          value={<span title={fmtMoney(stillBlockedValue)}>{fmtMoney(stillBlockedValue, { compact: true })}</span>}
          sub="Work that cannot be placed yet"
          tone={stillBlocked.length ? "warning" : "success"}
        />
        <StatCard
          label="Top reason"
          value={<span className="block text-lg leading-snug font-semibold">{topReason}</span>}
          sub="Most common failing check"
          tone="default"
        />
        <StatCard
          label="Unblocked by training"
          value={unblockedCount}
          sub={
            unblockedCount ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CircleCheck className="size-3.5" />+{fmtMoney(creditFromFunding, { compact: true })} credit added
              </span>
            ) : (
              "Fund a package below"
            )
          }
          tone={unblockedCount ? "success" : "muted"}
        />
      </div>

      {/* THE MOMENT */}
      {demo.lastFund ? (
        <FundMoment
          key={demo.lastFund.package_id}
          result={demo.lastFund}
          animate={animatingId === demo.lastFund.package_id}
          reducedMotion={reduced}
          partNoById={partNoById}
        />
      ) : null}

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-12">
          <Skeleton className="h-80 rounded-xl lg:col-span-5" />
          <Skeleton className="h-80 rounded-xl lg:col-span-7" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="Every job is placed" body="Routing found a qualified shop with capacity for every job. No training is needed." />
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-12">
          <section className="lg:col-span-5">
            {unblockedCount > 0 ? (
              <SectionHeader
                title="Blocked and unblocked jobs"
                subtitle={`${unblockedCount} unblocked by training · ${stillBlocked.length} still blocked`}
              />
            ) : (
              <SectionHeader
                title="Blocked jobs"
                subtitle="No qualified shop with free capacity. Each card shows why, and how many shops fail each check."
              />
            )}
            <div className="flex flex-col gap-4">
              {rows.map((r) => {
                const job = jobsById.get(r.id);
                const order = flipOrder.get(r.id);
                const justFunded = order !== undefined;
                const delay = justFunded ? MOMENT.flipBase + order * MOMENT.flipStagger : 0;
                return (
                  <BlockedJobCard
                    key={r.id}
                    blocked={r.blocked}
                    resolved={r.resolved}
                    processTags={job?.process_tags}
                    requiredCerts={job?.required_certs}
                    showResolved={justFunded ? listArmed : true}
                    flipDelayMs={delay}
                    unblockedBy={r.pkgId}
                    reducedMotion={reduced}
                  />
                );
              })}
            </div>
          </section>

          <section className="lg:col-span-7">
            <SectionHeader
              title="Training suggestions"
              subtitle="ITB-eligible training that closes each gap. Costs are estimates for the demo."
            />
            <div className="flex flex-col gap-5">
              {suggestions.length === 0 ? (
                <EmptyState title="No suggestions yet" body="Training suggestions load with the gaps report." />
              ) : (
                suggestions.map((pkg) => (
                  <SuggestionCard
                    key={pkg.id}
                    pkg={pkg}
                    funded={isFunded(pkg)}
                    pending={pendingId === pkg.id}
                    disabled={pendingId !== null || demo.busy !== null}
                    error={errors[pkg.id] || null}
                    onFund={handleFund}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
