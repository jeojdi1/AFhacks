"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";

import { SectionHeader, StatCard } from "@/components/muster";
import type { RouteResponse, Shop } from "@/lib/api/types";
import { fx } from "@/lib/data/fixture-source";
import { useDemo } from "@/lib/data/store";
import { fmtMoney, fmtPct } from "@/lib/format";

import { JobsTable } from "./jobs-table";
import { ProgramMap } from "./program-map";
import { UploadCard } from "./upload-card";
import { buildMapModel, buildRows, type JobFilter } from "./rows";

// Fallback when the program has not been fetched yet (docs/api.md §3).
const LONDON_ON = { lat: 42.9849, lon: -81.2453 };

export function ProgramView() {
  const demo = useDemo();
  const {
    stage,
    busy,
    error,
    mode,
    program,
    jobs,
    assignments,
    blocked,
    routeStats,
    solver,
  } = demo;

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
        // Discovered public shops (onboarding "discovered") are listed on /network only, never routed: keep them off the prime's map.
        if (alive) setShops((r.shops ?? []).filter((s) => s.source !== "public"));
      })
      .catch(() => {
        /* map still shows assigned shops from the routing result */
      });
    return () => {
      alive = false;
    };
  }, [mode]);

  const routed = stage === "routed" || stage === "funded" || assignments.length > 0;
  const rows = useMemo(() => buildRows(jobs, assignments, blocked), [jobs, assignments, blocked]);
  const mapModel = useMemo(() => buildMapModel(shops, assignments), [shops, assignments]);

  const site = {
    lat: program?.site?.lat ?? LONDON_ON.lat,
    lon: program?.site?.lon ?? LONDON_ON.lon,
    label: "Northgate site (fictional)",
  };

  const assignedCount = routeStats?.assigned ?? assignments.length;
  const blockedCount = routeStats?.blocked ?? blocked.length;
  const totalJobs = routeStats?.jobs ?? rows.length;
  const assignedValue =
    routeStats?.assigned_value_cad ?? assignments.reduce((s, a) => s + a.value_cad, 0);
  const smeShare = routeStats?.sme_share_pct ?? null;
  const shopsUsed = new Set(assignments.map((a) => a.shop_id)).size;
  const controlledAssigned = assignments.filter((a) => a.controlled).length;
  const controlledTotal = Math.max(
    controlledAssigned,
    rows.filter((r) => r.controlled).length,
  );

  const hasJobs = rows.length > 0;
  // The store does not keep elapsed_ms; in demo mode the recorded solver run
  // (route.json) is the source, in live mode we simply omit it.
  const elapsedMs = useMemo(
    () =>
      mode === "fixtures"
        ? (fx<RouteResponse>("POST", "/programs/northgate/route")?.elapsed_ms ?? null)
        : null,
    [mode],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-6 py-8">
      <SectionHeader
        size="page"
        className="mb-0"
        eyebrow="Route"
        title="Program: Northgate work package"
        subtitle="Upload the prime's parts list. Muster tags each line, filters shops by process, size, certifications and Controlled Goods rules, then assigns each job to the best qualified Canadian shop."
      />

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <UploadCard
        stage={stage}
        busy={busy}
        jobs={jobs}
        fileName={demo.fileName ?? null}
        onUpload={(file) => demo.uploadParts(file)}
        onRoute={() => demo.route()}
      />

      {routed ? (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard
            label="Assigned"
            tone="success"
            value={assignedCount}
            sub={`of ${totalJobs} jobs · ${shopsUsed} shops`}
          />
          <Link
            href="/gaps"
            className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            <StatCard
              label="Blocked"
              tone="warning"
              value={blockedCount}
              className="h-full transition-colors group-hover:border-amber-300 group-hover:bg-amber-50/40"
              sub={
                <span className="inline-flex items-center gap-1 font-medium text-amber-800">
                  See training fixes <ArrowRight className="size-3.5" />
                </span>
              }
            />
          </Link>
          <StatCard
            label="Assigned value"
            value={fmtMoney(assignedValue, { compact: true })}
            sub={fmtMoney(assignedValue)}
          />
          <StatCard
            label="SME share"
            tone="success"
            value={smeShare === null ? "—" : fmtPct(smeShare, 0)}
            sub="of assigned value → 2x credit"
          />
          <div title={solverNote(solver, elapsedMs)} className="flex">
            <StatCard
              label="Controlled jobs"
              tone="controlled"
              className="w-full"
              value={
                <>
                  {controlledAssigned}
                  <span className="text-xl font-medium text-muted-foreground"> of {controlledTotal}</span>
                </>
              }
              sub="sent only to CGP-registered shops"
            />
          </div>
        </section>
      ) : null}

      {hasJobs ? (
        <section className="flex flex-col">
          <SectionHeader
            title="Where the work goes"
            subtitle={
              routed
                ? "Lines run from Northgate's London site to every shop that won a job. Dashed violet lines are controlled jobs, which may only go to CGP-registered shops."
                : "The shop network in southwestern Ontario. Route the jobs to draw assignments."
            }
          />
          <ProgramMap
            site={site}
            shops={mapModel.shops}
            lines={mapModel.lines}
            highlight={filter === "controlled" ? "controlled" : "all"}
          />
        </section>
      ) : null}

      {hasJobs ? (
        <section className="flex flex-col">
          <SectionHeader
            title={routed ? "Jobs and assignments" : "Tagged jobs"}
            subtitle={
              routed
                ? "Each line of the parts list, the shop it went to, and why. Open “Why?” for the top reasons and score breakdown."
                : "Every parts-list line, tagged with processes, material, size, certifications and Controlled Goods status."
            }
          />
          <JobsTable rows={rows} routed={routed} filter={filter} onFilterChange={setFilter} />
        </section>
      ) : null}
    </div>
  );
}

/** Solver detail kept off the headline cards (hover only). */
function solverNote(solver: string | null, elapsedMs: number | null): string | undefined {
  if (!solver) return undefined;
  const name = solver === "ortools" ? "OR-Tools optimal assignment" : solver === "greedy" ? "Greedy assignment" : solver;
  return elapsedMs !== null ? `${name} in ${elapsedMs.toLocaleString("en-US")} ms` : name;
}
