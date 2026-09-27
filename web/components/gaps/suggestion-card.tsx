"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck, GraduationCap, LoaderCircle, MapPin, Users, Wrench } from "lucide-react";
import { cn } from "cn";

import type { TrainingPackage } from "@/lib/api/types";
import { CATEGORY_LABEL, fmtMoney, label } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { AssumptionTag } from "@/components/muster/assumption-tag";
import { StatusBadge } from "@/components/muster/status-badge";
import { BRAND_BUTTON, capacityUnlockText, gapTitle, multiplierLabel, requirementLabel } from "./labels";

export interface SuggestionCardProps {
  pkg: TrainingPackage;
  funded: boolean;
  pending: boolean;
  disabled: boolean;
  error?: string | null;
  onFund: (pkg: TrainingPackage) => void;
}

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{l}</div>
      <div className="mt-1 text-[15px] leading-snug text-zinc-900">{children}</div>
    </div>
  );
}

export function SuggestionCard({ pkg, funded, pending, disabled, error, onFund }: SuggestionCardProps) {
  const n = pkg.blocked_job_ids.length;
  const capText = capacityUnlockText(pkg.capacity_unlock as Record<string, number> | null);
  const isIndigenous = pkg.multiplier >= 10;

  return (
    <article
      id={pkg.id}
      className={cn(
        "scroll-mt-24 overflow-hidden rounded-xl border bg-white transition-colors duration-500",
        funded ? "border-emerald-300" : "border-zinc-200",
      )}
    >
      {/* Header: title + multiplier */}
      <div className="flex items-start justify-between gap-4 p-5 pb-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] font-medium text-zinc-500">{pkg.id}</span>
            <StatusBadge kind={funded ? "funded" : "suggested"} />
          </div>
          <h3 className="text-lg leading-snug font-semibold text-zinc-900">{pkg.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600">
            <Link
              href={`/shops/${pkg.shop_id}`}
              className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
            >
              {pkg.shop_name}
            </Link>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 text-zinc-400" />
              {pkg.shop_city}
            </span>
            <StatusBadge kind={pkg.shop_source === "public" ? "public" : "synthetic"} />
          </div>
        </div>
        <div
          className={cn(
            "flex shrink-0 flex-col items-center rounded-xl px-4 py-2.5 text-center",
            isIndigenous ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-900",
          )}
        >
          <span className="text-4xl leading-none font-bold tracking-tight tabular-nums">{pkg.multiplier}x</span>
          <span className={cn("mt-1 max-w-[9rem] text-[11px] leading-tight", isIndigenous ? "text-zinc-200" : "text-zinc-600")}>
            {multiplierLabel(pkg.multiplier)}
          </span>
        </div>
      </div>

      {/* Gap */}
      <div className="mx-5 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <Wrench className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="text-sm leading-snug">
          <div className="font-semibold text-amber-950">{gapTitle(pkg.gap)}</div>
          <div className="text-amber-900/80">{pkg.gap.detail}</div>
        </div>
      </div>

      {/* Categories */}
      <div className="flex flex-wrap items-center gap-1.5 px-5 pt-4">
        <span className="mr-1 text-xs font-medium tracking-wide text-zinc-500 uppercase">ITB category</span>
        {pkg.categories.map((c) => (
          <span
            key={c}
            className={cn(
              "inline-flex h-6 items-center rounded-md border px-2 text-[13px]",
              c === pkg.category
                ? "border-zinc-300 bg-zinc-100 font-medium text-zinc-900"
                : "border-zinc-200 bg-white text-zinc-700",
            )}
          >
            {label(CATEGORY_LABEL, c)}
          </span>
        ))}
      </div>

      {/* Facts grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 pt-4 sm:grid-cols-3">
        <Field label="Training partner">
          <span className="inline-flex items-start gap-1.5">
            <GraduationCap className="mt-0.5 size-4 shrink-0 text-zinc-400" />
            {pkg.recipient_example}
          </span>
        </Field>
        <Field label="Trainees">
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Users className="size-4 text-zinc-400" />
            {pkg.trainees} workers
          </span>
        </Field>
        <Field label="Unlocks">
          <span className="leading-snug">
            {pkg.cert_unlock ? <span className="block">{requirementLabel(pkg.cert_unlock)} certification</span> : null}
            {capText ? <span className="block text-zinc-700">{capText}</span> : null}
            {!pkg.cert_unlock && !capText ? "—" : null}
          </span>
        </Field>
      </div>

      {/* Money row */}
      <div className="mt-5 grid grid-cols-3 divide-x divide-zinc-200 border-y border-zinc-200 bg-zinc-50/70">
        <div className="px-5 py-3.5">
          <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-zinc-500 uppercase">
            Est. cost <AssumptionTag />
          </div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900 tabular-nums" title={fmtMoney(pkg.est_cost_cad)}>
            {fmtMoney(pkg.est_cost_cad, { compact: true })}
          </div>
        </div>
        <div className="px-5 py-3.5">
          <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
            Training credit ({pkg.multiplier}x)
          </div>
          <div className="mt-1 text-2xl font-semibold text-emerald-700 tabular-nums" title={fmtMoney(pkg.est_credit_cad)}>
            {fmtMoney(pkg.est_credit_cad, { compact: true })}
          </div>
        </div>
        <div className="px-5 py-3.5">
          <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Unblocks</div>
          <div className="mt-1 text-[15px] leading-snug text-zinc-900">
            <span className="text-2xl font-semibold tabular-nums">{n}</span> job{n === 1 ? "" : "s"} worth{" "}
            <span className="font-semibold tabular-nums" title={fmtMoney(pkg.unblocks_value_cad)}>
              {fmtMoney(pkg.unblocks_value_cad, { compact: true })}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        {funded ? (
          <>
            <span
              aria-disabled
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 text-[15px] font-semibold text-emerald-800"
            >
              <CircleCheck className="size-5 text-emerald-600" />
              Funded
            </span>
            <Link
              href={`/shops/${pkg.shop_id}`}
              className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4 text-[15px]")}
            >
              See it from the shop&apos;s side
              <ArrowRight />
            </Link>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onFund(pkg)}
            disabled={disabled || pending}
            className={cn(
              buttonVariants(),
              BRAND_BUTTON,
              "h-10 gap-2 px-5 text-[15px] font-semibold disabled:opacity-60",
            )}
          >
            {pending ? <LoaderCircle className="animate-spin" /> : <GraduationCap />}
            {pending ? "Funding…" : "Fund training"}
          </button>
        )}
        {!funded && (
          <span className="text-sm text-zinc-600">
            Earns <span className="font-semibold text-zinc-900">{fmtMoney(pkg.est_credit_cad, { compact: true })}</span>{" "}
            credit and unblocks {n} job{n === 1 ? "" : "s"}
          </span>
        )}
        {error ? <span className="basis-full text-sm text-red-700">{error}</span> : null}
      </div>

      <p className="border-t border-zinc-100 px-5 py-3 text-[13px] leading-snug text-zinc-500">
        <EligibilityNote text={pkg.eligibility_note} />
      </p>
    </article>
  );
}

/** Render a trailing "(assumption)" marker as the shared AssumptionTag pill. */
function EligibilityNote({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  const m = /\s*\(assumption\)\.?\s*$/i.exec(text);
  if (!m) return <>{text}</>;
  const body = text.slice(0, m.index).replace(/[\s.]*$/, "") + ".";
  return (
    <>
      {body} <AssumptionTag className="ml-1 align-middle" note="Eligibility not yet confirmed; to be checked with the ITB authority" />
    </>
  );
}
