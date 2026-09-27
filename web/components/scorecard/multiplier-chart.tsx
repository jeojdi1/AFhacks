"use client";

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

  return (
    <Card className="gap-5 px-6 py-6 [--card-spacing:--spacing(6)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h3 className="text-lg font-semibold text-slate-900">Credit by multiplier</h3>
          <p className="text-sm text-slate-500">
            Each solid bar is ITB credit earned; the pale bar behind it is the work value it came from.
            Routing jobs to small Canadian shops doubles the credit.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-4 rounded-sm" style={{ backgroundColor: SC.textSecondary }} aria-hidden />
              ITB credit (solid)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-4 rounded-sm" style={{ backgroundColor: SC.inkSoft }} aria-hidden />
              Work value (pale)
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

      <div className="w-full" style={{ height: rows.length * ROW_H + 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 8, right: RIGHT_W, bottom: 8, left: 0 }}
            barSize={24}
            accessibilityLayer
          >
            <XAxis type="number" hide domain={[0, maxV]} />
            <YAxis
              type="category"
              dataKey="category"
              width={AXIS_W}
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
                const pillFill = empty ? "#94A3B8" : row.category === "regular" ? "#64748B" : categoryColors(row.category).solid;
                return (
                  <g transform={`translate(${x},${y})`} opacity={empty ? 0.55 : 1}>
                    <text x={-58} y={-3} textAnchor="end" fontSize={15} fontWeight={600} fill={SC.textPrimary}>
                      {row.label}
                    </text>
                    <text x={-58} y={16} textAnchor="end" fontSize={13} fill={SC.textMuted}>
                      {funded ? "✓ Funded · " : ""}
                      {unitLabel(row)}
                    </text>
                    <rect x={-50} y={-12} width={38} height={24} rx={12} fill={pillFill} />
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
                const { solid, soft } = categoryColors(row.category);
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
                          role="link"
                          tabIndex={0}
                          onClick={goToGaps}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") goToGaps();
                          }}
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
                return (
                  <g>
                    <path d={barPath(x, y, ghostW, h)} fill={soft} />
                    <path d={barPath(x, y, w, h)} fill={solid} />
                    {isSme && w > 64 ? (
                      <text x={x + w - 10} y={midY + 5} textAnchor="end" fontSize={14} fontWeight={700} fill="#fff">
                        2x
                      </text>
                    ) : null}
                    <text x={tipX} y={midY - 3} fontSize={16} fontWeight={600} fill={SC.textPrimary}>
                      {fmtMoney(row.credit_cad, { compact: true })} credit
                    </text>
                    <text x={tipX} y={midY + 15} fontSize={13} fill={SC.textMuted}>
                      from {fmtMoney(row.value_cad, { compact: true })} of {isTraining(row) ? "training" : "work"}
                    </text>
                  </g>
                );
              }}
            />
          </BarChart>
        </ResponsiveContainer>
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
