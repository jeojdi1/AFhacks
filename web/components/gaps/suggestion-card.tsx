"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck, GraduationCap, Hand, Info, LoaderCircle, MapPin, Users, Wrench } from "lucide-react";
import { cn } from "cn";

import type { TrainingPackage } from "@/lib/api/types";
import { CATEGORY_LABEL, fmtMoney, label } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { AssumptionTag } from "@/components/muster/assumption-tag";
import { Details } from "@/components/muster/details";
import { StatusBadge } from "@/components/muster/status-badge";
import { useAppActions } from "@/lib/app/actions-store";
import { isSimulatedEvent } from "@/lib/app/sim-flag";
import { SimulatedChip } from "@/components/mobile/shell/simulation";
import { packageTitle, shortShopName } from "@/lib/app/copy";
import { growHref } from "@/lib/app/readiness";
import { fmtTime } from "@/lib/app/today";
import { cd } from "@/lib/ui/copy-d";
import { useWithParams } from "@/lib/ui/use-with-params";
import { BRAND_BUTTON, capacityUnlockText, isWelderPackage, multiplierLabel, plainEngineText, requirementLabel } from "./labels";
import { hasCopy, sc } from "./story-copy";
import { tradeForPackage, tradeOrGeneric } from "@/lib/trades";

/**
 * Who may fund (QA Q6). "prime": the defence company, or the signed-out demo: the Fund button.
 * "shop": a signed-in shop: "Ask Northgate to fund this" (its own package links to its grow page).
 * "other": college or trainee: a note that only Northgate funds training.
 */
export type FundRole = "prime" | "shop" | "other";

export interface SuggestionCardProps {
  pkg: TrainingPackage;
  funded: boolean;
  pending: boolean;
  disabled: boolean;
  error?: string | null;
  onFund: (pkg: TrainingPackage) => void;
  /** "hero": the fix, full width, Fund button above the fold (§5.4). "option": "Another option". */
  variant?: "hero" | "option";
  /** Credit the unstuck jobs would earn (hero tile 3). Omitted when it can't be derived. */
  jobsCreditCad?: number | null;
  /** Defaults to "prime" (the Fund button). */
  fundRole?: FundRole;
  /** The signed-in shop's id, when fundRole is "shop". */
  shopAccountId?: string | null;
}

const EXAMPLE_SUFFIX = /\s*\(example, not affiliated\)\s*$/i;

/**
 * "Rules behind this" for a package that is not the W47.1 welder package: the eligible training
 * type from its category, in the trade's words ("sponsoring CNC machinist apprentices …").
 */
function rulesBody(pkg: TrainingPackage): string {
  const trade = tradeOrGeneric(pkg);
  const key = `gaps.rules.type.${pkg.category}`;
  const type = hasCopy(key) ? cd(key, { worker: trade.worker, workers: trade.workers }) : label(CATEGORY_LABEL, pkg.category).toLowerCase();
  return cd("gaps.rules.body.type", { type });
}

/** "Conestoga College (example, not affiliated)" → "Conestoga College". */
function partnerName(pkg: TrainingPackage): string {
  return (pkg.recipient_example ?? "").replace(EXAMPLE_SUFFIX, "").trim();
}

/** Phone app (§2.5): the shop asked Northgate to fund this package. Kept on the desktop card. */
function RequestedBadge({ pkg }: { pkg: TrainingPackage }) {
  const { fundingRequests, events } = useAppActions();
  const request = fundingRequests[pkg.id];
  if (!request) return null;
  // Written by the demo simulator: say so (same rule as the activity bell and /m/prime).
  const simulated = events.some((e) => e.kind === "funding_requested" && e.package_id === pkg.id && isSimulatedEvent(e));
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        data-shop-requested
        className="inline-flex h-6 items-center gap-1 rounded-md border border-public/25 bg-public-soft px-2 text-[13px] font-medium whitespace-nowrap text-public"
        title={cd("gaps.hero.requested.tip", { requirement: request.requirement })}
      >
        <Hand className="size-3.5" aria-hidden />
        {cd("gaps.hero.requested", { time: fmtTime(request.at) })}
      </span>
      {simulated ? <SimulatedChip /> : null}
    </span>
  );
}

/** Fund training / Funded. The wrapper id (fund-TP-01) is the NextStep scroll target. */
function FundAction({
  pkg,
  funded,
  pending,
  disabled,
  onFund,
  fundRole = "prime",
  shopAccountId,
  size = "lg",
}: Pick<SuggestionCardProps, "pkg" | "funded" | "pending" | "disabled" | "onFund" | "fundRole" | "shopAccountId"> & {
  size?: "lg" | "md";
}) {
  const wp = useWithParams();
  const h = size === "lg" ? "h-11 px-5 text-base" : "h-10 px-4 text-[15px]";
  if (!funded && fundRole !== "prime") {
    const own = fundRole === "shop" && shopAccountId === pkg.shop_id;
    return (
      <div id={`fund-${pkg.id}`} className="flex scroll-mt-40 flex-wrap items-center gap-3" data-fund-row={pkg.id} data-fund-role={fundRole}>
        {own ? (
          <Link
            href={wp(growHref(pkg.shop_id, pkg.gap.requirement))}
            title={sc("gaps.fund.ask.tip")}
            className={cn(buttonVariants({ variant: "outline" }), h, "gap-2 font-semibold")}
          >
            <Hand aria-hidden />
            {sc("gaps.fund.ask")}
          </Link>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-sm text-zinc-600">
            <Info className="size-4 shrink-0 text-zinc-400" aria-hidden />
            {sc("gaps.fund.primeOnly")}
          </p>
        )}
      </div>
    );
  }
  return (
    <div id={`fund-${pkg.id}`} className="flex scroll-mt-40 flex-wrap items-center gap-3" data-fund-row={pkg.id}>
      {funded ? (
        <>
          <span
            aria-disabled
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 font-semibold text-emerald-800",
              h,
            )}
          >
            <CircleCheck className="size-5 text-emerald-600" aria-hidden />
            {cd("gaps.hero.funded")}
          </span>
          <Link href={wp(`/shops/${pkg.shop_id}`)} className={cn(buttonVariants({ variant: "outline" }), h, "gap-2")}>
            {cd("gaps.hero.seeShop").replace(/\s*→\s*$/, "")}
            <ArrowRight aria-hidden />
          </Link>
        </>
      ) : (
        <button
          type="button"
          onClick={() => onFund(pkg)}
          disabled={disabled || pending}
          className={cn(buttonVariants(), BRAND_BUTTON, h, "gap-2 font-semibold shadow-sm disabled:opacity-60")}
        >
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <GraduationCap aria-hidden />}
          {pending ? cd("gaps.hero.pending") : cd("gaps.fund.button")}
        </button>
      )}
    </div>
  );
}

function EqTile({ title, sub, extra, tone }: { title: string; sub: string; extra?: React.ReactNode; tone: "pay" | "credit" | "unstick" }) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 rounded-lg border px-4 py-3",
        tone === "pay" && "border-zinc-200 bg-zinc-50",
        tone === "credit" && "border-emerald-200 bg-emerald-50/70",
        tone === "unstick" && "border-emerald-200 bg-emerald-50/70",
      )}
      data-eq={tone}
    >
      <div
        className={cn(
          "text-xl leading-tight font-semibold tracking-tight tabular-nums md:text-[22px]",
          tone === "pay" ? "text-zinc-900" : "text-emerald-800",
        )}
      >
        {title}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-snug text-zinc-600 tabular-nums">
        <span>{sub}</span>
        {extra}
      </div>
    </div>
  );
}

function EqArrow() {
  return (
    <div className="flex shrink-0 items-center justify-center text-zinc-400 max-md:rotate-90 max-md:py-0.5" aria-hidden>
      <ArrowRight className="size-5" />
    </div>
  );
}

/** The fix, as a three-step equation, with the Fund button above the fold at 1280×720 (§5.4). */
function HeroCard({ pkg, funded, pending, disabled, error, onFund, jobsCreditCad, fundRole, shopAccountId }: SuggestionCardProps) {
  const wp = useWithParams();
  const k = pkg.blocked_job_ids.length;
  const seats = pkg.trainees;
  const perSeat = seats > 0 ? pkg.est_cost_cad / seats : 0;
  const welder = isWelderPackage(pkg);
  // Every trade: a non-welding package names its own workers ("2 CNC machinist training seats").
  const trade = welder ? null : tradeForPackage(pkg);
  const shopShort = shortShopName(pkg.shop_name);
  const jobsValue = fmtMoney(pkg.unblocks_value_cad, { compact: true });
  const title = welder
    ? cd("gaps.hero.title", { seats, shopShort, town: pkg.shop_city })
    : trade
      ? cd("gaps.hero.title.trade", { seats, worker: trade.worker, shopShort, town: pkg.shop_city })
      : packageTitle(pkg);
  const partner = partnerName(pkg);

  return (
    <article
      id={pkg.id}
      data-variant="hero"
      aria-labelledby={`hero-title-${pkg.id}`}
      className={cn(
        "scroll-mt-40 rounded-xl border bg-card p-5 shadow-xs transition-colors duration-500 md:px-6",
        funded ? "border-emerald-300" : "border-zinc-300",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {cd("gaps.hero.eyebrow", { id: pkg.id })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <RequestedBadge pkg={pkg} />
          <StatusBadge kind={funded ? "funded" : "suggested"} />
        </div>
      </div>

      <h2 id={`hero-title-${pkg.id}`} className="mt-1 text-2xl leading-tight font-semibold tracking-tight text-zinc-900">
        {title}
      </h2>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-snug text-zinc-600">
        {welder || trade ? <span>{packageTitle(pkg)}.</span> : null}
        {welder ? <span>{cd("gaps.hero.sub2")}</span> : null}
        <Link
          href={wp(`/shops/${pkg.shop_id}`)}
          className="inline-flex items-center gap-1 text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
        >
          <MapPin className="size-3.5 text-zinc-400" aria-hidden />
          {pkg.shop_name}
        </Link>
        <StatusBadge kind={pkg.shop_source === "public" ? "public" : "synthetic"} />
      </div>

      {/* Three-step equation: pays → counts as → unsticks */}
      <div className="mt-4 flex flex-col items-stretch gap-2 md:flex-row" data-hero-equation>
        <EqTile
          tone="pay"
          title={cd("gaps.eq.pay", { cost: fmtMoney(pkg.est_cost_cad, { compact: true }) })}
          sub={cd(welder ? "gaps.eq.pay.sub" : "gaps.eq.pay.sub.plain", { seats, perSeat: fmtMoney(perSeat, { compact: true }) })}
          extra={
            <AssumptionTag
              note={cd("gaps.hero.perSeat.tip", { cost: fmtMoney(pkg.est_cost_cad), seats })}
            />
          }
        />
        <EqArrow />
        <EqTile
          tone="credit"
          title={cd("gaps.eq.credit", { credit: fmtMoney(pkg.est_credit_cad, { compact: true }) })}
          sub={pkg.multiplier === 5 ? cd("gaps.eq.credit.sub") : sc("gaps.eq.credit.sub.m", { m: pkg.multiplier })}
        />
        <EqArrow />
        <EqTile
          tone="unstick"
          title={k === 1 ? sc("gaps.eq.unstick.one") : cd("gaps.eq.unstick", { k })}
          sub={
            jobsCreditCad
              ? cd("gaps.eq.unstick.sub", { jobsValue, jobsCredit: fmtMoney(jobsCreditCad, { compact: true }) })
              : `${jobsValue} of work`
          }
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
        <FundAction
          pkg={pkg}
          funded={funded}
          pending={pending}
          disabled={disabled}
          onFund={onFund}
          fundRole={fundRole}
          shopAccountId={shopAccountId}
        />
        <div className="min-w-0 text-sm leading-snug text-zinc-600">
          <p>{cd("gaps.whoPays")}</p>
          {partner ? (
            <p className="mt-0.5 inline-flex items-center gap-1.5">
              <GraduationCap className="size-3.5 shrink-0 text-zinc-400" aria-hidden />
              {cd("gaps.partner", { partner })}
            </p>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}

      <Details summary={cd("gaps.rules.title")} className="mt-2 -ml-1" contentClassName="pl-1 text-sm leading-relaxed text-zinc-600">
        <p>{welder ? cd("gaps.rules.body") : rulesBody(pkg)}</p>
      </Details>
    </article>
  );
}

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{l}</div>
      <div className="mt-1 text-[15px] leading-snug text-zinc-900">{children}</div>
    </div>
  );
}

/** "Another option": the other package, simpler and quieter than the hero. */
function OptionCard({ pkg, funded, pending, disabled, error, onFund, fundRole, shopAccountId }: SuggestionCardProps) {
  const wp = useWithParams();
  const n = pkg.blocked_job_ids.length;
  const capText = capacityUnlockText(pkg.capacity_unlock as Record<string, number> | null);
  const isIndigenous = pkg.multiplier >= 10;

  return (
    <article
      id={pkg.id}
      data-variant="option"
      className={cn(
        "scroll-mt-40 overflow-hidden rounded-xl border bg-white transition-colors duration-500",
        funded ? "border-emerald-300" : "border-zinc-200",
      )}
    >
      <div className="flex items-start justify-between gap-4 p-5 pb-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] font-medium text-zinc-500">{pkg.id}</span>
            <StatusBadge kind={funded ? "funded" : "suggested"} />
            <RequestedBadge pkg={pkg} />
          </div>
          <h3 className="text-lg leading-snug font-semibold text-zinc-900">{packageTitle(pkg)}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600">
            <Link
              href={wp(`/shops/${pkg.shop_id}`)}
              className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
            >
              {pkg.shop_name}
            </Link>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 text-zinc-400" aria-hidden />
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
          <span className="text-3xl leading-none font-bold tracking-tight tabular-nums">{pkg.multiplier}×</span>
          <span className={cn("mt-1 max-w-[9rem] text-[11px] leading-tight", isIndigenous ? "text-zinc-200" : "text-zinc-600")}>
            {multiplierLabel(pkg.multiplier)}
          </span>
        </div>
      </div>

      <div className="mx-5 flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <Wrench className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
        <div className="text-sm leading-snug">
          <div className="font-semibold text-amber-950">{cd("gaps.other.gap")}</div>
          <div className="text-amber-900/80">{plainEngineText(pkg.gap.detail)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 pt-4 sm:grid-cols-3">
        <Field label={cd("gaps.other.partner")}>
          <span className="inline-flex items-start gap-1.5">
            <GraduationCap className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
            {cd("gaps.partner", { partner: partnerName(pkg) })}
          </span>
        </Field>
        <Field label={cd("gaps.other.trainees")}>
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Users className="size-4 text-zinc-400" aria-hidden />
            {cd("gaps.other.trainees.value", { n: pkg.trainees })}
          </span>
        </Field>
        <Field label={cd("gaps.other.type")}>
          <span className="leading-snug">
            {label(CATEGORY_LABEL, pkg.category)}
            {pkg.cert_unlock ? <span className="block text-zinc-700">{requirementLabel(pkg.cert_unlock)}</span> : null}
            {capText ? <span className="block text-zinc-700">{capText}</span> : null}
          </span>
        </Field>
      </div>

      <div className="mt-5 grid grid-cols-3 divide-x divide-zinc-200 border-y border-zinc-200 bg-zinc-50/70">
        <div className="px-5 py-3.5">
          <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-zinc-500 uppercase">
            {cd("gaps.other.pays")} <AssumptionTag />
          </div>
          <div className="mt-1 text-2xl font-semibold text-zinc-900 tabular-nums" title={fmtMoney(pkg.est_cost_cad)}>
            {fmtMoney(pkg.est_cost_cad, { compact: true })}
          </div>
        </div>
        <div className="px-5 py-3.5">
          <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
            {cd("gaps.other.credit", { m: pkg.multiplier })}
          </div>
          <div className="mt-1 text-2xl font-semibold text-emerald-700 tabular-nums" title={fmtMoney(pkg.est_credit_cad)}>
            {fmtMoney(pkg.est_credit_cad, { compact: true })}
          </div>
        </div>
        <div className="px-5 py-3.5">
          <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{cd("gaps.other.unsticks")}</div>
          <div className="mt-1 text-[15px] leading-snug text-zinc-900 tabular-nums" title={fmtMoney(pkg.unblocks_value_cad)}>
            {cd("gaps.other.unsticks.value", {
              k: n,
              s: n === 1 ? "" : "s",
              value: fmtMoney(pkg.unblocks_value_cad, { compact: true }),
            })}
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        <FundAction
          pkg={pkg}
          funded={funded}
          pending={pending}
          disabled={disabled}
          onFund={onFund}
          fundRole={fundRole}
          shopAccountId={shopAccountId}
          size="md"
        />
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      </div>

      {pkg.eligibility_note ? (
        <p className="border-t border-zinc-100 px-5 py-3 text-[13px] leading-snug text-zinc-500">
          <EligibilityNote text={plainEngineText(pkg.eligibility_note)} />
        </p>
      ) : null}
    </article>
  );
}

export function SuggestionCard(props: SuggestionCardProps) {
  return props.variant === "hero" ? <HeroCard {...props} /> : <OptionCard {...props} />;
}

/** Render a trailing "(assumption)" marker as the shared AssumptionTag pill. */
function EligibilityNote({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  const m = /\s*\(assumption\)\.?\s*$/i.exec(text);
  if (!m) return <>{text}</>;
  const body = text.slice(0, m.index).replace(/[\s.]*$/, "") + ".";
  return (
    <>
      {body}{" "}
      <AssumptionTag className="ml-1 align-middle" note="Eligibility not yet confirmed; to be checked with the Defence Investment Agency" />
    </>
  );
}
