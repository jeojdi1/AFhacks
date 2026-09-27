"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ChevronDown, TriangleAlert } from "lucide-react";

import { StatusBadge } from "@/components/muster/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtKm, fmtMoney, fmtPct, label, PROCESS_LABEL } from "@/lib/format";
import { cb } from "@/lib/ui/copy-b";
import { useStoryMode } from "@/lib/ui/story-mode";
import { useWithParams } from "@/lib/ui/use-with-params";
import { cn } from "@/lib/utils";

import { plainStuckReason, TermText } from "./plain-text";
import { filterRows, pinnedRows, type JobFilter, type JobRow } from "./rows";
import { BlockedWhyPopover, MiniBar, WhyPopover } from "./why-popover";

export interface JobsTableProps {
  rows: JobRow[];
  routed: boolean;
  filter: JobFilter;
  onFilterChange: (f: JobFilter) => void;
}

/**
 * "The 40 jobs" (docs/ux-simplification.md §5.2). Story mode shows 6 pinned rows (the stuck
 * jobs, the controlled job NG-004, the largest matched job) and a "Show all 40 jobs" button;
 * detail mode shows every row with filters, the processes column and part numbers.
 */
export function JobsTable({ rows, routed, filter, onFilterChange }: JobsTableProps) {
  const { story } = useStoryMode();
  // "Show all" holds until Story mode flips (then the mode's default applies again).
  const [expanded, setExpanded] = useState<{ story: boolean; open: boolean } | null>(null);
  const showAll = !story || (expanded?.story === story && expanded.open);
  const pinned = pinnedRows(rows, routed);
  const canCollapse = story && rows.length > pinned.length;

  const counts: Record<JobFilter, number> = {
    all: rows.length,
    assigned: rows.filter((r) => r.status === "assigned").length,
    blocked: rows.filter((r) => r.status === "blocked").length,
    controlled: rows.filter((r) => r.controlled).length,
  };
  const visible = showAll ? filterRows(rows, filter) : pinned;
  const filters: { id: JobFilter; label: string }[] = [
    { id: "all", label: cb("program.filter.all") },
    { id: "assigned", label: cb("program.filter.matched") },
    { id: "blocked", label: cb("program.filter.stuck") },
    { id: "controlled", label: cb("program.filter.controlled") },
  ];
  const detail = !story;
  const cols = 5 + (detail ? 1 : 0) + 1;

  return (
    <div className="flex flex-col gap-3">
      {showAll ? (
        <Tabs
          value={filter}
          onValueChange={(v) => onFilterChange(v as JobFilter)}
          className="max-w-full min-w-0 overflow-x-auto"
        >
          <TabsList className="h-9!">
            {filters.map((f) => (
              <TabsTrigger
                key={f.id}
                value={f.id}
                className="px-3 text-sm"
                disabled={!routed && (f.id === "assigned" || f.id === "blocked")}
              >
                {f.label}
                <span className="ml-1 rounded-full bg-slate-200/70 px-1.5 text-xs tabular-nums text-slate-700">
                  {counts[f.id]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : (
        <p className="text-sm text-slate-600">
          {routed
            ? cb("program.table.showing", { n: pinned.length, jobs: rows.length })
            : cb("program.table.showing.unrouted", { n: pinned.length, jobs: rows.length })}
        </p>
      )}

      {/* Below sm (phones, 390 px): one stacked card per job, so the value and credit stay on
          screen (QA Q34). The table takes over from sm up. */}
      <ul className="flex flex-col gap-2 sm:hidden" data-jobs-cards>
        {visible.length === 0 ? (
          <li className="rounded-xl border border-slate-200 bg-white py-8 text-center text-sm text-slate-500">
            {cb("program.table.none")}
          </li>
        ) : (
          visible.map((r) => <JobCardView key={r.id} row={r} />)
        )}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white sm:block">
        <Table className="text-sm">
          <TableHeader className="bg-slate-50/80">
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4 text-slate-600">{cb("program.col.job")}</TableHead>
              {detail ? <TableHead className="text-slate-600">{cb("program.col.processes")}</TableHead> : null}
              <TableHead className="text-slate-600">{cb("program.col.shop")}</TableHead>
              <TableHead className="text-slate-600">{cb("program.col.match")}</TableHead>
              <TableHead className="text-right text-slate-600">{cb("program.col.value")}</TableHead>
              <TableHead className="text-right text-slate-600">
                <Tooltip>
                  <TooltipTrigger
                    render={<span />}
                    tabIndex={0}
                    title={cb("program.col.credit.tip")}
                    className="cursor-help underline decoration-slate-400 decoration-dotted underline-offset-4"
                  >
                    {cb("program.col.credit")}
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{cb("program.col.credit.tip")}</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="pr-4 text-slate-600">
                <span className="sr-only">{cb("program.col.why")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={cols} className="py-10 text-center text-slate-500">
                  {cb("program.table.none")}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => <JobRowView key={r.id} row={r} detail={detail} />)
            )}
          </TableBody>
        </Table>
      </div>

      {canCollapse ? (
        <div>
          <button
            type="button"
            aria-expanded={showAll}
            onClick={() => setExpanded({ story, open: !showAll })}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium text-slate-700 underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring"
          >
            <ChevronDown
              className={cn("size-4 transition-transform motion-reduce:transition-none", showAll && "rotate-180")}
              aria-hidden
            />
            {showAll ? cb("program.table.showFewer") : cb("program.table.showAll", { jobs: rows.length })}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function JobRowView({ row: r, detail }: { row: JobRow; detail: boolean }) {
  const wp = useWithParams();
  const a = r.assignment;
  const b = r.blocked;
  return (
    <TableRow className={cn("align-top", r.status === "blocked" && "bg-amber-50/40 hover:bg-amber-50/70")}>
      <TableCell className="py-3 pl-4 whitespace-normal">
        <div className="text-xs text-slate-500 tabular-nums">
          {r.id}
          {detail ? <span className="font-mono"> · {r.partNo}</span> : null}
        </div>
        <div className="line-clamp-2 max-w-[340px] text-[15px] leading-snug text-slate-900" title={r.description}>
          <TermText text={r.description} />
        </div>
        {r.controlled || r.tagSource === "rules" || r.tagWarning ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {r.controlled ? <StatusBadge kind="controlled" label={cb("program.badge.controlled")} /> : null}
            <TagChips source={r.tagSource} warning={r.tagWarning} />
          </div>
        ) : null}
      </TableCell>

      {detail ? (
        <TableCell className="py-3">
          <ProcessChips tags={r.processTags} />
        </TableCell>
      ) : null}

      {a ? (
        <>
          <TableCell className="py-3 whitespace-normal">
            <div className="line-clamp-2 max-w-[260px] font-medium text-slate-900" title={a.shop_name}>
              {a.shop_name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <StatusBadge kind={a.shop_source === "public" ? "public" : "synthetic"} />
              {r.declined ? <DeclinedChip /> : null}
              <span className="text-xs text-slate-500">
                {a.shop_city} · {fmtKm(a.distance_km)}
              </span>
            </div>
          </TableCell>
          <TableCell className="py-3">
            <div className="flex w-20 flex-col gap-1">
              <span className="font-semibold tabular-nums text-slate-900">
                {Math.round(a.score * 100)}
                <span className="text-xs font-normal text-slate-500">/100</span>
              </span>
              <MiniBar value={a.score} tone="emerald" />
            </div>
          </TableCell>
        </>
      ) : b ? (
        <TableCell colSpan={2} className="py-3 whitespace-normal">
          {/* Colour, icon and text together: amber + warning icon + "Stuck: …". */}
          <div className="flex max-w-[360px] items-start gap-1.5 text-[13px] leading-snug text-amber-900" title={b.reason}>
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
            <span>
              <span className="font-semibold">{cb("program.badge.stuck")}:</span>{" "}
              {cb("program.stuck.reason", { reason: plainStuckReason(b.reason) }).replace(/^Stuck:\s*/, "")}
            </span>
          </div>
          <Link
            href={wp("/gaps")}
            className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-amber-800 underline-offset-4 hover:underline"
          >
            {cb("program.stuck.fix").replace(/\s*→$/, "")} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </TableCell>
      ) : (
        <TableCell colSpan={2} className="py-3 text-sm text-slate-400">
          {cb("program.notMatched")}
        </TableCell>
      )}

      <TableCell className="py-3 text-right">
        <span className="font-medium tabular-nums text-slate-900" title={fmtMoney(r.valueCad)}>
          {fmtMoney(r.valueCad, { compact: true })}
        </span>
      </TableCell>

      <TableCell className="py-3 text-right">
        {a ? (
          <div className="flex flex-col items-end gap-1">
            <span
              className="font-medium tabular-nums text-slate-900"
              title={cb("program.credit.row", {
                value: fmtMoney(a.value_cad),
                ccv: fmtPct(a.ccv_pct, 0),
                mult: a.multiplier,
                credit: fmtMoney(a.credit_cad),
              })}
            >
              {fmtMoney(a.credit_cad, { compact: true })}
            </span>
            <MultiplierChip multiplier={a.multiplier} />
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </TableCell>

      <TableCell className="py-3 pr-4 text-right">
        {a ? <WhyPopover assignment={a} /> : b ? <BlockedWhyPopover blocked={b} /> : null}
      </TableCell>
    </TableRow>
  );
}

/** The same job as a stacked card for narrow screens: job, shop or stuck reason, value → credit. */
function JobCardView({ row: r }: { row: JobRow }) {
  const wp = useWithParams();
  const a = r.assignment;
  const b = r.blocked;
  return (
    <li
      className={cn(
        "rounded-xl border bg-white px-4 py-3",
        r.status === "blocked" ? "border-amber-200 bg-amber-50/40" : "border-slate-200",
      )}
      data-job-card={r.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-500 tabular-nums">{r.id}</div>
          <div className="line-clamp-2 text-[15px] leading-snug text-slate-900" title={r.description}>
            <TermText text={r.description} />
          </div>
        </div>
        <div className="shrink-0 pt-4">
          {a ? <WhyPopover assignment={a} /> : b ? <BlockedWhyPopover blocked={b} /> : null}
        </div>
      </div>
      {r.controlled || r.tagSource === "rules" || r.tagWarning ? (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {r.controlled ? <StatusBadge kind="controlled" label={cb("program.badge.controlled")} /> : null}
          <TagChips source={r.tagSource} warning={r.tagWarning} />
        </div>
      ) : null}

      {a ? (
        <div className="mt-2 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-slate-900">{a.shop_name}</span>
            <StatusBadge kind={a.shop_source === "public" ? "public" : "synthetic"} />
            {r.declined ? <DeclinedChip /> : null}
          </div>
          <div className="text-xs text-slate-500">
            {a.shop_city} · {fmtKm(a.distance_km)} · {cb("why.match", { score: Math.round(a.score * 100) })}
          </div>
        </div>
      ) : b ? (
        <div className="mt-2">
          <div className="flex items-start gap-1.5 text-[13px] leading-snug text-amber-900" title={b.reason}>
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
            <span>
              <span className="font-semibold">{cb("program.badge.stuck")}:</span>{" "}
              {cb("program.stuck.reason", { reason: plainStuckReason(b.reason) }).replace(/^Stuck:\s*/, "")}
            </span>
          </div>
          <Link
            href={wp("/gaps")}
            className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-amber-800 underline-offset-4 hover:underline"
          >
            {cb("program.stuck.fix").replace(/\s*→$/, "")} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="mt-2 text-sm text-slate-400">{cb("program.notMatched")}</div>
      )}

      <dl className="mt-2 grid grid-cols-2 gap-3 border-t border-slate-100 pt-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500">{cb("program.col.value")}</dt>
          <dd className="font-medium tabular-nums text-slate-900" title={fmtMoney(r.valueCad)}>
            {fmtMoney(r.valueCad, { compact: true })}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500" title={cb("program.col.credit.tip")}>
            {cb("program.col.credit")}
          </dt>
          <dd className="flex flex-wrap items-center gap-1.5">
            {a ? (
              <>
                <span className="font-medium tabular-nums text-slate-900">{fmtMoney(a.credit_cad, { compact: true })}</span>
                <MultiplierChip multiplier={a.multiplier} />
              </>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </dd>
        </div>
      </dl>
    </li>
  );
}

function ProcessChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return <span className="text-slate-400">—</span>;
  const shown = tags.slice(0, 2);
  const rest = tags.length - shown.length;
  return (
    <div className="flex max-w-[210px] flex-wrap gap-1">
      {shown.map((t) => (
        <span
          key={t}
          className="inline-flex h-5 items-center rounded-md bg-slate-100 px-1.5 text-xs font-medium text-slate-700"
        >
          {label(PROCESS_LABEL, t)}
        </span>
      ))}
      {rest > 0 ? (
        <span
          title={tags.slice(2).map((t) => label(PROCESS_LABEL, t)).join(", ")}
          className="inline-flex h-5 cursor-default items-center rounded-md bg-slate-100 px-1.5 text-xs font-medium text-slate-500"
        >
          +{rest}
        </span>
      ) : null}
    </div>
  );
}

/** Tag source is stated once in the table subtitle; rows only flag keyword-rule lines and warnings. */
function TagChips({ source, warning }: { source: JobRow["tagSource"]; warning: string | null }) {
  return (
    <>
      {source === "rules" ? (
        <span
          data-testid="tag-source"
          title={cb("program.chip.rules.tip")}
          className="inline-flex h-5 items-center rounded-md bg-slate-50 px-1.5 text-[11px] font-medium whitespace-nowrap text-slate-600 ring-1 ring-slate-200"
        >
          {cb("program.chip.rules")}
        </span>
      ) : null}
      {warning ? (
        <span
          data-testid="tag-warning"
          tabIndex={0}
          title={warning}
          aria-label={`${cb("program.chip.review")}: ${warning}`}
          className="inline-flex h-5 cursor-default items-center gap-0.5 rounded-md bg-amber-50 px-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-300"
        >
          <TriangleAlert className="size-3.5 text-amber-600" aria-hidden />
          {cb("program.chip.review")}
        </span>
      ) : null}
    </>
  );
}

function MultiplierChip({ multiplier }: { multiplier: number }) {
  const double = multiplier === 2;
  return (
    <span
      title={cb("plain.MULTIPLIER.tip")}
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap",
        double ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-600",
      )}
    >
      {double ? cb("program.chip.double") : multiplier === 1 ? cb("program.chip.single") : `counts ${multiplier}×`}
    </span>
  );
}

/** The shop said no; the demo keeps routing (and credit) as matched until Northgate re-routes. */
function DeclinedChip() {
  return (
    <span
      className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900"
      title="The shop declined this offer. The demo keeps the match and its credit until Northgate picks another shop."
      data-declined-chip
    >
      Declined, still counted (demo)
    </span>
  );
}
