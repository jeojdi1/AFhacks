"use client";

import { Check, Info } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Assignment, BlockedJob } from "@/lib/api/types";
import { fmtKm, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const BREAKDOWN: { key: keyof Assignment["score_breakdown"]; label: string; hint: string }[] = [
  { key: "fit", label: "Capability fit", hint: "processes, material, tolerance" },
  { key: "distance", label: "Distance", hint: "closer to the site scores higher" },
  { key: "lead_time", label: "Lead time", hint: "shorter lead time scores higher" },
  { key: "itb_value", label: "ITB value", hint: "SMEs earn 2x direct credit" },
];

const FILTER_LABEL: Record<string, string> = {
  process: "lack the process",
  envelope: "part too large",
  certs: "missing required certification",
  controlled_cgp: "not CGP-registered",
  cpcsc: "no CPCSC Level 1",
  capacity: "at capacity",
};

export function MiniBar({
  value,
  className,
  tone = "slate",
}: {
  value: number;
  className?: string;
  tone?: "slate" | "emerald" | "amber";
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div
        className={cn(
          "h-full rounded-full",
          tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-slate-700",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const triggerClass = cn(
  buttonVariants({ variant: "outline", size: "sm" }),
  "h-7 gap-1 px-2 text-[13px]",
);

export function WhyPopover({ assignment }: { assignment: Assignment }) {
  const a = assignment;
  return (
    <Popover>
      <PopoverTrigger className={triggerClass} aria-label={`Why ${a.shop_name}?`}>
        <Info className="size-3.5" /> Why?
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-80 gap-3 p-4">
        <PopoverHeader>
          <PopoverTitle className="text-sm">
            Why {a.shop_name} for {a.part_no}
          </PopoverTitle>
          <PopoverDescription className="text-xs">
            Passed every hard filter; highest score after capacity limits.
          </PopoverDescription>
        </PopoverHeader>
        <ul className="flex flex-col gap-1.5">
          {a.reasons.slice(0, 3).map((r) => (
            <li key={r} className="flex items-start gap-2 text-sm text-slate-800">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">Score</span>
            <span className="text-lg font-semibold tabular-nums text-slate-900">
              {Math.round(a.score * 100)}
              <span className="text-xs font-normal text-slate-500"> / 100</span>
            </span>
          </div>
          {BREAKDOWN.map((b) => {
            const v = a.score_breakdown?.[b.key] ?? 0;
            return (
              <div key={b.key} className="grid grid-cols-[96px_1fr_28px] items-center gap-2" title={b.hint}>
                <span className="text-xs text-slate-600">{b.label}</span>
                <MiniBar value={v} tone="emerald" />
                <span className="text-right text-xs tabular-nums text-slate-700">{Math.round(v * 100)}</span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
          <span>{fmtKm(a.distance_km)} from site</span>
          <span>{a.hours_week} h/week</span>
          <span>
            {fmtMoney(a.value_cad)} × {Math.round(a.ccv_pct * 100)}% CCV × {a.multiplier}x ={" "}
            <span className="font-medium text-slate-700">{fmtMoney(a.credit_cad)}</span>
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function BlockedWhyPopover({ blocked }: { blocked: BlockedJob }) {
  const b = blocked;
  const entries = Object.entries(b.failing_filters ?? {}).filter(([, n]) => n > 0);
  return (
    <Popover>
      <PopoverTrigger className={triggerClass} aria-label={`Why is ${b.part_no} blocked?`}>
        <Info className="size-3.5" /> Why?
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-80 gap-3 p-4">
        <PopoverHeader>
          <PopoverTitle className="text-sm">Why {b.part_no} is blocked</PopoverTitle>
          <PopoverDescription className="text-xs text-slate-700">{b.reason}</PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
          <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
            Shops failing each filter
          </span>
          {entries.map(([k, n]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{FILTER_LABEL[k] ?? k}</span>
              <span className="font-medium tabular-nums text-slate-900">{n}</span>
            </div>
          ))}
          <div className="mt-1 text-xs text-slate-500">
            {b.eligible_shop_count} shop{b.eligible_shop_count === 1 ? "" : "s"} pass every filter except
            capacity.
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
