"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, TriangleAlert, TrendingUp } from "lucide-react";
import { cn } from "cn";

import type { Assignment, FundResponse } from "@/lib/api/types";
import { fmtMoney, fmtPct } from "@/lib/format";
import { Rich } from "@/lib/ui/copy";
import { cd } from "@/lib/ui/copy-d";
import { useWithParams } from "@/lib/ui/use-with-params";
import { buttonVariants } from "@/components/ui/button";
import { BeforeAfterBar } from "@/components/muster/before-after-bar";
import { Details } from "@/components/muster/details";
import { StatusBadge } from "@/components/muster/status-badge";
import { Term } from "@/components/muster/term";
import { shortDescription } from "./labels";
import { sc } from "./story-copy";
import { useArmed, useCountUp } from "./motion";
import { useDemo } from "@/lib/data/store";
import { TrainingCapNote } from "@/components/scorecard/training-cap";

/** Timeline (ms after the panel is on screen). */
export const MOMENT = {
  start: 450, // let the scroll settle
  count: 1400, // credit counter
  flipBase: 700, // first card flip, relative to start
  flipStagger: 150,
} as const;

/** Glue each " + " to the clause after it so a wrap never leaves a dangling "+". */
function glueClauses(text: string): string {
  return text.replace(/ \+ /g, " +\u00a0");
}

/** The engine headline, verbatim (§10.1). Only the multiplier, e.g. "(5x)", gets a highlight. */
function Headline({ text }: { text: string }) {
  const parts = glueClauses(text).split(/(\(\d+x\))/);
  return (
    <>
      {parts.map((p, i) =>
        /^\(\d+x\)$/.test(p) ? (
          <span key={i} className="rounded-md bg-emerald-100 px-1 text-emerald-800">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function MiniFlip({ a, armed, animate, delayMs }: { a: Assignment; armed: boolean; animate: boolean; delayMs: number }) {
  const desc = shortDescription(a.description);
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
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="min-w-0">
            <div className="font-mono text-[13px] font-semibold text-amber-900">{a.job_id}</div>
            <div className="truncate text-sm text-zinc-800">{desc}</div>
            <div className="mt-0.5 text-[13px] font-medium text-amber-800">{cd("fund.flip.before")}</div>
          </div>
        </div>
        <div
          className="flex items-start gap-2.5 rounded-lg border border-emerald-300 bg-emerald-50 p-3 [grid-area:1/1]"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateX(180deg)" }}
          aria-hidden={!armed}
        >
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-semibold text-emerald-900">{a.job_id}</span>
              <span className="text-[13px] font-semibold text-emerald-700 tabular-nums" title={fmtMoney(a.credit_cad)}>
                +{fmtMoney(a.credit_cad, { compact: true })} credit
              </span>
            </div>
            <div className="truncate text-sm text-zinc-800">{desc}</div>
            <div className="mt-0.5 truncate text-[13px] text-emerald-900">
              {cd("fund.flip.after", { shop: a.shop_name })}
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
}: {
  result: FundResponse;
  /** Play the animation (true right after the viewer clicked Fund). */
  animate: boolean;
  reducedMotion: boolean;
}) {
  const wp = useWithParams();
  const { ledger } = useDemo();
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
  const k = result.unblocked_jobs.length;
  const jobsValue = result.unblocked_jobs.reduce((s, a) => s + (a.value_cad ?? 0), 0);
  const m = (n: number) => fmtMoney(n, { compact: true });

  return (
    <section
      ref={ref}
      data-fund-moment
      aria-labelledby={`fund-headline-${result.package_id}`}
      className={cn(
        "scroll-mt-32 rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/70 to-white p-5 md:p-7",
        play && "animate-in fade-in-0 slide-in-from-top-2 duration-500",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
          <StatusBadge kind="funded" />
          <span>{cd("fund.title", { id: result.package_id, shop: pkg?.shop_name ?? "" })}</span>
        </div>
        <Link
          href={wp(`/shops/${pkg.shop_id}`)}
          className={cn(buttonVariants({ variant: "outline" }), "h-9 gap-2 px-3.5 text-[15px]")}
        >
          {cd("gaps.hero.seeShop").replace(/\s*→\s*$/, "")}
          <ArrowRight aria-hidden />
        </Link>
      </div>

      {/* (1) Headline: verbatim from the engine, never rewritten */}
      <h2
        ref={headlineRef}
        id={`fund-headline-${result.package_id}`}
        tabIndex={-1}
        data-fund-headline
        className="mt-4 text-3xl leading-tight font-semibold tracking-tight text-balance text-zinc-900 outline-none md:text-[40px]"
      >
        <Headline text={result.headline} />
      </h2>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {/* (1b) What it means, in words */}
      <p className="mt-2 max-w-4xl text-base leading-snug text-zinc-700 md:text-[17px]" data-testid="fund-caption">
        {pkg.multiplier === 5
          ? cd("fund.caption", { jobsValue: m(jobsValue) })
          : sc("fund.caption.m", { jobsValue: m(jobsValue), m: pkg.multiplier })}
      </p>
      <p className="mt-1.5 text-[13px] text-zinc-600" data-testid="fund-caveat">
        {cd("fund.caveat")}
        {tenX ? cd("fund.caveat.tenX") : ""}
      </p>
      {/* Training-credit cap: from the ledger (all funded training), else this fund result. */}
      <TrainingCapNote
        ledger={
          ledger && ledger.transactions.some((t) => t.origin === "training")
            ? ledger
            : {
                obligation_cad:
                  ledger?.obligation_cad ??
                  (after.obligation_met_pct > 0 ? after.credit_total_cad / after.obligation_met_pct : 0),
                transactions: [result.training_txn],
              }
        }
        rulesLabel={ledger?.rules_label}
        className="mt-1.5 text-[13px] text-zinc-600"
      />

      <div className="mt-6 grid gap-5 lg:grid-cols-12">
        {/* (2) Credit counter + stuck jobs */}
        <div className="min-w-0 rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-5">
          <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-600">
            <TrendingUp className="size-4 text-emerald-600" aria-hidden />
            <Term k="ITB_CREDIT">{cd("fund.counter.label")}</Term>
          </div>
          <div
            className="mt-2 inline-block min-w-[12ch] text-[34px] leading-none sm:text-[44px] font-semibold tracking-tight text-zinc-900 tabular-nums"
            title={cd("fund.counter.tip", {
              after: fmtMoney(after.credit_total_cad),
              before: fmtMoney(before.credit_total_cad),
              added: fmtMoney(result.credit_added),
            })}
            data-fund-counter
          >
            {m(credit)}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-500 tabular-nums">
            <span title={fmtMoney(before.credit_total_cad)}>{cd("fund.counter.was", { credit: m(before.credit_total_cad) })}</span>
            <span
              className={cn(
                "inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-semibold text-emerald-800 transition-opacity duration-500",
                armed ? "opacity-100" : "opacity-0",
              )}
              style={{ transitionDelay: play ? `${MOMENT.count - 200}ms` : "0ms" }}
              title={fmtMoney(result.credit_added)}
            >
              +{m(result.credit_added)}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4 text-[15px] text-zinc-700 tabular-nums">
            <div data-fund-stuck>
              <Rich text={cd("fund.stuck", { before: `**${before.blocked}**`, after: `**${after.blocked}**` })} />
            </div>
            <div>
              <Rich text={cd("fund.matched", { before: `**${before.assigned}**`, after: `**${after.assigned}**` })} />
            </div>
          </div>
          {result.still_blocked.length > 0 ? (
            <p className="mt-2 flex items-start gap-1.5 text-sm leading-snug text-amber-900" data-still-stuck>
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
              <span>
                <Rich text={cd("fund.stillStuck", { job: result.still_blocked.join(", ") })} />
              </span>
            </p>
          ) : null}
        </div>

        {/* (3) Before/after bar, honest 0–100% of what's owed (§7.2) */}
        <div className="flex min-w-0 flex-col justify-center gap-5 rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-7">
          <div>
            <p className="mb-2 text-lg text-zinc-700 tabular-nums">
              <Rich
                text={cd("fund.bar", {
                  before: fmtPct(before.obligation_met_pct),
                  after: fmtPct(after.obligation_met_pct),
                })}
              />
            </p>
            <BeforeAfterBar
              before={before.obligation_met_pct}
              after={armed ? after.obligation_met_pct : before.obligation_met_pct}
              animate={play}
              height={32}
              beforeLabel={cd("fund.bar.before", { credit: m(before.credit_total_cad), pct: fmtPct(before.obligation_met_pct) })}
              afterLabel={cd("fund.bar.after", { credit: m(after.credit_total_cad), pct: fmtPct(after.obligation_met_pct) })}
              delta={cd("fund.bar.delta", { delta: m(result.credit_added) })}
              ariaLabel={`${fmtPct(before.obligation_met_pct)} to ${fmtPct(after.obligation_met_pct)} of what Northgate owes, on a 0 to 100% scale`}
            />
          </div>
          <div>
            <p className="mb-1.5 text-sm text-zinc-700 tabular-nums" data-fund-smb>
              <span title={`${m(before.smb_achieved_cad)} → ${m(after.smb_achieved_cad)} of small-business work`}>
                {cd("fund.smb", { before: fmtPct(before.smb_progress_pct, 0), after: fmtPct(after.smb_progress_pct, 0) })}
              </span>
            </p>
            <BeforeAfterBar
              before={before.smb_progress_pct}
              after={armed ? after.smb_progress_pct : before.smb_progress_pct}
              animate={play}
              height={10}
              ariaLabel={`Small-business target: ${fmtPct(before.smb_progress_pct, 0)} to ${fmtPct(after.smb_progress_pct, 0)}`}
            />
          </div>
        </div>
      </div>

      {/* (4) Unstuck jobs flip */}
      {k > 0 && (
        <div className="mt-6">
          <div className="mb-2.5 text-sm font-medium text-zinc-700">
            {cd("fund.goAhead", { k, s: k === 1 ? "" : "s" })}
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

      {/* (5) Breakdown: collapsed in Story mode */}
      <Details summary={cd("fund.breakdown")} className="mt-4 -ml-1" contentClassName="max-w-xl pl-1">
        <div className="flex h-3 overflow-hidden rounded-full bg-zinc-100">
          <div className="bg-sky-500" style={{ width: `${trainingShare * 100}%` }} />
          <div className="bg-emerald-500" style={{ width: `${(1 - trainingShare) * 100}%` }} />
        </div>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-start justify-between gap-3">
            <dt className="flex items-start gap-2 text-zinc-600">
              <span className="mt-1.5 size-2.5 shrink-0 rounded-sm bg-sky-500" aria-hidden />
              <span>
                {cd("fund.breakdown.training")}
                <span className="block text-[13px] text-zinc-500">{cd("fund.breakdown.training.sub", { m: pkg.multiplier })}</span>
              </span>
            </dt>
            <dd className="font-semibold text-zinc-900 tabular-nums" title={fmtMoney(br.training_cad)}>
              {m(br.training_cad)}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="flex items-start gap-2 text-zinc-600">
              <span className="mt-1.5 size-2.5 shrink-0 rounded-sm bg-emerald-500" aria-hidden />
              <span>
                {cd("fund.breakdown.jobs")}
                <span className="block text-[13px] text-zinc-500">{cd("fund.breakdown.jobs.sub")}</span>
              </span>
            </dt>
            <dd className="font-semibold text-zinc-900 tabular-nums" title={fmtMoney(br.jobs_cad)}>
              {m(br.jobs_cad)}
            </dd>
          </div>
        </dl>
      </Details>
    </section>
  );
}
