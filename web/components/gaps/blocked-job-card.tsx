"use client";

import { CircleCheck, TriangleAlert, ArrowRight, Clock, Store } from "lucide-react";
import { cn } from "cn";

import type { Assignment, BlockedJob } from "@/lib/api/types";
import { CERT_LABEL, PROCESS_LABEL, fmtMoney, label } from "@/lib/format";
import { StatusBadge } from "@/components/muster/status-badge";
import { FILTER_LABEL, FILTER_ORDER } from "./labels";

export interface BlockedJobCardProps {
  /** The job as it was blocked (front face). */
  blocked?: BlockedJob;
  /** The assignment after training was funded (back face). */
  resolved?: Assignment;
  /** Fallback tags when only the assignment is known. */
  processTags?: string[];
  requiredCerts?: string[];
  /** Show the resolved (emerald) face. Toggling it flips the card. */
  showResolved: boolean;
  /** CSS transition delay for the flip, ms. */
  flipDelayMs?: number;
  /** Package id that unblocked this job. */
  unblockedBy?: string;
  reducedMotion?: boolean;
}

function Chips({ processTags, requiredCerts }: { processTags: string[]; requiredCerts: string[] }) {
  if (!processTags.length && !requiredCerts.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {processTags.map((p) => (
        <span
          key={p}
          className="inline-flex h-6 items-center rounded-md border border-zinc-200 bg-white px-2 text-[13px] text-zinc-700"
        >
          {label(PROCESS_LABEL, p)}
        </span>
      ))}
      {requiredCerts.map((c) => (
        <span
          key={c}
          className="inline-flex h-6 items-center rounded-md border border-zinc-300 bg-zinc-100 px-2 text-[13px] font-medium text-zinc-800"
        >
          {label(CERT_LABEL, c)}
        </span>
      ))}
    </div>
  );
}

function FailingFilters({ filters }: { filters: BlockedJob["failing_filters"] }) {
  const f = filters as unknown as Record<string, number>;
  return (
    <div>
      <div className="mb-1 text-xs font-medium tracking-wide text-zinc-500 uppercase">
        Shops failing each check
      </div>
      <div className="grid grid-cols-6 overflow-hidden rounded-md border border-amber-200/80 bg-white">
        {FILTER_ORDER.map((k) => {
          const n = f[k] ?? 0;
          return (
            <div
              key={k}
              className="flex flex-col items-center border-r border-amber-100 px-1 py-1.5 last:border-r-0"
              title={`${n} shop${n === 1 ? "" : "s"} fail the ${FILTER_LABEL[k].toLowerCase()} check`}
            >
              <span
                className={cn(
                  "text-base leading-none font-semibold tabular-nums",
                  n > 0 ? "text-amber-800" : "text-zinc-300",
                )}
              >
                {n}
              </span>
              <span className={cn("mt-1 text-[11px] leading-none", n > 0 ? "text-zinc-600" : "text-zinc-400")}>
                {FILTER_LABEL[k]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FrontFace({ b }: { b: BlockedJob }) {
  const n = b.eligible_shop_count;
  const eligibleText =
    b.reason_code === "capacity"
      ? `${n} qualified shop${n === 1 ? "" : "s"}, all at capacity`
      : `${n} shop${n === 1 ? "" : "s"} pass every check except capacity`;
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-medium text-amber-900">{b.part_no}</div>
          <div className="mt-0.5 text-[15px] leading-snug font-medium text-zinc-900">{b.description}</div>
        </div>
        <StatusBadge kind="blocked" />
      </div>
      <Chips processTags={b.process_tags} requiredCerts={b.required_certs} />
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-zinc-700">
        <span title={fmtMoney(b.value_cad)}>
          <span className="text-lg font-semibold text-zinc-900 tabular-nums">
            {fmtMoney(b.value_cad, { compact: true })}
          </span>{" "}
          value
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Clock className="size-3.5 text-zinc-400" />
          {b.hours_week} h/week
        </span>
        <span className="inline-flex items-center gap-1">
          <Store className="size-3.5 text-zinc-400" />
          {eligibleText}
        </span>
      </div>
      <div className="flex gap-2 rounded-lg bg-amber-100/70 px-3 py-2 text-sm leading-snug text-amber-950">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <span>{b.reason}</span>
      </div>
      <FailingFilters filters={b.failing_filters} />
      {b.suggestion_ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">Fix:</span>
          {b.suggestion_ids.map((id) => (
            <a
              key={id}
              href={`#${id}`}
              className="inline-flex items-center gap-1 font-medium text-zinc-900 underline-offset-4 hover:underline"
            >
              Training package {id}
              <ArrowRight className="size-3.5" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function BackFace({
  a,
  fallbackTitle,
  processTags,
  requiredCerts,
  unblockedBy,
}: {
  a: Assignment;
  fallbackTitle?: string;
  processTags: string[];
  requiredCerts: string[];
  unblockedBy?: string;
}) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-medium text-emerald-900">{a.part_no}</div>
          <div className="mt-0.5 text-[15px] leading-snug font-medium text-zinc-900">
            {a.description || fallbackTitle}
          </div>
        </div>
        <StatusBadge kind="assigned" />
      </div>
      <Chips processTags={processTags} requiredCerts={requiredCerts} />
      <div className="flex items-center gap-2.5 rounded-lg bg-emerald-100/80 px-3 py-2.5 text-emerald-950">
        <CircleCheck className="size-6 shrink-0 text-emerald-600" />
        <div className="text-[15px] leading-snug">
          Assigned to <span className="font-semibold">{a.shop_name}</span>
          {a.shop_city ? <span className="text-emerald-800"> ({a.shop_city})</span> : null}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-zinc-700">
        <span title={fmtMoney(a.value_cad)}>
          <span className="text-lg font-semibold text-zinc-900 tabular-nums">
            {fmtMoney(a.value_cad, { compact: true })}
          </span>{" "}
          value
        </span>
        <span title={fmtMoney(a.credit_cad)}>
          <span className="font-semibold text-emerald-700 tabular-nums">
            +{fmtMoney(a.credit_cad, { compact: true })}
          </span>{" "}
          credit ({a.multiplier}x)
        </span>
        <span className="tabular-nums">{a.hours_week} h/week</span>
      </div>
      {unblockedBy && (
        <div className="text-[13px] text-emerald-800">Unblocked by funding training package {unblockedBy}</div>
      )}
    </div>
  );
}

export function BlockedJobCard({
  blocked,
  resolved,
  processTags,
  requiredCerts,
  showResolved,
  flipDelayMs = 0,
  unblockedBy,
  reducedMotion,
}: BlockedJobCardProps) {
  const tags = blocked?.process_tags ?? processTags ?? [];
  const certs = blocked?.required_certs ?? requiredCerts ?? [];

  if (!resolved) {
    return blocked ? <FrontFace b={blocked} /> : null;
  }
  const back = (
    <BackFace
      a={resolved}
      fallbackTitle={blocked?.description}
      processTags={tags}
      requiredCerts={certs}
      unblockedBy={unblockedBy}
    />
  );
  if (!blocked) return back;

  // Both faces known: a 3D flip card. The faces share one grid cell so the
  // card is as tall as the taller face.
  const flipped = showResolved;
  return (
    <div style={{ perspective: "1600px" }} id={`job-${resolved.job_id}`}>
      <div
        className={cn(
          "grid transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          reducedMotion && "transition-none",
        )}
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateX(180deg)" : "rotateX(0deg)",
          transitionDelay: reducedMotion ? "0ms" : `${flipDelayMs}ms`,
        }}
      >
        <div
          className="[grid-area:1/1]"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
          aria-hidden={flipped}
        >
          <FrontFace b={blocked} />
        </div>
        <div
          className="[grid-area:1/1]"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateX(180deg)",
          }}
          aria-hidden={!flipped}
        >
          {back}
        </div>
      </div>
    </div>
  );
}
