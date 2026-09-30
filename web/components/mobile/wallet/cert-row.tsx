"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, ChevronDown, ExternalLink, Lock, Search, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { CERT_LABEL, GLOSSARY, certCountsForMatching, certIsLapsed } from "@/lib/format"
import { certPlain } from "@/lib/ui/plain"
import { tradeForCert } from "@/lib/trades"
import { t } from "@/lib/app/strings"
import { fmtDay, fmtLongDate, toISODate, addDays } from "@/lib/app/today"
import { certShortName, fmtCredit, fmtWork, ruleFor } from "@/lib/app/renewals"
import { growHref } from "@/lib/app/readiness"
import type { CertDeclaration, CertWithDates, Renewal } from "@/lib/app/types"
import { CertStatusChip, DateBasisChip, StageBadge } from "./stage-badge"
import { CountdownBar } from "./countdown-bar"
import { AddExpirySheet } from "./add-expiry-sheet"
import "./wallet-strings"

/**
 * Held for the wallet = a status the rules count (verified / declared / pending_training).
 * A shop-declared expiry date never makes a not-held certificate held: the engine keeps its
 * status, so Today, Grow and the laptop would disagree.
 */
export function certRowHeld(cert: Pick<CertWithDates, "status">): boolean {
  return certCountsForMatching(cert.status)
}

const noopSubscribe = () => () => {}
const serverQuery = () => ""
/** "?mode=…&api=…" from the current URL (only those two), so a link keeps the data source. */
function readCarryQuery(): string {
  try {
    const q = new URLSearchParams(window.location.search)
    const out = new URLSearchParams()
    for (const k of ["mode", "api"]) {
      const v = q.get(k)
      if (v) out.set(k, v)
    }
    const s = out.toString()
    return s ? `?${s}` : ""
  } catch {
    return ""
  }
}

/** DOM id / URL hash for a cert type ("CGP", "NADCAP-HEAT_TREAT"). */
export function certAnchor(certType: string): string {
  return certType.replace(/[^A-Za-z0-9_.-]/g, "-")
}

function daysCaption(r: Renewal): string {
  const n = r.days_left ?? 0
  if (r.stage === "lapsed") return t("wallet.days.lapsed", { count: Math.abs(n) })
  if (n < 0) return t("wallet.days.overdue", { count: Math.abs(n) })
  return t("wallet.days.left", { count: n })
}

const BIG_NUMBER_TONE: Record<Renewal["stage"], string> = {
  ok: "text-foreground",
  window_open: "text-blocked",
  urgent: "text-orange-800",
  lapsed: "text-destructive",
  unknown: "text-muted-foreground",
}

export function CertRow({
  cert,
  renewal,
  today,
  open,
  onToggle,
  routed,
  declare,
  shopId,
  unlocks = false,
}: {
  shopId?: string
  /** Not held, and a Grow (readiness) item exists for it: getting it would open more jobs. */
  unlocks?: boolean
  cert: CertWithDates
  renewal: Renewal
  today: Date
  open: boolean
  onToggle: (open: boolean) => void
  routed: boolean
  declare: (certType: string, expiresAt: string, certNumber?: string) => Promise<CertDeclaration | null>
}) {
  const rule = ruleFor(cert.type)
  const held = certRowHeld(cert)
  // Workers still in training (pending_training): counts for matching, but not held yet. No
  // renewal stage, no expiry date to add, and its jobs are waiting on it, not at risk (C3-11).
  const training = cert.status === "pending_training"
  // Lapsed (status "expired"): held before, ran out. Stage "Lapsed", days since, renewal steps.
  const lapsed = certIsLapsed(cert.status)
  const welding = cert.type.startsWith("CWB")
  // Another trade's operator certificate (IPC): name its workers ("electronics assemblers").
  const trade = welding ? null : tradeForCert(cert.type)
  const tradeVars = trade ? { workers: trade.workers, Workers: trade.workers.replace(/^./, (c) => c.toUpperCase()) } : undefined
  const trainingBodyKey = welding ? "wallet.row.trainingBody" : trade ? "wallet.row.trainingBodyTrade" : "wallet.row.trainingBodyGeneric"
  const startsKey = welding ? "wallet.row.startsWhenQualified" : trade ? "wallet.row.startsWhenTradeQualified" : "wallet.row.startsWhenTrained"
  const carry = React.useSyncExternalStore(noopSubscribe, readCarryQuery, serverQuery)
  const sid = shopId ?? cert.shop_id
  const dated = held && !!renewal.expires_at
  // Plain label first ("Welding certification (CWB W47.1)"); the acronym never stands alone.
  const name = certPlain(cert.type).first || CERT_LABEL[cert.type] || certShortName(cert.type)
  // Plain-language expansion for the acronym owners and judges may not know.
  const gloss = GLOSSARY[cert.type.split(/[_:]/)[0]] ?? null
  const panelId = `cert-panel-${certAnchor(cert.type)}`
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [sheetKey, setSheetKey] = React.useState(0)
  const remindDays = rule.remind_days ?? 60
  const windowOpens = renewal.act_by ? toISODate(addDays(renewal.act_by, -remindDays)) : null
  const declaration = cert.declaration

  const openSheet = () => {
    setSheetKey((k) => k + 1)
    setSheetOpen(true)
  }

  return (
    <li
      id={certAnchor(cert.type)}
      className={cn(
        "scroll-mt-24 rounded-xl border bg-card text-card-foreground",
        renewal.stage === "lapsed" ? "border-destructive/60" : renewal.stage === "urgent" ? "border-orange-300" : "border-border",
        !held && "bg-background"
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(!open)}
        className="flex min-h-16 w-full items-center gap-3 rounded-xl px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-base leading-snug font-semibold break-words">{name}</span>
          {gloss ? <span className="-mt-1 text-sm leading-snug text-muted-foreground">{gloss}</span> : null}
          <span className="flex flex-wrap items-center gap-1.5">
            {training ? null : <StageBadge stage={renewal.stage} held={held || (lapsed && renewal.stage === "lapsed")} />}
            {held && cert.status !== "unknown" ? <CertStatusChip status={cert.status} /> : null}
            {dated ? <DateBasisChip basis={cert.date_basis} /> : null}
            {declaration?.pending ? (
              <span className="inline-flex h-6 items-center rounded-full border border-dashed border-slate-400 px-2 text-xs text-slate-600">
                {t("wallet.row.willSend")}
              </span>
            ) : null}
          </span>
        </span>
        {dated && renewal.days_left !== null ? (
          <span className="flex w-[4.75rem] shrink-0 flex-col items-end text-right">
            <span className={cn("text-3xl leading-none font-bold tabular-nums", BIG_NUMBER_TONE[renewal.stage])}>
              {Math.abs(renewal.days_left)}
            </span>
            <span className="mt-1 text-sm leading-tight text-muted-foreground">{daysCaption(renewal)}</span>
          </span>
        ) : lapsed && renewal.stage === "lapsed" && renewal.days_left !== null ? (
          <span className="flex w-[4.75rem] shrink-0 flex-col items-end text-right" data-testid="cert-lapsed-days">
            <span className={cn("text-3xl leading-none font-bold tabular-nums", BIG_NUMBER_TONE.lapsed)}>
              {Math.abs(renewal.days_left)}
            </span>
            <span className="mt-1 text-sm leading-tight text-muted-foreground">{daysCaption(renewal)}</span>
          </span>
        ) : held && !training ? (
          <span className="w-[4.75rem] shrink-0 text-right text-sm text-muted-foreground">{t("wallet.days.none")}</span>
        ) : null}
        <ChevronDown
          aria-hidden
          className={cn("size-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")}
        />
        <span className="sr-only">{t("wallet.row.expand", { cert: name })}</span>
      </button>

      {open ? (
        <div id={panelId} className="flex flex-col gap-4 border-t border-border px-4 pt-4 pb-4">
          {dated ? (
            <CountdownBar renewal={renewal} remindDays={remindDays} today={today} />
          ) : null}

          {dated ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[15px]">
              <div>
                <dt className="text-sm text-muted-foreground">{t("wallet.row.expires")}</dt>
                <dd className="font-semibold">{fmtLongDate(renewal.expires_at)}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-sm text-muted-foreground">
                  {t("wallet.row.actBy")}
                  {rule.act_by_flag === "assumption" ? (
                    <AssumptionTag note={rule.act_by_note ?? t("wallet.row.actByAssumption")} />
                  ) : null}
                </dt>
                <dd className="font-semibold">{fmtLongDate(renewal.act_by)}</dd>
              </div>
              {windowOpens ? (
                <div className="col-span-2">
                  <dt className="flex items-center gap-1 text-sm text-muted-foreground">
                    {t("wallet.row.windowOpens")}
                    {rule.remind_flag === "assumption" ? <AssumptionTag note={t("wallet.row.remindAssumption")} /> : null}
                  </dt>
                  <dd>{fmtLongDate(windowOpens)}</dd>
                </div>
              ) : null}
              {rule.processing_business_days ? (
                <div className="col-span-2 text-[15px]">{t("wallet.row.processing", { days: rule.processing_business_days })}</div>
              ) : null}
            </dl>
          ) : (
            training ? (
              <p className="text-[15px] text-muted-foreground">{t(trainingBodyKey, tradeVars)}</p>
            ) : lapsed ? (
              <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-red-950" data-testid="cert-lapsed">
                <div className="flex items-center gap-1.5 text-[15px] font-semibold">
                  <TriangleAlert className="size-4 shrink-0" aria-hidden />
                  {renewal.expires_at ? t("wallet.row.lapsedOn", { date: fmtLongDate(renewal.expires_at) }) : t("stage.lapsed")}
                </div>
                <p className="text-[15px]">{t("wallet.row.lapsedBody")}</p>
                {renewal.consequence ? (
                  <p className="text-sm">
                    <span className="font-medium">{t("wallet.row.consequence")}:</span> {renewal.consequence}
                  </p>
                ) : null}
                {unlocks ? (
                  <Link
                    href={`${growHref(sid, cert.type)}${carry}`}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-[15px] font-medium text-brand outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                    data-testid="cert-lapsed-grow"
                  >
                    <span className="min-w-0">{t("wallet.row.lapsedUnlocks")}</span>
                    <ArrowRight className="size-4 shrink-0" aria-hidden />
                  </Link>
                ) : null}
              </div>
            ) : held ? (
              <p className="text-[15px] text-muted-foreground">{t("wallet.row.noDate")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[15px] text-muted-foreground">
                  {t("wallet.notHeldBody")} {unlocks ? null : t("wallet.notHeldNoUnlock")}
                </p>
                {unlocks ? (
                  <Link
                    href={`${growHref(sid)}${carry}`}
                    className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-[15px] font-medium text-brand outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50"
                    data-testid="cert-unlocks-grow"
                  >
                    <span className="min-w-0">{t("wallet.notHeldUnlocks")}</span>
                    <ArrowRight className="size-4 shrink-0" aria-hidden />
                  </Link>
                ) : null}
              </div>
            )
          )}

          {/* Date provenance */}
          {declaration ? (
            <div className="rounded-lg border border-public/30 bg-public-soft px-3 py-2 text-[15px] text-public">
              <div className="font-semibold">{t("wallet.row.declared")}</div>
              <div className="text-sm">
                {t("wallet.row.declaredOn", { date: fmtDay(declaration.declared_at) })}
                {declaration.cert_number ? ` · ${t("wallet.row.certNumber", { number: declaration.cert_number })}` : ""}
              </div>
              {!dated && declaration.expires_at ? (
                <div className="text-sm">{t("wallet.row.declaredExpiry", { date: fmtLongDate(declaration.expires_at) })}</div>
              ) : null}
            </div>
          ) : dated && cert.date_basis === "illustrative" ? (
            <p className="text-sm text-muted-foreground">{t("wallet.row.illustrative")}</p>
          ) : null}

          {/* Jobs waiting on it (workers in training) */}
          {training ? (
            <div className="rounded-lg bg-funded-soft/60 px-3 py-2.5" data-testid="cert-training-jobs">
              <div className="text-[15px] font-semibold">{t("wallet.row.neededFor")}</div>
              {renewal.jobs_at_risk.length ? (
                <p className="mt-0.5 text-base">
                  <span className="font-semibold">{renewal.jobs_at_risk.join(", ")}</span>
                  {" · "}
                  {fmtWork(renewal.value_at_risk_cad)} · {t(startsKey, tradeVars)}
                </p>
              ) : (
                <p className="mt-0.5 text-[15px] text-muted-foreground">
                  {routed ? t("wallet.row.neededForNone") : t("wallet.row.atRiskNotRouted")}
                </p>
              )}
            </div>
          ) : null}

          {/* Work at risk */}
          {held && !training ? (
            <div
              className={cn(
                "rounded-lg px-3 py-2.5",
                renewal.jobs_at_risk.length ? "border border-orange-200 bg-orange-50 text-orange-950" : "bg-muted"
              )}
            >
              <div className="flex items-center gap-1.5 text-[15px] font-semibold">
                {renewal.jobs_at_risk.length ? <TriangleAlert className="size-4 shrink-0" aria-hidden /> : null}
                {t("wallet.row.atRisk")}
              </div>
              {renewal.jobs_at_risk.length ? (
                <p className="mt-0.5 text-base">
                  <span className="font-semibold">{renewal.jobs_at_risk.join(" · ")}</span>
                  {" · "}
                  {fmtWork(renewal.value_at_risk_cad)} work · {fmtCredit(renewal.credit_at_risk_cad)} Northgate credit
                  {cert.type === "CGP" ? (
                    <span className="mt-1 flex items-center gap-1 text-sm">
                      <Lock className="size-3.5" aria-hidden /> Controlled jobs
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="mt-0.5 text-[15px] text-muted-foreground">
                  {routed ? t("wallet.row.atRiskNone") : t("wallet.row.atRiskNotRouted")}
                </p>
              )}
              {renewal.consequence ? (
                <p className="mt-1.5 text-sm">
                  <span className="font-medium">{t("wallet.row.consequence")}:</span> {renewal.consequence}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Official rule + source */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              {t("wallet.row.rule")}
              {rule.flag === "assumption" ? <AssumptionTag note={t("wallet.row.ruleAssumption")} /> : null}
              {rule.flag_note ? <AssumptionTag label="inferred" note={rule.flag_note} /> : null}
            </div>
            <p className="text-base">{renewal.action}</p>
            {rule.source_url ? (
              <a
                href={rule.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 self-start py-2 text-[15px] font-medium text-brand underline underline-offset-4"
              >
                {t("wallet.row.source", { label: rule.source_label })}
                <ExternalLink className="size-4 shrink-0" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <AssumptionTag />
            )}
            {rule.sources.slice(1).map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 self-start py-2 text-sm text-muted-foreground underline underline-offset-4"
              >
                {t("wallet.row.moreSources", { label: s.label })}
                <ExternalLink className="size-3.5 shrink-0" aria-hidden />
              </a>
            ))}
          </div>

          {/* Registry */}
          {renewal.registry_url || rule.registry_url ? (
            <div className="flex flex-col gap-1.5">
              <a
                href={(renewal.registry_url ?? rule.registry_url) as string}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-center text-base leading-snug font-medium hover:bg-muted"
              >
                <Search className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0">{t("wallet.row.registry", { label: rule.registry_label ?? "registry" })}</span>
                <ExternalLink className="size-4 shrink-0" aria-hidden />
              </a>
              <p className="text-sm text-muted-foreground">
                {t("wallet.row.wallCert")}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("wallet.row.noRegistry")}</p>
          )}

          {lapsed ? (
            <>
              <Link
                href={`${growHref(sid, cert.type)}${carry}`}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-base font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
                data-testid="cert-renew-steps"
              >
                {t("wallet.row.renewSteps")}
                <ArrowRight className="size-4 shrink-0" aria-hidden />
              </Link>
              <Button variant="outline" size="touch" className="w-full" onClick={openSheet}>
                {t("wallet.row.renewedAddDate")}
              </Button>
              <AddExpirySheet
                key={sheetKey}
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                certType={cert.type}
                initialDate={declaration?.expires_at ?? null}
                initialNumber={declaration?.cert_number ?? null}
                declare={declare}
              />
            </>
          ) : held && !training ? (
            <>
              <Button variant={dated ? "outline" : "default"} size="touch" className="w-full" onClick={openSheet}>
                {declaration ? t("wallet.row.editExpiry") : t("wallet.row.addExpiry")}
              </Button>
              <AddExpirySheet
                key={sheetKey}
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                certType={cert.type}
                initialDate={declaration?.expires_at ?? null}
                initialNumber={declaration?.cert_number ?? null}
                declare={declare}
              />
            </>
          ) : training ? null : (
            // Not held: a date can't make it held. Show what it takes instead (Grow item).
            <Link
              href={`${growHref(sid, cert.type)}${carry}`}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-base font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              data-testid="cert-see-what-it-takes"
            >
              {t("wallet.row.seeWhatItTakes")}
              <ArrowRight className="size-4 shrink-0" aria-hidden />
            </Link>
          )}
        </div>
      ) : null}
    </li>
  )
}
