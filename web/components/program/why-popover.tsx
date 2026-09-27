"use client";

import { useRef } from "react";
import { Check, Info, Lock } from "lucide-react";

import { StatusBadge } from "@/components/muster/status-badge";
import { Details } from "@/components/muster/details";
import { fmtMoney2 } from "@/components/muster/credit-equation";
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
import { fmtKm, fmtMoney, fmtPct } from "@/lib/format";
import { Rich } from "@/lib/ui/copy";
import { cb } from "@/lib/ui/copy-b";
import { certPlain } from "@/lib/ui/plain";
import { cn } from "@/lib/utils";

import { plainStuckReason, shortShopName, TermText } from "./plain-text";

const MULT_LABEL: Record<number, string> = {
  1: "regular work",
  2: "small business",
  5: "training",
  10: "Indigenous workforce training",
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
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)} aria-hidden>
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

const triggerClass = cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 gap-1 px-2 text-[13px]");

/** Height the Why? popover needs below its row (content + offset). */
const WHY_NEEDS_PX = 460;
/** Sticky app header plus a little air. */
const HEADER_PX = 76;

/**
 * The popover opens below its row so the row's shop cell stays visible. When the
 * row sits too low for that (e.g. 1280x720), scroll it up first; the popover
 * follows and stays on the bottom side.
 */
function makeRoomBelow(trigger: HTMLElement | null) {
  const row = trigger?.closest("tr") ?? trigger;
  if (!row) return;
  const r = row.getBoundingClientRect();
  const short = r.bottom + WHY_NEEDS_PX - window.innerHeight;
  if (short <= 0) return;
  const delta = Math.min(short, r.top - HEADER_PX);
  if (delta > 0) window.scrollBy({ top: delta, behavior: "smooth" });
}

// ---- reasons → plain checks (§5.2) ----

const CERT_TOKEN: Record<string, string> = {
  AS9100: "AS9100",
  "ISO 9001": "ISO9001",
  "CPCSC Level 1": "CPCSC_L1",
  "CWB W47.1": "CWB_W47.1",
  "Nadcap heat treating": "NADCAP:HEAT_TREAT",
  "Nadcap chemical processing": "NADCAP:CHEM_PROCESSING",
  "Nadcap coatings": "NADCAP:COATINGS",
};

function lowerFirst(s: string): string {
  // Keep leading acronyms ("CNC milling") as they are.
  return s.length > 1 && s[1] === s[1].toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/** "5-axis milling + AS9100" → "5-axis milling and aerospace quality certificate (AS9100)". */
function capabilityPhrase(reason: string): string {
  const tokens = reason
    .split("+")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t, i) => {
      const cert = CERT_TOKEN[t];
      const text = cert ? certPlain(cert).first : t;
      return i === 0 ? text : lowerFirst(text);
    });
  if (tokens.length <= 1) return tokens.join("");
  return `${tokens.slice(0, -1).join(", ")} and ${tokens[tokens.length - 1]}`;
}

function plainCheck(reason: string, index: number): string {
  if (/\bCGP\b/.test(reason)) return cb("why.check.cgp");
  if (/^SME\b/.test(reason) || /2x direct credit/i.test(reason)) return cb("why.check.sme");
  if (/\(1x credit\)/.test(reason)) return reason.replace(/\(1x credit\)/, "(counts 1×)");
  if (/km from Northgate/.test(reason)) return reason.replace(/Northgate's London site/, "Northgate's plant in London, ON");
  if (index === 0) return cb("why.check.machines", { capabilities: capabilityPhrase(reason) });
  return reason;
}

export function WhyPopover({ assignment }: { assignment: Assignment }) {
  const a = assignment;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bd = a.score_breakdown;
  const pts = (v: number | undefined) => Math.round((v ?? 0) * 100);
  const multLabel = MULT_LABEL[a.multiplier] ?? "multiplier";
  const exact = `${fmtMoney(a.value_cad)} × ${fmtPct(a.ccv_pct, 0)} × ${a.multiplier} = ${fmtMoney(a.credit_cad)}`;
  return (
    <Popover
      onOpenChange={(open) => {
        if (open) makeRoomBelow(triggerRef.current);
      }}
    >
      <PopoverTrigger ref={triggerRef} className={triggerClass} aria-label={cb("why.aria", { shop: a.shop_name })}>
        <Info className="size-3.5" aria-hidden /> {cb("why.button")}
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] gap-3 p-4">
        <PopoverHeader>
          <PopoverTitle className="text-base">{cb("why.title", { shop: shortShopName(a.shop_name) })}</PopoverTitle>
          <div className="flex flex-wrap items-center gap-1.5" data-testid="why-badges">
            {a.controlled ? <StatusBadge kind="controlled" label={cb("program.badge.controlled")} /> : null}
            <StatusBadge kind={a.shop_source === "public" ? "public" : "synthetic"} />
            {a.controlled ? <StatusBadge kind="cgp" label={cb("plain.CGP.first")} /> : null}
          </div>
          <PopoverDescription className="text-xs text-slate-600">
            {a.part_no} · {a.shop_city ? `${a.shop_city} · ` : ""}
            {cb("why.distance", { km: fmtKm(a.distance_km) })} · {cb("why.hours", { h: a.hours_week })}
          </PopoverDescription>
        </PopoverHeader>

        <ul className="flex flex-col gap-1.5">
          {a.reasons.slice(0, 3).map((r, i) => (
            <li key={r} className="flex items-start gap-2 text-sm text-slate-800">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              <span>{plainCheck(r, i)}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-slate-900 tabular-nums">
              <Rich text={cb("why.match", { score: pts(a.score) }).replace(/(\d+\/100)/, "**$1**")} />
            </span>
          </div>
          <Details summary={cb("why.scoring")}>
            <p className="text-xs text-slate-600 tabular-nums">
              {cb("why.factors", {
                a: pts(bd?.fit),
                b: pts(bd?.distance),
                c: pts(bd?.lead_time),
                d: pts(bd?.itb_value),
              })}
            </p>
          </Details>
        </div>

        <p className="border-t border-slate-100 pt-3 text-sm text-slate-700 tabular-nums" title={exact}>
          <Rich
            text={cb("why.credit", {
              value: fmtMoney2(a.value_cad),
              ccv: fmtPct(a.ccv_pct, 0),
              mult: a.multiplier,
              multLabel,
              credit: fmtMoney2(a.credit_cad),
            })}
          />
        </p>

        {a.controlled ? (
          <p className="flex items-start gap-1.5 text-xs text-slate-600">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-violet-700" aria-hidden />
            <span>{cb("why.controlled")}</span>
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

const FAIL_KEY: Record<string, string> = {
  process: "gaps.why.process",
  envelope: "gaps.why.size",
  certs: "gaps.why.certs",
  capacity: "gaps.why.capacity",
  controlled_cgp: "gaps.why.controlled",
  cpcsc: "why.fail.cpcsc",
};

/** "26 don't do this welding process · 9 can't fit the part size · …" (zero counts omitted). */
export function failingInWords(failing: Record<string, number> | undefined): string[] {
  return Object.entries(failing ?? {})
    .filter(([, n]) => n > 0)
    .map(([k, n]) => (FAIL_KEY[k] ? cb(FAIL_KEY[k], { n }) : `${n} ${k}`));
}

export function BlockedWhyPopover({ blocked }: { blocked: BlockedJob }) {
  const b = blocked;
  const words = failingInWords(b.failing_filters);
  return (
    <Popover>
      <PopoverTrigger className={triggerClass} aria-label={cb("why.blocked.aria", { job: b.job_id })}>
        <Info className="size-3.5" aria-hidden /> {cb("why.button")}
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-80 max-w-[calc(100vw-2rem)] gap-3 p-4">
        <PopoverHeader>
          <PopoverTitle className="text-base">{cb("why.blocked.title", { job: b.job_id })}</PopoverTitle>
          <PopoverDescription className="text-sm text-slate-700" title={b.reason}>
            {cb("program.stuck.reason", { reason: plainStuckReason(b.reason) })}
          </PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
          <span className="text-xs font-medium text-slate-500">{cb("why.blocked.heading")}</span>
          <ul className="flex flex-col gap-1 text-sm text-slate-800">
            {words.map((w) => (
              <li key={w} className="tabular-nums">
                {w}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-slate-500">
            {b.eligible_shop_count === 1
              ? cb("why.blocked.eligible.one")
              : cb("why.blocked.eligible", { n: b.eligible_shop_count })}
          </p>
        </div>
        <p className="text-xs text-slate-500">
          <TermText text={b.description} />
        </p>
      </PopoverContent>
    </Popover>
  );
}
