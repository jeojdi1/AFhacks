"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";

import type { Assignment, BlockedJob, TrainingPackage } from "@/lib/api/types";
import { useDemo } from "@/lib/data/store";
import { useAppActions } from "@/lib/app/actions-store";
import { shortShopName } from "@/lib/app/copy";
import { fmtMoney } from "@/lib/format";
import { Rich } from "@/lib/ui/copy";
import { cd } from "@/lib/ui/copy-d";
import { Details } from "@/components/muster/details";
import { EmptyState } from "@/components/muster/empty-state";
import { AutoNextStep, NextStep } from "@/components/muster/next-step";
import { StatCard } from "@/components/muster/stat-card";
import { StoryBanner } from "@/components/muster/story-banner";
import { EngineUnreachable } from "@/components/shell/engine-unreachable";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth";
import { scrollToFund } from "@/lib/ui/steps";
import { commonJobTrade, commonPackageTrade, isWelding, jobsNoun } from "@/lib/ui/trade-copy";
import { tradeForPackage, workersText } from "@/lib/trades";
import { useWithParams } from "@/lib/ui/use-with-params";
import { BlockedJobCard } from "./blocked-job-card";
import { FundMoment, MOMENT } from "./fund-moment";
import { sc } from "./story-copy";
import { SuggestionCard, type FundRole } from "./suggestion-card";
import { useArmed, usePrefersReducedMotion } from "./motion";

interface Row {
  id: string;
  blocked?: BlockedJob;
  resolved?: Assignment;
  pkgId?: string;
}

const PAGE = "mx-auto flex w-full max-w-[1280px] flex-col px-4 py-5 sm:px-6";

/** Supplier search for the stuck jobs' process and certificate (first stuck job; any trade). */
function publicShopsHref(stuck: BlockedJob[]): string {
  const first = stuck[0];
  const params = new URLSearchParams();
  const proc = first?.process_tags?.[0];
  const cert = (first?.required_certs ?? []).find((c) => c !== "CPCSC_L1" && c !== "ISO9001");
  if (proc) params.set("process", proc);
  if (cert) params.set("cert", cert);
  const q = params.toString();
  return q ? `/prime/suppliers?${q}` : "/prime/suppliers";
}

/** Smaller H1 under the banner (§5.0: the page title stays, the banner leads). */
function PageTitle() {
  return <h1 className="mb-4 text-xl font-semibold tracking-tight text-foreground">{cd("gaps.h1")}</h1>;
}

/**
 * /gaps, step 4 "Fix the skills gap" (docs/ux-simplification.md §5.4).
 * Order before funding: banner → training hero card (Fund button above the fold at 1280×720)
 * → stuck jobs list → "Another option". After funding the Fund moment leads.
 */
export function GapsView() {
  const demo = useDemo();
  const wp = useWithParams();
  const reduced = usePrefersReducedMotion();

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Stuck jobs as they looked before a fund click, so the rows can flip even after the store
  // swaps in the post-fund gaps.
  const [preFund, setPreFund] = useState<Record<string, BlockedJob>>({});

  const routed = demo.stage === "routed" || demo.stage === "funded";
  const blockedNow: BlockedJob[] = useMemo(() => demo.gaps?.blocked ?? demo.blocked ?? [], [demo.gaps, demo.blocked]);
  const { fundingRequests } = useAppActions();
  const { session, hydrated } = useSession();
  // Only the defence company funds training (or anyone in the signed-out demo). A signed-in
  // shop gets "Ask Northgate to fund this"; the college and trainee get a note.
  const fundRole: FundRole = !hydrated || !session || session.role === "prime" ? "prime" : session.role === "shop" ? "shop" : "other";
  const shopAccountId = session?.role === "shop" ? session.accountId : null;

  // The hero is the package that unsticks the most jobs, else the engine's order: TP-01 in the
  // demo, always, so the presenter's Fund click (and "↓ Fund the training below") hits TP-01.
  // A shop's funding request (phone app §2.5) is shown as a badge on its card and never
  // re-orders the hero; the simulator's requests would otherwise take it over (QA Q2).
  const { hero, others } = useMemo(() => {
    const list = demo.gaps?.suggestions ?? [];
    const sorted = list
      .map((p, i) => ({ p, i }))
      .sort((a, b) => b.p.blocked_job_ids.length - a.p.blocked_job_ids.length || a.i - b.i)
      .map((x) => x.p);
    return { hero: sorted[0] as TrainingPackage | undefined, others: sorted.slice(1) };
  }, [demo.gaps]);

  // Deep links such as /gaps#TP-02 (phone "Review in Gaps"): the cards render after the data
  // loads, so the browser's own hash scroll has already missed them. Scroll once they exist.
  const [hashId, setHashId] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setHashId(decodeURIComponent(window.location.hash.replace(/^#/, "")) || null);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const hashPkg = hashId && (demo.gaps?.suggestions ?? []).some((p) => p.id === hashId) ? hashId : null;
  useEffect(() => {
    if (!hashPkg) return;
    const t = window.setTimeout(() => {
      document.getElementById(hashPkg)?.scrollIntoView({ block: "start", behavior: "auto" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [hashPkg]);

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
      // Keep the pre-fund stuck data (if we saw it) so the row can flip.
      const before = byId.get(id)?.blocked ?? preFund[id];
      byId.set(id, { id, blocked: before, resolved: r.a, pkgId: r.pkgId });
    }
    return [...byId.values()].sort((x, y) => x.id.localeCompare(y.id, undefined, { numeric: true }));
  }, [preFund, blockedNow, resolved]);

  const jobsById = useMemo(() => new Map((demo.jobs ?? []).map((j) => [j.id, j])), [demo.jobs]);

  const stillBlocked = rows.filter((r) => !r.resolved && r.blocked);
  const stillBlockedValue = stillBlocked.reduce((s, r) => s + (r.blocked?.value_cad ?? 0), 0);
  const unstuck = rows.filter((r) => r.resolved);
  const unstuckValue = unstuck.reduce((s, r) => s + (r.resolved?.value_cad ?? 0), 0);
  const creditFromFunding = Object.values(demo.fundResults ?? {}).reduce((s, fr) => s + (fr?.credit_added ?? 0), 0);

  const isFunded = (pkg: TrainingPackage) => pkg.status === "funded" || Boolean(demo.fundResults?.[pkg.id]);

  // Hero tile 3: credit the unstuck jobs earn. After funding, the engine's number. Before, the
  // same formula the engine uses (value × Canadian content × the shop's multiplier, read from
  // one of that shop's existing matches); omitted if the shop has no match to read it from.
  const heroJobsCredit = useMemo(() => {
    if (!hero) return null;
    const fr = demo.fundResults?.[hero.id];
    if (fr) return fr.credit_added_breakdown.jobs_cad;
    const mult = demo.assignments.find((a) => a.shop_id === hero.shop_id)?.multiplier;
    if (!mult) return null;
    let total = 0;
    for (const id of hero.blocked_job_ids) {
      const j = jobsById.get(id);
      if (!j) return null;
      total += j.est_value_cad * j.ccv_pct * mult;
    }
    return total;
  }, [hero, demo.fundResults, demo.assignments, jobsById]);

  // Flip the list rows for the package that was just funded.
  const runKey = animatingId && !reduced && demo.fundResults?.[animatingId] ? animatingId : null;
  const listArmed = useArmed(runKey, MOMENT.start);
  const flipOrder = new Map(rows.filter((r) => r.resolved && r.pkgId === runKey).map((r, i) => [r.id, i] as const));

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
      // On failure the store sets demo.error (shown above).
      await demo.fund(pkg.id);
    } catch (err) {
      setErrors((e) => ({
        ...e,
        [pkg.id]: err instanceof Error ? err.message : "Could not fund this training. Please try again.",
      }));
    } finally {
      setPendingId(null);
    }
  }

  if (!demo.ready) {
    return (
      <div className={PAGE}>
        <Skeleton className="mb-6 h-28 rounded-xl" />
        <PageTitle />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (!routed && demo.loadFailed) {
    return (
      <div className={PAGE}>
        <PageTitle />
        <EngineUnreachable />
      </div>
    );
  }

  if (!routed) {
    return (
      <div className={PAGE}>
        <StoryBanner step={4} summary={cd("gaps.empty.title")} />
        <PageTitle />
        <EmptyState title={cd("gaps.empty.title")} body={cd("gaps.empty.body")} run={{ label: cd("run.loadAndMatch") }} />
      </div>
    );
  }

  const loading = !demo.gaps && blockedNow.length === 0 && resolved.size === 0;
  const funded = demo.stage === "funded" || unstuck.length > 0;

  const fundedPkgs = (demo.gaps?.suggestions ?? []).filter(isFunded);
  const fundedSeats = fundedPkgs.reduce((s, p) => s + p.trainees, 0);
  // Every trade, not just welders: the demo's welding story keeps its words; any other trade
  // (or a mix) gets the trade's own nouns, and nothing unmapped says "welders".
  const heroTrade = tradeForPackage(hero);
  const stuckTrade = commonJobTrade(stillBlocked.map((r) => r.blocked!));
  const weldingStory = (hero ? isWelding(heroTrade) : true) && (stillBlocked.length === 0 || isWelding(stuckTrade));
  const fundedTrade = commonPackageTrade(fundedPkgs);
  const fundedWelding = fundedPkgs.length > 0 ? isWelding(fundedTrade) : weldingStory;
  const fundedWhat =
    fundedSeats > 0
      ? fundedWelding
        ? sc("gaps.b.funded.seats", { seats: fundedSeats })
        : fundedTrade
          ? sc("gaps.b.funded.seats.trade", { seats: fundedSeats, worker: fundedTrade.worker })
          : sc("gaps.b.funded.seats.generic", { seats: fundedSeats })
      : fundedWelding
        ? sc("gaps.b.funded.training")
        : fundedTrade
          ? sc("gaps.b.funded.training.trade", { worker: fundedTrade.worker })
          : sc("gaps.b.funded.training.generic");
  const summary = funded
    ? stillBlocked.length === 0
      ? fundedWelding
        ? cd("gaps.b.funded.none")
        : cd("gaps.b.funded.none.trade", { training: fundedWhat })
      : sc("gaps.b.funded.n", {
          what: fundedWhat,
          k: unstuck.length,
          jobsWord: unstuck.length === 1 ? "job" : "jobs",
          jobsValue: fmtMoney(unstuckValue, { compact: true }),
          left: stillBlocked.length,
          isAre: stillBlocked.length === 1 ? "is" : "are",
        })
    : stillBlocked.length === 0 && !loading
      ? cd("gaps.b.clear")
      : weldingStory
        ? cd("gaps.b", {
            n: stillBlocked.length,
            value: fmtMoney(stillBlockedValue, { compact: true }),
            shop: hero ? shortShopName(hero.shop_name) : "a nearby shop",
            k: hero?.blocked_job_ids.length ?? 0,
          })
        : cd("gaps.b.trade", {
            n: stillBlocked.length,
            jobsNoun: jobsNoun(stillBlocked.length, stuckTrade),
            isAre: stillBlocked.length === 1 ? "is" : "are",
            value: fmtMoney(stillBlockedValue, { compact: true }),
            who: hero ? workersText(heroTrade, hero.trainees) : "qualified workers",
            shop: hero ? shortShopName(hero.shop_name) : "a nearby shop",
            k: hero?.blocked_job_ids.length ?? 0,
          });

  const heroCard = hero ? (
    <SuggestionCard
      variant="hero"
      pkg={hero}
      funded={isFunded(hero)}
      pending={pendingId === hero.id}
      disabled={pendingId !== null || demo.busy !== null}
      error={errors[hero.id] || null}
      onFund={handleFund}
      jobsCreditCad={heroJobsCredit}
      fundRole={fundRole}
      shopAccountId={shopAccountId}
    />
  ) : null;

  const othersRequested = others.some((p) => fundingRequests[p.id] && !isFunded(p));
  const othersOpen = funded || othersRequested || others.some(isFunded) || (hashPkg !== null && others.some((p) => p.id === hashPkg));
  const otherCards = others.map((pkg) => (
    <SuggestionCard
      key={pkg.id}
      variant="option"
      pkg={pkg}
      funded={isFunded(pkg)}
      pending={pendingId === pkg.id}
      disabled={pendingId !== null || demo.busy !== null}
      error={errors[pkg.id] || null}
      onFund={handleFund}
      fundRole={fundRole}
      shopAccountId={shopAccountId}
    />
  ));

  // Before funding, the Fund button on the hero card is the page's one primary action, so the
  // banner's "↓ Fund the training below" is a quieter outline button (QA Q34: no two red buttons).
  const heroFundable = Boolean(hero && !isFunded(hero) && fundRole === "prime" && !loading && rows.length > 0);
  const bannerNext = !funded && heroFundable ? (
    // text-foreground: <Button> keeps its default white text under the outline variant.
    <NextStep label={cd("gaps.next.fund")} variant="secondary" onClick={() => void scrollToFund()} className="text-foreground" />
  ) : (
    <AutoNextStep />
  );

  return (
    <div className={PAGE}>
      <StoryBanner
        step={4}
        summary={<Rich text={summary} />}
        lookAt={funded ? cd("gaps.b.funded.look") : cd("gaps.b.look")}
        next={bannerNext}
      />
      <PageTitle />

      {demo.error ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {demo.error}
        </div>
      ) : null}

      <div className="flex flex-col gap-8">
        {/* THE MOMENT */}
        {demo.lastFund ? (
          <FundMoment
            key={demo.lastFund.package_id}
            result={demo.lastFund}
            animate={animatingId === demo.lastFund.package_id}
            reducedMotion={reduced}
          />
        ) : null}

        {loading ? (
          <Skeleton className="h-72 rounded-xl" />
        ) : rows.length === 0 ? (
          <EmptyState title={cd("gaps.allPlaced.title")} body={cd("gaps.allPlaced.body")} />
        ) : (
          <>
            {/* 1. The fix */}
            {heroCard}

            {/* 2. Stuck jobs, compact */}
            <section aria-labelledby="stuck-title" className="grid items-start gap-5 lg:grid-cols-12">
              <div className="lg:col-span-8">
                <h2 id="stuck-title" className="mb-3 text-lg font-semibold tracking-tight text-foreground">
                  {unstuck.length > 0
                    ? weldingStory
                      ? cd("gaps.list.title.funded", { fixed: unstuck.length, left: stillBlocked.length })
                      : cd("gaps.list.title.funded.trade", { fixed: unstuck.length, left: stillBlocked.length })
                    : !weldingStory
                      ? cd("gaps.list.title.trade", { n: stillBlocked.length, jobsNoun: jobsNoun(stillBlocked.length, stuckTrade) })
                      : stillBlocked.length === 1
                        ? sc("gaps.list.title.one")
                        : cd("gaps.list.title", { n: stillBlocked.length })}
                </h2>
                <div className="flex flex-col gap-2.5">
                  {rows.map((r) => {
                    const order = flipOrder.get(r.id);
                    const justFunded = order !== undefined;
                    const delay = justFunded ? MOMENT.flipBase + order * MOMENT.flipStagger : 0;
                    return (
                      <BlockedJobCard
                        key={r.id}
                        blocked={r.blocked}
                        resolved={r.resolved}
                        showResolved={justFunded ? listArmed : true}
                        flipDelayMs={delay}
                        unblockedBy={r.pkgId}
                        heroId={hero?.id}
                        reducedMotion={reduced}
                      />
                    );
                  })}
                </div>
                {stillBlocked.length > 0 ? (
                  <p className="mt-3 text-sm">
                    <Link
                      href={wp(weldingStory ? "/prime/suppliers?cert=CWB_W47.1" : publicShopsHref(stillBlocked.map((r) => r.blocked!)))}
                      className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      data-testid="gaps-public-cwb"
                    >
                      {weldingStory ? cd("gaps.list.publicCwb") : cd("gaps.list.publicShops")}
                    </Link>
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 lg:col-span-4 lg:mt-10 lg:grid-cols-1">
                <StatCard
                  label={cd("gaps.stat.stuck")}
                  value={stillBlocked.length}
                  sub={
                    <span title={fmtMoney(stillBlockedValue)}>
                      {cd("gaps.stat.stuck.sub", { value: fmtMoney(stillBlockedValue, { compact: true }) })}
                    </span>
                  }
                  tone={stillBlocked.length ? "warning" : "success"}
                />
                <StatCard
                  label={cd("gaps.stat.unstuck")}
                  value={unstuck.length}
                  sub={
                    unstuck.length ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700" title={fmtMoney(creditFromFunding)}>
                        <CircleCheck className="size-3.5" aria-hidden />
                        {cd("gaps.stat.unstuck.sub", { credit: fmtMoney(creditFromFunding, { compact: true }) })}
                      </span>
                    ) : (
                      cd("gaps.stat.unstuck.sub.none")
                    )
                  }
                  tone={unstuck.length ? "success" : "muted"}
                />
              </div>
            </section>

            {/* 3. Another option. Collapsed in Story mode until it matters: after the fund moment,
                when a shop asked for one of these packages, or when a link points at one. */}
            {others.length > 0 ? (
              <section aria-label={cd("gaps.other.title")} data-other-options>
                {othersOpen ? (
                  <>
                    <h2 className="mb-1 text-lg font-semibold tracking-tight text-foreground">
                      {othersRequested ? sc("gaps.other.title.requested") : cd("gaps.other.title")}
                    </h2>
                    <div className="flex flex-col gap-4">
                      <p className="text-sm text-muted-foreground">{cd("gaps.other.sub")}</p>
                      {otherCards}
                    </div>
                  </>
                ) : (
                  <Details summary={cd("gaps.other.title")} contentClassName="flex flex-col gap-4">
                    <p className="text-sm text-muted-foreground">{cd("gaps.other.sub")}</p>
                    {otherCards}
                  </Details>
                )}
              </section>
            ) : null}
          </>
        )}

        {/* Next step, repeated at the bottom (§3.3). Before funding the banner's "↓ Fund the
            training below" points down at the hero card, so it is not repeated under it. */}
        {funded ? (
          <div className="flex justify-end border-t border-border pt-5">
            <AutoNextStep />
          </div>
        ) : null}
      </div>
    </div>
  );
}
