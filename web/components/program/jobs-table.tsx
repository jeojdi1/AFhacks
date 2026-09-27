"use client";

import Link from "next/link";
import { ArrowRight, Sparkles, TriangleAlert } from "lucide-react";

import { StatusBadge } from "@/components/muster/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TagSource } from "@/lib/api/types";
import { fmtKm, fmtMoney, label, PROCESS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

import { filterRows, type JobFilter, type JobRow } from "./rows";
import { BlockedWhyPopover, MiniBar, WhyPopover } from "./why-popover";

export interface JobsTableProps {
  rows: JobRow[];
  routed: boolean;
  filter: JobFilter;
  onFilterChange: (f: JobFilter) => void;
}

export function JobsTable({ rows, routed, filter, onFilterChange }: JobsTableProps) {
  const counts: Record<JobFilter, number> = {
    all: rows.length,
    assigned: rows.filter((r) => r.status === "assigned").length,
    blocked: rows.filter((r) => r.status === "blocked").length,
    controlled: rows.filter((r) => r.controlled).length,
  };
  const visible = filterRows(rows, filter);
  const filters: { id: JobFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "assigned", label: "Assigned" },
    { id: "blocked", label: "Blocked" },
    { id: "controlled", label: "Controlled" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => onFilterChange(v as JobFilter)} className="max-w-full min-w-0 overflow-x-auto">
          <TabsList className="h-9!">
            {filters.map((f) => (
              <TabsTrigger key={f.id} value={f.id} className="px-3 text-sm" disabled={!routed && (f.id === "assigned" || f.id === "blocked")}>
                {f.label}
                <span className="ml-1 rounded-full bg-slate-200/70 px-1.5 text-xs tabular-nums text-slate-700">
                  {counts[f.id]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {!routed ? (
          <p className="text-sm text-slate-500">Tagged and ready. Press “Route jobs” to assign shops.</p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <Table className="text-sm">
          <TableHeader className="bg-slate-50/80">
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4 text-slate-600">Part</TableHead>
              <TableHead className="text-slate-600">Description</TableHead>
              <TableHead className="text-slate-600">Processes</TableHead>
              <TableHead className="text-slate-600">Status</TableHead>
              <TableHead className="text-slate-600">Shop</TableHead>
              <TableHead className="text-slate-600">Score</TableHead>
              <TableHead className="text-right text-slate-600">Value</TableHead>
              <TableHead className="text-right text-slate-600">ITB credit</TableHead>
              <TableHead className="pr-4 text-slate-600">
                <span className="sr-only">Why</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="py-10 text-center text-slate-500">
                  No jobs match this filter.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => <JobRowView key={r.id} row={r} />)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function JobRowView({ row: r }: { row: JobRow }) {
  const a = r.assignment;
  const b = r.blocked;
  return (
    <TableRow
      className={cn(
        "align-top",
        r.status === "blocked" && "bg-amber-50/40 hover:bg-amber-50/70",
      )}
    >
      <TableCell className="py-3 pl-4">
        <div className="font-mono text-[13px] font-medium text-slate-900">{r.partNo}</div>
        <div className="text-xs text-slate-500">{r.id}</div>
      </TableCell>

      <TableCell className="py-3">
        <Tooltip>
          <TooltipTrigger
            render={<span />}
            className="line-clamp-2 block max-w-[300px] cursor-default whitespace-normal text-slate-800"
          >
            {r.description}
          </TooltipTrigger>
          <TooltipContent className="max-w-sm text-sm">{r.description}</TooltipContent>
        </Tooltip>
        {r.controlled ? (
          <div className="mt-1">
            <StatusBadge kind="controlled" />
          </div>
        ) : null}
      </TableCell>

      <TableCell className="py-3">
        <ProcessChips tags={r.processTags} />
        <TagSourceChip source={r.tagSource} warning={r.tagWarning} />
      </TableCell>

      <TableCell className="py-3">
        {r.status === "unrouted" ? (
          <span className="inline-flex h-5 items-center rounded-full border border-slate-200 px-2 text-xs font-medium text-slate-500">
            Unrouted
          </span>
        ) : (
          <StatusBadge kind={r.status} />
        )}
      </TableCell>

      {a ? (
        <>
          <TableCell className="py-3">
            <div className="line-clamp-2 max-w-[260px] font-medium whitespace-normal text-slate-900" title={a.shop_name}>
              {a.shop_name}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <StatusBadge kind={a.shop_source === "public" ? "public" : "synthetic"} />
              <span className="text-xs text-slate-500">
                {a.shop_city} · {fmtKm(a.distance_km)}
              </span>
            </div>
          </TableCell>
          <TableCell className="py-3">
            <div className="flex w-20 flex-col gap-1">
              <span className="font-semibold tabular-nums text-slate-900">{Math.round(a.score * 100)}</span>
              <MiniBar value={a.score} tone="emerald" />
            </div>
          </TableCell>
        </>
      ) : b ? (
        <TableCell colSpan={2} className="py-3 whitespace-normal">
          <div className="max-w-[320px] text-[13px] leading-snug text-amber-900">{b.reason}</div>
          <Link
            href="/gaps"
            className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-amber-800 underline-offset-4 hover:underline"
          >
            See training fix <ArrowRight className="size-3.5" />
          </Link>
        </TableCell>
      ) : (
        <TableCell colSpan={2} className="py-3 text-slate-400">
          —
        </TableCell>
      )}

      <TableCell className="py-3 text-right">
        <Tooltip>
          <TooltipTrigger render={<span />} className="cursor-default font-medium tabular-nums text-slate-900">
            {fmtMoney(r.valueCad, { compact: true })}
          </TooltipTrigger>
          <TooltipContent>{fmtMoney(r.valueCad)}</TooltipContent>
        </Tooltip>
      </TableCell>

      <TableCell className="py-3 text-right">
        {a ? (
          <div className="flex items-center justify-end gap-1.5">
            <Tooltip>
              <TooltipTrigger render={<span />} className="cursor-default font-medium tabular-nums text-slate-900">
                {fmtMoney(a.credit_cad, { compact: true })}
              </TooltipTrigger>
              <TooltipContent>
                {fmtMoney(a.value_cad)} × {Math.round(a.ccv_pct * 100)}% CCV × {a.multiplier}x = {fmtMoney(a.credit_cad)}
              </TooltipContent>
            </Tooltip>
            <MultiplierPill multiplier={a.multiplier} sme={a.category === "sme_direct"} />
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
        <Tooltip>
          <TooltipTrigger
            render={<span />}
            className="inline-flex h-5 cursor-default items-center rounded-md bg-slate-100 px-1.5 text-xs font-medium text-slate-500"
          >
            +{rest}
          </TooltipTrigger>
          <TooltipContent>{tags.slice(2).map((t) => label(PROCESS_LABEL, t)).join(", ")}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

const TAG_SOURCE_LABEL: Record<TagSource, { text: string; title: string }> = {
  llm: { text: "Tagged by Claude", title: "Claude read this line and tagged its processes, material and certs" },
  cache: {
    text: "Claude (cached)",
    title: "Tagged by Claude earlier; the saved result was reused so the demo runs offline",
  },
  rules: { text: "Keyword rules", title: "Tagged by the keyword fallback (Claude was not available for this line)" },
};

function TagSourceChip({ source, warning }: { source: TagSource | null; warning: string | null }) {
  if (!source && !warning) return null;
  const info = source ? TAG_SOURCE_LABEL[source] : null;
  return (
    <div className="mt-1.5 flex items-center gap-1" data-testid="tag-source">
      {info ? (
        <span
          title={info.title}
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap",
            source === "rules" ? "bg-slate-50 text-slate-600 ring-1 ring-slate-200" : "bg-sky-50 text-sky-800 ring-1 ring-sky-200",
          )}
        >
          {source === "rules" ? null : <Sparkles className="size-3" aria-hidden />}
          {info.text}
        </span>
      ) : null}
      {warning ? (
        <Tooltip>
          <TooltipTrigger
            render={<span />}
            tabIndex={0}
            aria-label={`Needs review: ${warning}`}
            data-testid="tag-warning"
            className="inline-flex h-5 cursor-default items-center gap-0.5 rounded-md bg-amber-50 px-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-300"
          >
            <TriangleAlert className="size-3.5 text-amber-600" aria-hidden />
            Review
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-sm">{warning}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

function MultiplierPill({ multiplier, sme }: { multiplier: number; sme: boolean }) {
  return (
    <span
      title={sme ? "SME direct work earns 2x credit" : "Regular work earns 1x credit"}
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold tabular-nums",
        sme ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-500",
      )}
    >
      {multiplier}x
    </span>
  );
}
