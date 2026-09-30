"use client";

import { useEffect, useState } from "react";
import { CircleCheck, GraduationCap, TriangleAlert } from "lucide-react";
import { cn } from "cn";

import type { Assignment, BlockedJob } from "@/lib/api/types";
import { fmtMoney } from "@/lib/format";
import { multiplierPlain } from "@/lib/ui/plain";
import { cd } from "@/lib/ui/copy-d";
import { Details } from "@/components/muster/details";
import { plainReason, shortDescription, whyNoShop } from "./labels";

export interface BlockedJobCardProps {
  /** The job as it was stuck (front face). */
  blocked?: BlockedJob;
  /** The assignment after training was funded (back face). */
  resolved?: Assignment;
  /** Show the resolved (green) face. Toggling it flips the row. */
  showResolved: boolean;
  /** CSS transition delay for the flip, ms. */
  flipDelayMs?: number;
  /** Training plan that unstuck this job (after funding). */
  unblockedBy?: string;
  /** The hero plan's id: rows it fixes get the "Unsticks with {id}" chip. */
  heroId?: string;
  reducedMotion?: boolean;
}

/**
 * One compact row per stuck job (docs/ux-simplification.md §5.4):
 * "NG-031 · Hull side stowage bin weldment · $1.7M · Stuck: both certified welding shops are full (…)".
 * The "shops failing each check" counts sit behind "Why no shop can take it", in words.
 */
function FrontFace({ b, heroId }: { b: BlockedJob; heroId?: string }) {
  const fixes = heroId && b.suggestion_ids.includes(heroId);
  const why = whyNoShop(b.failing_filters, b.process_tags?.[0]);
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3" data-job-row={b.job_id} data-face-kind="stuck">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[15px] leading-snug text-zinc-900">
          <TriangleAlert className="size-4 shrink-0 translate-y-0.5 self-start text-amber-600" aria-hidden />
          <span className="font-mono text-[13px] font-semibold text-amber-900">{b.job_id}</span>
          <span aria-hidden className="text-zinc-400">·</span>
          <span className="min-w-0 font-medium">{shortDescription(b.description)}</span>
          <span aria-hidden className="text-zinc-400">·</span>
          <span className="font-semibold tabular-nums" title={fmtMoney(b.value_cad)}>
            {fmtMoney(b.value_cad, { compact: true })}
          </span>
        </div>
        {fixes ? (
          <span
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700"
            title={cd("gaps.list.fixChip.tip", { id: heroId })}
          >
            <GraduationCap className="size-3.5" aria-hidden />
            {cd("gaps.list.fixChip", { id: heroId })}
          </span>
        ) : null}
      </div>
      <p className="mt-1 pl-6 text-sm leading-snug text-amber-950">
        <span className="font-semibold">{cd("gaps.list.stuck", { reason: plainReason(b) })}</span>
      </p>
      {why ? (
        <Details summary={cd("gaps.list.why")} className="mt-1 pl-5" contentClassName="pl-1.5 text-sm leading-snug text-zinc-700">
          {why}
        </Details>
      ) : null}
    </div>
  );
}

function BackFace({ a, fallbackTitle, unblockedBy }: { a: Assignment; fallbackTitle?: string; unblockedBy?: string }) {
  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3" data-job-row={a.job_id} data-face-kind="matched">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[15px] leading-snug text-zinc-900">
        <CircleCheck className="size-4 shrink-0 translate-y-0.5 self-start text-emerald-600" aria-hidden />
        <span className="font-mono text-[13px] font-semibold text-emerald-900">{a.job_id}</span>
        <span aria-hidden className="text-zinc-400">·</span>
        <span className="min-w-0 font-medium">{shortDescription(a.description || fallbackTitle)}</span>
        <span aria-hidden className="text-zinc-400">·</span>
        <span className="font-semibold tabular-nums" title={fmtMoney(a.value_cad)}>
          {fmtMoney(a.value_cad, { compact: true })}
        </span>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-6 text-sm leading-snug text-emerald-950">
        <span className="font-semibold">
          {cd("gaps.list.matched", { shop: a.shop_name, town: a.shop_city || "Ontario" })}
        </span>
        <span className="text-emerald-800 tabular-nums" title={fmtMoney(a.credit_cad)}>
          {cd("gaps.list.matched.credit", {
            credit: fmtMoney(a.credit_cad, { compact: true }),
            m: multiplierPlain(a.multiplier),
          })}
        </span>
      </p>
      {unblockedBy ? (
        <p className="mt-0.5 pl-6 text-[13px] text-emerald-800">{cd("gaps.list.unstuckBy", { id: unblockedBy })}</p>
      ) : null}
    </div>
  );
}

export function BlockedJobCard({
  blocked,
  resolved,
  showResolved,
  flipDelayMs = 0,
  unblockedBy,
  heroId,
  reducedMotion,
}: BlockedJobCardProps) {
  const flipped = showResolved;
  const bothFaces = Boolean(blocked && resolved);
  // sawFront: this row was shown stuck-side-up with both faces known, so a flip is (or was)
  // on screen. settled: that flip finished, so the row can drop the hidden stuck face.
  const [sawFront, setSawFront] = useState(false);
  const [settled, setSettled] = useState(false);
  if (bothFaces && !flipped && !sawFront) setSawFront(true);
  if (!flipped && settled) setSettled(false);

  const flipping = bothFaces && flipped && sawFront && !settled && !reducedMotion;
  useEffect(() => {
    if (!flipping) return;
    // Fallback in case transitionend never fires (tab hidden, interrupted).
    const id = window.setTimeout(() => setSettled(true), flipDelayMs + 1000);
    return () => window.clearTimeout(id);
  }, [flipping, flipDelayMs]);

  if (!resolved) {
    return blocked ? <FrontFace b={blocked} heroId={heroId} /> : null;
  }
  const back = <BackFace a={resolved} fallbackTitle={blocked?.description} unblockedBy={unblockedBy} />;
  if (!blocked) return back;
  // Already resolved when first seen, reduced motion, or the flip finished: the green face alone.
  if (flipped && !flipping) {
    return (
      <div id={`job-${resolved.job_id}`} data-face="resolved">
        {back}
      </div>
    );
  }

  // Both faces known: a 3D flip. The faces share one grid cell so the row is as tall as the
  // taller face while it turns.
  return (
    <div style={{ perspective: "1600px" }} id={`job-${resolved.job_id}`} data-face={flipped ? "flipping" : "blocked"}>
      <div
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && flipped) setSettled(true);
        }}
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
          <FrontFace b={blocked} heroId={heroId} />
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
