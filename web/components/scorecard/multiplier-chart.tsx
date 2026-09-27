"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";

import type { LedgerResponse } from "@/lib/api/types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtPct } from "@/lib/format";
import { cc } from "@/lib/ui/copy-c";
import { useCaptureMode } from "@/lib/ui/story-mode";
import { useWithParams } from "@/lib/ui/use-with-params";

import { sc } from "@/components/gaps/story-copy";

import { categoryColors, SC } from "./tokens";
import { TrainingCapNote } from "./training-cap";

type Row = LedgerResponse["multiplier_breakdown"][number];

/** Entrance animation. Spec: ≤ 400 ms; the bars are at final width well inside 600 ms. */
const GROW_MS = 320;
/** Work-value outline (dashed): white when it sits on top of the credit bar, slate outside it. */
const VALUE_STROKE_ON_BAR = "#FFFFFF";
const VALUE_STROKE = "#334155"; // slate-700
/** Thinnest visible bar, so $480K of training on a $64M scale still shows. */
const MIN_BAR_PX = 6;

const m = (n: number) => fmtMoney(n, { compact: true });

function isTraining(row: Row): boolean {
  return row.category === "training" || row.category === "indigenous_training";
}

function unitLabel(row: Row): string {
  const n = row.count;
  if (isTraining(row)) return cc(n === 1 ? "score.chart.unit.plan" : "score.chart.unit.plans", { n });
  return cc(n === 1 ? "score.chart.unit.job" : "score.chart.unit.jobs", { n });
}

function rowLabel(row: Row): string {
  const key = `score.chart.row.${row.category}`;
  const s = cc(key);
  return s === key ? row.label : s;
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
      mq?.addEventListener?.("change", cb);
      return () => mq?.removeEventListener?.("change", cb);
    },
    () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/**
 * "What each kind of work counts for" (docs/ux-simplification.md §5.3).
 *
 * Plain HTML bars (no chart library), so they are laid out at their final width on the first
 * paint. The bars grow in over ≤ 400 ms; under prefers-reduced-motion or ?capture=1 they
 * render at final width with no animation. Hooks: [data-multiplier-chart], [data-mult-bar].
 */
export function MultiplierChart({
  ledger,
  fundedCategories,
}: {
  ledger: LedgerResponse;
  /** Credit categories that just gained credit from a funded package (marked "✓ Funded"). */
  fundedCategories?: Set<string>;
}) {
  const wp = useWithParams();
  const reduced = useReducedMotion();
  const capture = useCaptureMode();
  const still = reduced || capture;
  const listRef = useRef<HTMLUListElement>(null);

  const rows = ledger.multiplier_breakdown;
  const maxV = Math.max(1, ...rows.map((r) => Math.max(r.value_cad, r.credit_cad)));
  const total = ledger.credit_total_cad || 1;
  const sme = rows.find((r) => r.category === "sme_direct");
  const smeShare = sme ? sme.credit_cad / total : 0;

  // Grow once on mount, before the first paint (layout effect), so there is no full-width flash.
  useLayoutEffect(() => {
    if (still) return;
    const groups = listRef.current?.querySelectorAll<HTMLElement>("[data-bar-group]") ?? [];
    const anims = [...groups].map((g) =>
      g.animate?.([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
        duration: GROW_MS,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      }),
    );
    return () => anims.forEach((a) => a?.cancel());
    // Mount only: later width changes use the CSS width transition below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="gap-5 px-6 py-6 [--card-spacing:--spacing(6)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-slate-900">{cc("score.chart.title")}</h2>
          <p className="text-sm text-slate-600">{cc("score.chart.sub")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600" data-testid="multiplier-legend">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex gap-0.5" aria-hidden>
                {["regular", "sme_direct", "training"].map((k) => (
                  <span key={k} className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: categoryColors(k).solid }} />
                ))}
              </span>
              {cc("score.chart.legend.credit")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-4 rounded-sm border-[1.5px] border-dashed"
                style={{ borderColor: VALUE_STROKE }}
                aria-hidden
              />
              {cc("score.chart.legend.value")}
            </span>
          </div>
        </div>
        {sme && sme.credit_cad > 0 ? (
          <div className="rounded-xl border px-4 py-3" style={{ borderColor: `${SC.accent}33`, backgroundColor: `${SC.accent}0A` }}>
            <div className="text-xs font-medium tracking-wide text-slate-600 uppercase">{cc("score.chart.callout.label")}</div>
            <div className="mt-0.5 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{fmtPct(smeShare, 0)}</div>
            <div className="text-sm text-slate-600">{cc("score.chart.callout.sub")}</div>
          </div>
        ) : null}
      </div>

      {/* Screen readers get the numbers as a list; the bars below are aria-hidden. */}
      <ul className="sr-only" aria-label={cc("score.chart.title")}>
        {rows.map((row) => (
          <li key={row.category}>
            {rowLabel(row)}: {fmtMoney(row.credit_cad)} credit from {fmtMoney(row.value_cad)} of{" "}
            {isTraining(row) ? "training" : "work"}, {unitLabel(row)}.
          </li>
        ))}
      </ul>

      <ul ref={listRef} className="flex flex-col gap-3" data-multiplier-chart data-testid="multiplier-chart">
        {rows.map((row) => {
          const empty = row.credit_cad <= 0;
          const funded = !empty && !!fundedCategories?.has(row.category);
          const { solid } = categoryColors(row.category);
          const creditPct = (row.credit_cad / maxV) * 100;
          const valuePct = empty ? 0 : (row.value_cad / maxV) * 100;
          const outlineOnBar = valuePct <= creditPct;
          return (
            <li
              key={row.category}
              className="grid grid-cols-1 items-center gap-x-5 gap-y-1.5 rounded-lg px-2 py-1.5 hover:bg-slate-50 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]"
              title={
                empty
                  ? undefined
                  : cc("score.chart.tip", {
                      label: rowLabel(row),
                      value: fmtMoney(row.value_cad),
                      credit: fmtMoney(row.credit_cad),
                      unit: unitLabel(row),
                    })
              }
              data-category={row.category}
            >
              {/* Label: swatch + plain name, then the count */}
              <div className="flex min-w-0 items-start gap-2" aria-hidden>
                <span
                  className="mt-1.5 inline-block size-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: empty ? SC.regularSoft : solid }}
                />
                <div className="min-w-0">
                  <div className={cn("text-[15px] leading-snug font-semibold", empty ? "text-slate-600" : "text-slate-900")}>
                    {rowLabel(row)}
                  </div>
                  <div className="text-[13px] text-slate-500">
                    {funded ? <span className="font-medium text-emerald-700">{cc("score.chart.funded")} · </span> : null}
                    {unitLabel(row)}
                  </div>
                </div>
              </div>

              {/* Bar + direct label */}
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
                {empty ? (
                  <div className="col-span-2 flex h-8 items-center rounded-md px-3 text-sm text-slate-600" style={{ backgroundColor: SC.track }}>
                    {cc("score.chart.empty.lead")} ·{" "}
                    {row.category === "indigenous_training" ? (
                      <span className="ml-1">{sc("score.chart.empty.indigenous")}</span>
                    ) : row.category === "training" ? (
                      <Link href={wp("/gaps")} className="ml-1 font-semibold text-slate-900 underline underline-offset-4 hover:text-slate-700">
                        {cc("score.chart.empty.link")}
                      </Link>
                    ) : (
                      <span className="ml-1">{cc("score.chart.empty.link")}</span>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="relative h-8" aria-hidden>
                      <div
                        data-bar-group
                        className="absolute inset-0 origin-left"
                      >
                        <div
                          data-mult-bar
                          data-category={row.category}
                          className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-300 ease-out motion-reduce:transition-none"
                          style={{ width: `${creditPct}%`, minWidth: MIN_BAR_PX, backgroundColor: solid }}
                        />
                        {valuePct > 0 ? (
                          <div
                            data-series="value"
                            className="absolute left-0 rounded-r-[4px] border-[1.5px] border-dashed transition-[width] duration-300 ease-out motion-reduce:transition-none"
                            style={{
                              top: outlineOnBar ? 3 : 0,
                              bottom: outlineOnBar ? 3 : 0,
                              width: outlineOnBar ? `calc(${valuePct}% - 3px)` : `${valuePct}%`,
                              borderColor: outlineOnBar ? VALUE_STROKE_ON_BAR : VALUE_STROKE,
                            }}
                          />
                        ) : null}
                        {row.category === "sme_direct" && creditPct > 18 ? (
                          <span
                            className="absolute inset-y-0 flex items-center pr-2.5 text-sm font-bold text-white"
                            style={{ right: `${100 - creditPct}%` }}
                          >
                            2×
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="min-w-0 leading-tight" aria-hidden>
                      <div className="text-base font-semibold text-slate-900 tabular-nums">
                        {cc("score.chart.bar.credit", { credit: m(row.credit_cad) })}
                      </div>
                      <div className="truncate text-[13px] text-slate-500 tabular-nums">
                        {isTraining(row)
                          ? cc("score.chart.bar.training", { value: m(row.value_cad) })
                          : cc("score.chart.bar.from", { value: m(row.value_cad) })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <TrainingCapNote ledger={ledger} rulesLabel={ledger.rules_label} className="border-t border-slate-100 pt-3" />

      <p className="text-xs text-slate-500">{cc("score.chart.foot")}</p>
    </Card>
  );
}
