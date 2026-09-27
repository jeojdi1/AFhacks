"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, TriangleAlert, TrendingUp } from "lucide-react";
import { cn } from "cn";

import type { Assignment, FundResponse } from "@/lib/api/types";
import { fmtMoney, fmtPct } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/muster/status-badge";
import { useArmed, useCountUp } from "./motion";

/** Timeline (ms after the panel is on screen). */
export const MOMENT = {
  start: 450, // let the scroll settle
  count: 1400, // credit counter + bars
  flipBase: 700, // first card flip, relative to start
  flipStagger: 150,
} as const;

/** Glue each " + " to the clause after it so a wrap never leaves a dangling "+". */
function glueClauses(text: string): string {
  return text.replace(/ \+ /g, " +\u00a0");
}

function Headline({ text }: { text: string }) {
  // Highlight the multiplier, e.g. "(5x)".
  const parts = glueClauses(text).split(/(\(\d+x\))/);
  return (
    <>
      {parts.map((p, i) =>
        /^\(\d+x\)$/.test(p) ? (
          <span key={i} className="rounded-md bg-emerald-100 px-1.5 text-emerald-800">
            {p.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Meter({
  label,
  before,
  after,
  armed,
  animate,
  delayMs,
  note,
}: {
  label: string;
  before: number;
  after: number;
  armed: boolean;
  animate: boolean;
  delayMs: number;
  note?: string;
}) {
  const shown = useCountUp(before, after, { duration: MOMENT.count, delay: delayMs, enabled: animate });
  const b = Math.min(1, Math.max(0, before));
  const a = Math.min(1, Math.max(0, after));
  const deltaPts = (after - before) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-zinc-700">{label}</span>
        <span className="text-sm text-zinc-500 tabular-nums">
          {fmtPct(before)} <span className="text-zinc-400">→</span>{" "}
          <span className="text-xl font-semibold text-zinc-900">{fmtPct(shown)}</span>
        </span>
      </div>
      <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-zinc-100">
        <div className="absolute inset-y-0 left-0 rounded-l-full bg-zinc-700" style={{ width: `${b * 100}%` }} />
        <div
          className={cn(
            "absolute inset-y-0 bg-emerald-500 transition-[width] ease-out",
            !animate && "transition-none",
          )}
          style={{
            left: `${b * 100}%`,
            width: armed ? `${Math.max(0, a - b) * 100}%` : "0%",
            transitionDuration: `${MOMENT.count}ms`,
          }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[13px] text-zinc-500">
        <span>{note}</span>
        {/* Appears once the counter has landed, so the delta never runs ahead of the numbers. */}
        <span
          className={cn(
            "font-medium text-emerald-700 tabular-nums transition-opacity duration-300",
            armed ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDelay: animate ? `${MOMENT.count}ms` : "0ms" }}
        >
          +{deltaPts.toFixed(1)} pts
        </span>
      </div>
    </div>
  );
}

function MiniFlip({ a, armed, animate, delayMs }: { a: Assignment; armed: boolean; animate: boolean; delayMs: number }) {
  return (
    <div className="min-w-0" style={{ perspective: "1200px" }}>
      <div
        className={cn("grid grid-cols-[minmax(0,1fr)] transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]", !animate && "transition-none")}
        style={{
          transformStyle: "preserve-3d",
          transform: armed ? "rotateX(180deg)" : "rotateX(0deg)",
          transitionDelay: animate ? `${delayMs}ms` : "0ms",
        }}
      >
        <div
          className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 [grid-area:1/1]"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
          aria-hidden={armed}
        >
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="min-w-0">
            <div className="font-mono text-[13px] font-medium text-amber-900">{a.part_no}</div>
            <div className="truncate text-sm text-zinc-800">{a.description}</div>
            <div className="mt-0.5 text-[13px] font-medium text-amber-800">Blocked before funding</div>
          </div>
        </div>
        <div
          className="flex items-start gap-2.5 rounded-lg border border-emerald-300 bg-emerald-50 p-3 [grid-area:1/1]"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateX(180deg)" }}
          aria-hidden={!armed}
        >
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-medium text-emerald-900">{a.part_no}</span>
              <span className="text-[13px] font-semibold text-emerald-700 tabular-nums" title={fmtMoney(a.credit_cad)}>
                +{fmtMoney(a.credit_cad, { compact: true })} credit
              </span>
            </div>
            <div className="truncate text-sm text-zinc-800">{a.description}</div>
            <div className="mt-0.5 truncate text-[13px] text-emerald-900">
              Assigned to <span className="font-semibold">{a.shop_name}</span>
              {a.shop_city ? ` (${a.shop_city})` : ""}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FundMoment({
  result,
  animate,
  reducedMotion,
  partNoById,
}: {
  result: FundResponse;
  /** Play the animation (true right after the viewer clicked Fund). */
  animate: boolean;
  reducedMotion: boolean;
  /** job_id → part_no, so "still blocked" uses the same ids as the cards. */
  partNoById?: Record<string, string>;
}) {
  const ref = useRef<HTMLElement>(null);
  const play = animate && !reducedMotion;
  const armed = useArmed(play ? result.package_id : null, MOMENT.start);
  const credit = useCountUp(result.before.credit_total_cad, result.after.credit_total_cad, {
    duration: MOMENT.count,
    delay: MOMENT.start,
    enabled: play,
  });

  const headlineRef = useRef<HTMLHeadingElement>(null);
  // Screen readers hear the headline once, after the count-up (not every frame of it).
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!animate) return;
    ref.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    // The Fund button is replaced by "Funded"; move focus here instead of letting it drop to <body>.
    headlineRef.current?.focus({ preventScroll: true });
    const id = window.setTimeout(
      () => setAnnouncement(result.headline),
      reducedMotion ? 150 : MOMENT.start + MOMENT.count,
    );
    return () => window.clearTimeout(id);
  }, [animate, reducedMotion, result.headline]);

  const { before, after, package: pkg, credit_added_breakdown: br } = result;
  const tenX = pkg.multiplier === 10 || pkg.recipient_type === "indigenous_institution";
  const totalAdded = Math.max(1, br.training_cad + br.jobs_cad);
  const trainingShare = br.training_cad / totalAdded;

  return (
    <section
      ref={ref}
      aria-labelledby={`fund-headline-${result.package_id}`}
      className={cn(
        "scroll-mt-24 rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/70 to-white p-6 md:p-8",
        play && "animate-in fade-in-0 slide-in-from-top-2 duration-500",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
          <StatusBadge kind="funded" />
          <span>
            Training package <span className="font-mono font-medium text-zinc-900">{result.package_id}</span> funded
            {pkg?.shop_name ? (
              <>
                {" "}at <span className="font-medium text-zinc-900">{pkg.shop_name}</span>
              </>
            ) : null}
          </span>
        </div>
        <Link
          href={`/shops/${pkg.shop_id}`}
          className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3.5 text-[15px]")}
        >
          See it from the shop&apos;s side
          <ArrowRight />
        </Link>
      </div>

      {/* (1) Headline */}
      <h2
        ref={headlineRef}
        id={`fund-headline-${result.package_id}`}
        tabIndex={-1}
        className="mt-4 text-3xl leading-tight font-semibold tracking-tight text-balance text-zinc-900 outline-none md:text-[40px]"
      >
        <Headline text={result.headline} />
      </h2>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <p className="mt-2 text-[13px] text-zinc-600" data-testid="fund-caveat">
        Training cost is an assumption · Simplified ITB rules for demo
        {tenX ? " · 10x Indigenous workforce credit needs Defence Investment Agency confirmation" : ""}
      </p>

      <div className="mt-7 grid gap-6 lg:grid-cols-12">
        {/* (2) Credit counter */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-5">
          <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-600">
            <TrendingUp className="size-4 text-emerald-600" />
            Total ITB credit
          </div>
          <div className="mt-2 text-[44px] leading-none font-semibold tracking-tight text-zinc-900 tabular-nums">
            {fmtMoney(Math.round(credit))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-500 tabular-nums">
            <span>was {fmtMoney(before.credit_total_cad)}</span>
            <span
              className={cn(
                "inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-semibold text-emerald-800 transition-opacity duration-500",
                armed ? "opacity-100" : "opacity-0",
              )}
              style={{ transitionDelay: play ? `${MOMENT.count - 200}ms` : "0ms" }}
            >
              +{fmtMoney(result.credit_added)}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4 text-sm">
            <div>
              <div className="text-zinc-500">Blocked jobs</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums">
                <span className="text-amber-700">{before.blocked}</span>
                <span className="px-1.5 text-zinc-400">→</span>
                <span className="text-zinc-900">{after.blocked}</span>
              </div>
            </div>
            <div>
              <div className="text-zinc-500">Assigned jobs</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums">
                <span className="text-zinc-500">{before.assigned}</span>
                <span className="px-1.5 text-zinc-400">→</span>
                <span className="text-emerald-700">{after.assigned}</span>
              </div>
            </div>
          </div>
        </div>

        {/* (3) Meters */}
        <div className="flex flex-col justify-center gap-6 rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-4">
          <Meter
            label="Obligation met"
            before={before.obligation_met_pct}
            after={after.obligation_met_pct}
            armed={armed}
            animate={play}
            delayMs={MOMENT.start}
            note="of the contract value owed to Canada"
          />
          <Meter
            label="SMB target progress"
            before={before.smb_progress_pct}
            after={after.smb_progress_pct}
            armed={armed}
            animate={play}
            delayMs={MOMENT.start}
            note={`${fmtMoney(before.smb_achieved_cad, { compact: true })} → ${fmtMoney(after.smb_achieved_cad, { compact: true })} SME work`}
          />
        </div>

        {/* (5) Breakdown */}
        <div className="flex flex-col rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-3">
          <div className="text-sm font-medium text-zinc-700">Where the new credit comes from</div>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-zinc-100">
            <div
              className={cn("bg-sky-500 transition-[width] ease-out", !play && "transition-none")}
              style={{
                width: armed ? `${trainingShare * 100}%` : "0%",
                transitionDuration: `${MOMENT.count}ms`,
              }}
            />
            <div
              className={cn("bg-emerald-500 transition-[width] ease-out", !play && "transition-none")}
              style={{
                width: armed ? `${(1 - trainingShare) * 100}%` : "0%",
                transitionDuration: `${MOMENT.count}ms`,
              }}
            />
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <dt className="flex items-start gap-2 text-zinc-600">
                <span className="mt-1.5 size-2.5 shrink-0 rounded-sm bg-sky-500" />
                <span>
                  Training
                  <span className="block text-[13px] text-zinc-400">indirect, {pkg.multiplier}x</span>
                </span>
              </dt>
              <dd className="font-semibold text-zinc-900 tabular-nums" title={fmtMoney(br.training_cad)}>
                {fmtMoney(br.training_cad, { compact: true })}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="flex items-start gap-2 text-zinc-600">
                <span className="mt-1.5 size-2.5 shrink-0 rounded-sm bg-emerald-500" />
                <span>
                  Unblocked jobs
                  <span className="block text-[13px] text-zinc-400">direct work now assigned</span>
                </span>
              </dt>
              <dd className="font-semibold text-zinc-900 tabular-nums" title={fmtMoney(br.jobs_cad)}>
                {fmtMoney(br.jobs_cad, { compact: true })}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* (4) Unblocked jobs flip */}
      {result.unblocked_jobs.length > 0 && (
        <div className="mt-6">
          <div className="mb-2.5 text-sm font-medium text-zinc-700">
            {result.unblocked_jobs.length} job{result.unblocked_jobs.length === 1 ? "" : "s"} unblocked
            {result.still_blocked.length > 0 ? (
              <span className="font-normal text-zinc-500">
                {" "}· {result.still_blocked.length} still blocked ({result.still_blocked.map((id) => partNoById?.[id] ?? id).join(", ")})
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {result.unblocked_jobs.map((a, i) => (
              <MiniFlip
                key={a.job_id}
                a={a}
                armed={armed}
                animate={play}
                delayMs={MOMENT.flipBase + i * MOMENT.flipStagger}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
