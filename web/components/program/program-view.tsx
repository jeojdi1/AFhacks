"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Lock } from "lucide-react";

import { AutoNextStep } from "@/components/muster/next-step";
import { SectionHeader } from "@/components/muster/section-header";
import { StatCard } from "@/components/muster/stat-card";
import { StoryBanner } from "@/components/muster/story-banner";
import type { PartsUploadResponse, RouteResponse, Shop } from "@/lib/api/types";
import { fx } from "@/lib/data/fixture-source";
import { useDemo } from "@/lib/data/store";
import { decisionKey, useAppActions } from "@/lib/app/actions-store";
import { fmtMoney, fmtPct } from "@/lib/format";
import { Rich } from "@/lib/ui/copy";
import { cb } from "@/lib/ui/copy-b";
import { useStoryMode } from "@/lib/ui/story-mode";
import { useWithParams } from "@/lib/ui/use-with-params";
import { sc } from "@/components/gaps/story-copy";

import { JobsTable } from "./jobs-table";
import { ProgramMap } from "./program-map";
import { UploadCard } from "./upload-card";
import { buildMapModel, buildRows, type JobFilter } from "./rows";

// Fallback when the program has not been fetched yet (docs/api.md §3).
const LONDON_ON = { lat: 42.9849, lon: -81.2453 };
// The checked-in Northgate list: the step-1 banner's fixed sentences describe exactly this list.
const DEMO_JOB_IDS = new Set(
  (fx<PartsUploadResponse>("POST", "/programs/northgate/parts")?.jobs ?? []).map((j) => j.id),
);

/**
 * /program, steps 1 and 2 of the story (docs/ux-simplification.md §5.1, §5.2).
 * Banner first; then (step 1) the upload card, or (step 2) big numbers, the map and the jobs table.
 */
export function ProgramView() {
  const demo = useDemo();
  const { stage, busy, error, mode, program, jobs, assignments, blocked, routeStats, solver } = demo;
  const { story } = useStoryMode();
  const wp = useWithParams();

  const [filter, setFilter] = useState<JobFilter>("all");
  const [shops, setShops] = useState<Shop[]>([]);

  // Load the shop network once per data mode (for idle pins on the map).
  const getShopsRef = useRef(demo.getShops);
  useEffect(() => {
    getShopsRef.current = demo.getShops;
  });
  useEffect(() => {
    let alive = true;
    getShopsRef
      .current()
      .then((r) => {
        // Discovered public shops are listed on /network only, never matched: keep them off Northgate's map.
        if (alive) setShops((r.shops ?? []).filter((s) => s.source !== "public"));
      })
      .catch(() => {
        /* map still shows matched shops from the routing result */
      });
    return () => {
      alive = false;
    };
  }, [mode]);

  const routed = stage === "routed" || stage === "funded" || assignments.length > 0;
  const { decisions, source } = useAppActions();
  const offerStatus = demo.offerStatus;
  const rows = useMemo(() => {
    const base = buildRows(jobs, assignments, blocked);
    // A shop's decline is shown on its row; routing and credit stay as matched (demo).
    return base.map((r) => {
      if (!r.assignment) return r;
      const k = decisionKey(r.assignment.shop_id, r.id);
      const declined = decisions[k]?.decision === "declined" || (source !== "engine" && offerStatus?.[k] === "declined");
      return declined ? { ...r, declined: true } : r;
    });
  }, [jobs, assignments, blocked, decisions, source, offerStatus]);
  const mapModel = useMemo(() => buildMapModel(shops, assignments), [shops, assignments]);

  const site = {
    lat: program?.site?.lat ?? LONDON_ON.lat,
    lon: program?.site?.lon ?? LONDON_ON.lon,
    label: cb("program.map.site"),
  };

  const assignedCount = routeStats?.assigned ?? assignments.length;
  const blockedCount = routeStats?.blocked ?? blocked.length;
  const totalJobs = routeStats?.jobs ?? rows.length;
  const assignedValue = routeStats?.assigned_value_cad ?? assignments.reduce((s, a) => s + a.value_cad, 0);
  const smeShare = routeStats?.sme_share_pct ?? null;
  const smePct = smeShare === null ? "—" : fmtPct(smeShare, 0);
  // Derived for display (§5.2): the number of distinct shops that received a job.
  const shopsUsed = new Set(assignments.map((a) => a.shop_id)).size;
  // Not every matched shop is a small business (QA Q9): say how many are.
  const smeShopsUsed = new Set(assignments.filter((a) => a.is_sme).map((a) => a.shop_id)).size;
  const controlledAssigned = assignments.filter((a) => a.controlled).length;
  const controlledTotal = Math.max(controlledAssigned, rows.filter((r) => r.controlled).length);
  const hasJobs = rows.length > 0;
  const isDemoList =
    jobs.length > 0 && jobs.length === DEMO_JOB_IDS.size && jobs.every((j) => DEMO_JOB_IDS.has(j.id));

  // The store does not keep elapsed_ms; in demo mode the recorded solver run is the source.
  const elapsedMs = useMemo(
    () => (mode === "fixtures" ? (fx<RouteResponse>("POST", "/programs/northgate/route")?.elapsed_ms ?? null) : null),
    [mode],
  );

  // ---- banner (§5.1 / §5.2) ----
  let banner: React.ReactNode;
  if (routed) {
    const vars = {
      assigned: assignedCount,
      jobs: totalJobs,
      shops: shopsUsed,
      smeShops: smeShopsUsed,
      value: fmtMoney(assignedValue, { compact: true }),
      smePct,
      blocked: blockedCount,
    };
    banner = (
      <StoryBanner
        step={2}
        summary={
          <Rich
            text={
              blockedCount === 0
                ? sc("program.b2.sme.allMatched", vars)
                : blockedCount === 1
                  ? sc("program.b2.sme.one", vars)
                  : sc("program.b2.sme", vars)
            }
          />
        }
        lookAt={cb("program.b2.look")}
        next={<AutoNextStep />}
        secondary={
          blockedCount > 0 ? (
            <Link href={wp("/gaps")} className="font-medium text-slate-700 underline underline-offset-4 hover:text-foreground">
              {blockedCount === 1 ? sc("program.next.why.one") : cb("program.next.why", { blocked: blockedCount })}
            </Link>
          ) : null
        }
      />
    );
  } else if (stage === "uploaded" || hasJobs) {
    const controlled = jobs.filter((j) => j.controlled).length;
    const total = jobs.reduce((s, j) => s + (j.est_value_cad ?? 0), 0);
    banner = (
      <StoryBanner
        step={1}
        summary={
          isDemoList
            ? cb("program.b1.uploaded")
            : cb("program.stats.uploaded", { n: jobs.length, value: fmtMoney(total, { compact: true }), controlled })
        }
        lookAt={isDemoList ? cb("program.b1.uploaded.look") : undefined}
        next={<AutoNextStep />}
      />
    );
  } else {
    banner = (
      <StoryBanner
        step={1}
        summary={cb("program.b1.empty")}
        lookAt={cb("program.b1.empty.look")}
        next={<AutoNextStep />}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-6 sm:px-6">
      {/* #map ("Start the demo", step-2 pill) lands on the Step 2 banner + Next, then the stat cards. */}
      <div id="map" className="scroll-mt-40">
        {banner}
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-foreground">{cb("program.h1")}</h1>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {!routed ? (
        <UploadCard
          stage={stage}
          busy={busy}
          jobs={jobs}
          fileName={demo.fileName ?? null}
          onUpload={(file) => demo.uploadParts(file)}
        />
      ) : null}

      <div className="flex flex-col gap-6">
        {routed ? (
          <section
            className={story ? "grid grid-cols-1 gap-4 sm:grid-cols-3" : "grid grid-cols-2 gap-4 lg:grid-cols-5"}
            aria-label={cb("program.map.title")}
          >
            <StatCard
              label={cb("program.stat.matched")}
              tone="success"
              value={
                <>
                  {assignedCount}
                  <span className="text-xl font-medium text-muted-foreground"> of {totalJobs}</span>
                </>
              }
              sub={sc("program.stat.matched.sub.sme", { shops: shopsUsed, smeShops: smeShopsUsed })}
            />
            <Link
              href={wp("/gaps")}
              className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              <StatCard
                label={cb("program.stat.stuck")}
                tone={blockedCount > 0 ? "warning" : "success"}
                value={blockedCount}
                className="h-full transition-colors group-hover:border-amber-300 group-hover:bg-amber-50/40"
                sub={blockedCount > 0 ? <StuckSub /> : sc("program.stat.stuck.none")}
              />
            </Link>
            <StatCard
              label={cb("program.stat.value")}
              value={<span title={fmtMoney(assignedValue)}>{fmtMoney(assignedValue, { compact: true })}</span>}
              sub={cb("program.stat.value.sub", { smePct })}
            />
            {!story ? (
              <>
                <div title={solverNote(solver, elapsedMs)} className="flex">
                  <StatCard
                    label={cb("program.stat.controlled")}
                    tone="controlled"
                    className="w-full"
                    value={
                      <>
                        {controlledAssigned}
                        <span className="text-xl font-medium text-muted-foreground"> of {controlledTotal}</span>
                      </>
                    }
                    sub={cb("program.stat.controlled.sub")}
                  />
                </div>
                <StatCard
                  label={cb("program.stat.sme")}
                  tone="success"
                  value={smePct}
                  sub={cb("program.stat.sme.sub")}
                />
              </>
            ) : null}
          </section>
        ) : null}

        {hasJobs ? (
          <section className="flex flex-col">
            <SectionHeader
              title={cb("program.map.title")}
              subtitle={routed ? cb("program.map.sub", { shops: shopsUsed }) : cb("program.map.sub.unrouted")}
            />
            <ProgramMap
              site={site}
              shops={mapModel.shops}
              lines={mapModel.lines}
              highlight={filter === "controlled" ? "controlled" : "all"}
              routed={routed}
            />
          </section>
        ) : null}
      </div>

      {hasJobs ? (
        <section className="flex flex-col">
          <SectionHeader
            title={cb("program.table.title", { jobs: rows.length })}
            subtitle={tableSubtitle(rows, routed)}
          />
          <JobsTable rows={rows} routed={routed} filter={filter} onFilterChange={setFilter} />
          <p className="mt-3 flex items-start gap-1.5 text-sm text-slate-600">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-violet-700" aria-hidden />
            <span>{cb("program.drawings")}</span>
          </p>
        </section>
      ) : null}

      {hasJobs ? (
        <div className="flex justify-end border-t border-border pt-6">
          <AutoNextStep />
        </div>
      ) : null}
    </div>
  );
}

function StuckSub() {
  // "no qualified welders free · See the fix →": the link part gets the arrow icon.
  const [reason, link] = cb("program.stat.stuck.sub").split(" · ");
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <span>{reason}</span>
      {link ? (
        <span className="inline-flex items-center gap-1 font-medium text-amber-800">
          · {link.replace(/\s*→$/, "")} <ArrowRight className="size-3.5" aria-hidden />
        </span>
      ) : null}
    </span>
  );
}

function tableSubtitle(rows: ReturnType<typeof buildRows>, routed: boolean): string {
  const rules = rows.filter((r) => r.tagSource === "rules").length;
  if (rules > 0) return cb("program.table.sub.mixed", { llm: rows.length - rules, rules });
  return routed ? cb("program.table.sub") : cb("program.table.sub.unrouted");
}

/** Solver detail kept off the headline cards (hover only). */
function solverNote(solver: string | null, elapsedMs: number | null): string | undefined {
  if (!solver) return undefined;
  const name =
    solver === "ortools" ? cb("program.solver.ortools") : solver === "greedy" ? cb("program.solver.greedy") : solver;
  return elapsedMs !== null ? `${name} in ${elapsedMs.toLocaleString("en-US")} ms` : name;
}
