"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";

import type { LedgerResponse } from "@/lib/api/types";
import { Card } from "@/components/ui/card";
import { fmtMoney, fmtPct } from "@/lib/format";

import { categoryColors, SC } from "./tokens";

type Row = LedgerResponse["multiplier_breakdown"][number];

const ROW_H = 76;
const AXIS_W = 340;
const RIGHT_W = 210;
/** Below this container width the label column cannot fit beside the bars: stack instead. */
const STACK_BELOW = 640;
/** Work-value outline (dashed) drawn on top of the credit bar so it is never hidden. */
const VALUE_STROKE_ON_BAR = "#FFFFFF";
const VALUE_STROKE = "#334155"; // slate-700

/** Width of an element, tracked with ResizeObserver (0 before the first measure). */
function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function pillFill(row: Row): string {
  const empty = row.credit_cad <= 0;
  if (empty || row.category === "regular") return "#64748B"; // slate-500: white text 4.76:1
  return categoryColors(row.category).solid;
}

/** Second line to the right of a bar. Training rows spell out the multiplier so a thin bar still reads. */
function subLabel(row: Row): string {
  if (isTraining(row)) {
    return `${fmtMoney(row.value_cad, { compact: true })} training → ${fmtMoney(row.credit_cad, { compact: true })} (${row.multiplier}x)`;
  }
  return `from ${fmtMoney(row.value_cad, { compact: true })} of work`;
}

/** Rectangle with a 4px rounded data-end and a square baseline (horizontal bars). */
function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (w <= 0 || h <= 0) return "";
  const rr = Math.min(r, w, h / 2);
  return [
    `M${x},${y}`,
    `H${x + w - rr}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `V${y + h - rr}`,
    `Q${x + w},${y + h} ${x + w - rr},${y + h}`,
    `H${x}`,
    "Z",
  ].join(" ");
}

function unitLabel(row: Row): string {
  const n = row.count;
  if (row.category === "training" || row.category === "indigenous_training") {
    return `${n} training ${n === 1 ? "package" : "packages"}`;
  }
  return `${n} ${n === 1 ? "job" : "jobs"}`;
}

export function MultiplierChart({
  ledger,
  fundedCategories,
}: {
  ledger: LedgerResponse;
  /** Credit categories that just gained credit from a funded package (highlighted). */
  fundedCategories?: Set<string>;
}) {
  const router = useRouter();
  const rows = ledger.multiplier_breakdown;
  const byCategory = new Map<string, Row>(rows.map((r) => [r.category, r]));
  const maxV = Math.max(1, ...rows.map((r) => Math.max(r.value_cad, r.credit_cad)));
  const total = ledger.credit_total_cad || 1;
  const sme = byCategory.get("sme_direct");
  const smeShare = sme ? sme.credit_cad / total : 0;

  const goToGaps = () => router.push("/gaps");
  const [boxRef, boxW] = useWidth<HTMLDivElement>();
  const axisW = boxW > 0 ? Math.min(AXIS_W, Math.round(boxW * 0.35)) : AXIS_W;
  const rightW = boxW > 0 ? Math.min(RIGHT_W, Math.round(boxW * 0.25)) : RIGHT_W;

  return (
    <Card className="gap-5 px-6 py-6 [--card-spacing:--spacing(6)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-slate-900">Credit by multiplier</h2>
          <p className="text-sm text-slate-600">
            Each solid bar is ITB credit earned; the dashed outline is the work value it came from. Routing jobs
            to small Canadian shops doubles the credit.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600" data-testid="multiplier-legend">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex gap-0.5" aria-hidden>
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: categoryColors("regular").solid }} />
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: categoryColors("sme_direct").solid }} />
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: categoryColors("training").solid }} />
              </span>
              ITB credit (solid, coloured by multiplier)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-4 rounded-sm border-[1.5px] border-dashed"
                style={{ borderColor: VALUE_STROKE }}
                aria-hidden
              />
              Work value (dashed outline)
            </span>
          </div>
        </div>
        {sme && sme.credit_cad > 0 ? (
          <div className="rounded-xl border border-[#B42318]/20 bg-[#B42318]/[0.04] px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">SME direct work · 2x</div>
            <div className="mt-0.5 text-3xl font-semibold tracking-tight text-slate-900">{fmtPct(smeShare, 0)}</div>
            <div className="text-sm text-slate-600">of all credit earned</div>
          </div>
        ) : null}
      </div>

      {/* Screen readers get the numbers as a list; the SVG below is decorative. */}
      <ul className="sr-only" aria-label="Credit by multiplier">
        {rows.map((row) => (
          <li key={row.category}>
            {row.label}, {row.multiplier}x: {fmtMoney(row.credit_cad)} credit from {fmtMoney(row.value_cad)} of{" "}
            {isTraining(row) ? "training" : "work"}, {unitLabel(row)}.
            {row.credit_cad <= 0 ? (
              <>
                {" "}
                <Link href="/gaps">Unlock via training</Link>
              </>
            ) : null}
          </li>
        ))}
      </ul>

      <div ref={boxRef} className="w-full min-w-0">
        {boxW > 0 && boxW < STACK_BELOW ? (
          <StackedRows rows={rows} maxV={maxV} fundedCategories={fundedCategories} />
        ) : (
      <div className="w-full" style={{ height: rows.length * ROW_H + 16 }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: rightW, bottom: 8, left: 0 }}
            barSize={24}
            accessibilityLayer={false}
          >
            <XAxis type="number" hide domain={[0, maxV]} />
            <YAxis
              type="category"
              dataKey="category"
              width={axisW}
              interval={0}
              tickLine={false}
              axisLine={{ stroke: "#CBD5E1" }}
              tick={(props: { x?: number | string; y?: number | string; payload?: { value?: string } }) => {
                const row = byCategory.get(String(props.payload?.value ?? ""));
                if (!row) return <g />;
                const x = Number(props.x ?? 0);
                const y = Number(props.y ?? 0);
                const empty = row.credit_cad <= 0;
                const funded = fundedCategories?.has(row.category) && !empty;
                // Dim empty rows with a lighter (still 4.5:1+) text colour, not opacity.
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text x={-58} y={-3} textAnchor="end" fontSize={15} fontWeight={600} fill={empty ? SC.textSecondary : SC.textPrimary}>
                      {row.label}
                    </text>
                    <text x={-58} y={16} textAnchor="end" fontSize={13} fill={SC.textMuted}>
                      {funded ? "✓ Funded · " : ""}
                      {unitLabel(row)}
                    </text>
                    <rect x={-50} y={-12} width={38} height={24} rx={12} fill={pillFill(row)} />
                    <text x={-31} y={5} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff">
                      {row.multiplier}x
                    </text>
                  </g>
                );
              }}
            />
            <Tooltip
              cursor={{ fill: "rgba(15,23,42,0.04)" }}
              content={({ active, payload }) => {
                const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
                if (!row) return null;
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
                    <div className="font-semibold text-slate-900">
                      {row.label} · {row.multiplier}x
                    </div>
                    <div className="mt-1 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
                      <span className="text-slate-500">Work value</span>
                      <span className="text-right text-slate-900">{fmtMoney(row.value_cad)}</span>
                      <span className="text-slate-500">ITB credit</span>
                      <span className="text-right font-medium text-slate-900">{fmtMoney(row.credit_cad)}</span>
                      <span className="text-slate-500">Count</span>
                      <span className="text-right text-slate-900">{unitLabel(row)}</span>
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="credit_cad"
              minPointSize={(v) => (v && v > 0 ? 6 : 0)}
              animationDuration={700}
              shape={(props: BarShapeProps) => {
                const row = props.payload as Row | undefined;
                const x = props.x ?? 0;
                const y = props.y ?? 0;
                const w = Math.max(0, props.width ?? 0);
                const h = props.height ?? 0;
                if (!row) return <g />;
                const { solid } = categoryColors(row.category);
                const midY = y + h / 2;

                if (row.credit_cad <= 0) {
                  const bg = props.background;
                  const trackW = Math.max(0, bg?.width ?? 0);
                  return (
                    <g>
                      <rect x={x} y={y} width={trackW} height={h} rx={4} fill={SC.track} />
                      <text x={x + 14} y={midY + 5} fontSize={14} fill={SC.textMuted}>
                        No credit yet ·{" "}
                        <tspan
                          fill={SC.accent}
                          fontWeight={600}
                          style={{ cursor: "pointer" }}
                          onClick={goToGaps}
                        >
                          unlock via training →
                        </tspan>
                      </text>
                    </g>
                  );
                }

                const ghostW = row.credit_cad > 0 ? (w * row.value_cad) / row.credit_cad : 0;
                const tipX = x + Math.max(w, ghostW) + 12;
                const isSme = row.category === "sme_direct";
                // The value outline sits inside the credit bar when the multiplier lifts credit above value.
                const inside = ghostW <= w;
                return (
                  <g>
                    <path d={barPath(x, y, w, h)} fill={solid} />
                    {ghostW > 0 ? (
                      <path
                        d={barPath(x + 0.75, y + 0.75, Math.max(0, ghostW - 1.5), h - 1.5)}
                        fill="none"
                        stroke={inside ? VALUE_STROKE_ON_BAR : VALUE_STROKE}
                        strokeWidth={1.5}
                        strokeDasharray="5 3"
                        data-series="value"
                      />
                    ) : null}
                    {isSme && w > 64 ? (
                      <text x={x + w - 10} y={midY + 5} textAnchor="end" fontSize={14} fontWeight={700} fill="#fff">
                        2x
                      </text>
                    ) : null}
                    <text x={tipX} y={midY - 3} fontSize={16} fontWeight={600} fill={SC.textPrimary}>
                      {fmtMoney(row.credit_cad, { compact: true })} credit
                    </text>
                    <text x={tipX} y={midY + 15} fontSize={13} fill={SC.textMuted}>
                      {subLabel(row)}
                    </text>
                  </g>
                );
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Credit = value × Canadian content (CCV) × multiplier. Multipliers: regular 1x, SME direct 2x, skills and
        training 5x, Indigenous workforce development 10x.
      </p>
    </Card>
  );
}

function isTraining(row: Row): boolean {
  return row.category === "training" || row.category === "indigenous_training";
}

/** Narrow screens: label above each bar, plain HTML so nothing is clipped. */
function StackedRows({
  rows,
  maxV,
  fundedCategories,
}: {
  rows: Row[];
  maxV: number;
  fundedCategories?: Set<string>;
}) {
  return (
    <ul className="flex flex-col gap-4" aria-hidden data-testid="multiplier-stacked">
      {rows.map((row) => {
        const empty = row.credit_cad <= 0;
        const funded = fundedCategories?.has(row.category) && !empty;
        const creditPct = Math.max(empty ? 0 : 1.5, (row.credit_cad / maxV) * 100);
        const valuePct = empty ? 0 : (row.value_cad / maxV) * 100;
        return (
          <li key={row.category} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-5 items-center rounded-full px-2 text-xs font-bold text-white"
                style={{ backgroundColor: pillFill(row) }}
              >
                {row.multiplier}x
              </span>
              <span className={empty ? "text-sm font-semibold text-slate-600" : "text-sm font-semibold text-slate-900"}>
                {row.label}
              </span>
              <span className="ml-auto text-sm font-semibold tabular-nums text-slate-900">
                {empty ? "—" : fmtMoney(row.credit_cad, { compact: true })}
              </span>
            </div>
            <div className="relative h-4 rounded bg-slate-100">
              {!empty ? (
                <div
                  className="absolute inset-y-0 left-0 rounded"
                  style={{ width: `${creditPct}%`, backgroundColor: categoryColors(row.category).solid }}
                />
              ) : null}
              {valuePct > 0 ? (
                <div
                  className="absolute inset-y-0 left-0 rounded border-[1.5px] border-dashed"
                  style={{
                    width: `${valuePct}%`,
                    borderColor: valuePct <= creditPct ? VALUE_STROKE_ON_BAR : VALUE_STROKE,
                  }}
                />
              ) : null}
            </div>
            <div className="text-xs text-slate-600">
              {funded ? "✓ Funded · " : ""}
              {empty ? "No credit yet · unlock via training" : subLabel(row)} · {unitLabel(row)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
