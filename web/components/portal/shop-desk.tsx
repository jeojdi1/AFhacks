"use client"

// /shop: desktop portal for Tallowfield Fabricating Ltd. (synthetic, syn-012).
// Work for you, the one step that unlocks more work, certificates due, the
// phone link and a profile summary. Data: useShopBundle() (the phone app's hook).

import * as React from "react"
import Link from "next/link"
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleCheck,
  Clock,
  Factory,
  GraduationCap,
  Inbox,
  Send,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { useShopBundle } from "@/lib/app/shop-bundle"
import { useAppActions } from "@/lib/app/actions-store"
import { useWithParams } from "@/lib/ui/use-with-params"
import { c } from "@/lib/ui/copy"
import { needsAttention, renewalVerb, renewalsFor, shortDate } from "@/lib/app/renewals"
import { appToday } from "@/lib/app/today"
import { CERT_IN_TRAINING_LABEL, certInTraining, certIsHeld, fmtCertCount, fmtMoney, PROCESS_LABEL } from "@/lib/format"
import { StatusBadge } from "@/components/muster/status-badge"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { PortalPage, Panel, BigAction } from "./portal-page"
import { CertName } from "./plain"
import { InfoTip } from "./desk-art"
import { CertBadgeArt, CertIconTile } from "./shop-art/cert-art"
import { ProcessArt, SeatDots } from "@/components/mobile/art/process-art"
import { WelderArt } from "@/components/mobile/trainee/seat-art"
import { StartDemo, useRouted } from "./start-demo"
import { useShopPrefs } from "@/lib/app/preferences"
import { packageLine, packageVerdict, workPackage } from "@/lib/app/sizing"
import { t } from "@/lib/app/strings"
import { isWeldingTrade, tradeForPackage } from "@/lib/trades"

export const SHOP_ID = "syn-012"

/** Desk order: offers that need a reply first, then accepted, then declined (job order within each). */
const OFFER_ORDER: Record<string, number> = { offered: 0, accepted: 1, declined: 2 }

type Tone = "reply" | "accepted" | "money"

const STAT_TONE: Record<Tone, { Icon: LucideIcon; tone: string; bg: string }> = {
  reply: { Icon: Inbox, tone: "text-public", bg: "bg-public-soft" },
  accepted: { Icon: CheckCircle2, tone: "text-assigned", bg: "bg-assigned-soft" },
  money: { Icon: Banknote, tone: "text-slate-800", bg: "bg-muted/70" },
}

/** Big icon tile: icon, number, short label. */
function Stat({ kind, value, label, testId }: { kind: Tone; value: React.ReactNode; label: string; testId?: string }) {
  const { Icon, tone, bg } = STAT_TONE[kind]
  return (
    <div className={cn("flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-3 text-center", bg)} data-testid={testId}>
      <Icon className={cn("size-7", tone)} aria-hidden />
      <span className={cn("text-3xl leading-none font-semibold tracking-tight tabular-nums", tone)}>{value}</span>
      <span className="text-sm leading-tight text-muted-foreground">{label}</span>
    </div>
  )
}

export function ShopDesk() {
  const demo = useDemo()
  const routed = useRouted()
  const b = useShopBundle(SHOP_ID)
  const actions = useAppActions()
  const wp = useWithParams()
  const shop = b.shop
  const name = shop?.name ?? "Tallowfield Fabricating Ltd."
  const short = name.split(" ")[0] || "Tallowfield"

  const open = b.offers.filter((o) => o.status === "offered")
  const accepted = b.offers.filter((o) => o.status === "accepted")
  const offerValue = b.offers.filter((o) => o.status !== "declined").reduce((s, o) => s + (o.value_cad || 0), 0)
  // All of Northgate's offers as one yearly figure vs the shop's own minimum (docs/api.md §9).
  const prefs = useShopPrefs(b.shop, SHOP_ID)
  const pkg = workPackage(b.offers, (o) => o.status, prefs)
  const pkgVerdict = pkg ? packageVerdict(pkg) : null
  const newIds = React.useMemo(() => {
    const ids = new Set<string>()
    for (const r of Object.values(demo.fundResults)) for (const a of r.unblocked_jobs ?? []) if (a.shop_id === SHOP_ID) ids.add(a.job_id)
    return ids
  }, [demo.fundResults])
  const newCount = b.offers.filter((o) => newIds.has(o.job_id)).length
  const deskOffers = React.useMemo(
    () =>
      b.offers
        .map((o, i) => ({ o, i }))
        .sort((x, y) => (OFFER_ORDER[x.o.status] ?? 3) - (OFFER_ORDER[y.o.status] ?? 3) || x.i - y.i)
        .map((x) => x.o)
        .slice(0, 3),
    [b.offers]
  )

  const readiness = b.detail?.readiness?.[0] ?? null
  const training = b.detail?.training?.find((t) => t.status === "funded") ?? null
  const funded = !!training
  // Every trade: the welding words stay for the demo's TP-01; any other package names its trade.
  const trainingTrade = training ? tradeForPackage(training) : null
  const trainingWelding = !training || isWeldingTrade(trainingTrade)
  const trainingWorkers = trainingWelding ? "welders" : trainingTrade ? trainingTrade.workers : "trainees"
  // "Ask Northgate to fund this" (phone Grow tab) → POST /shops/{id}/funding-requests.
  const fundingRequest = React.useMemo(() => {
    if (!readiness) return null
    return (
      Object.values(actions.fundingRequests).find(
        (r) => r.shop_id === SHOP_ID && r.requirement === readiness.requirement && r.status !== "funded"
      ) ?? null
    )
  }, [actions.fundingRequests, readiness])

  const renewals = React.useMemo(
    () =>
      renewalsFor(b.certs, {
        today: appToday(),
        shopId: SHOP_ID,
        jobsById: b.jobsById,
        assignments: b.assignments,
      }),
    [b.certs, b.jobsById, b.assignments]
  )
  // On file = held or in training. A pending_training certificate is NOT held (workers are
  // still training, paid by Northgate): count it separately and never flag it for renewal.
  // A self-declared date on a certificate the shop does not hold does not put it on file.
  const onFile = renewals.filter((r) => certIsHeld(r.status) || certInTraining(r.status))
  const heldCount = onFile.filter((r) => !certInTraining(r.status)).length
  const trainingCount = onFile.filter((r) => certInTraining(r.status)).length
  const due = onFile.filter((r) => !certInTraining(r.status) && needsAttention(r))

  const phonePath = `/m/shops/${SHOP_ID}`
  // The QR page (/phone) opens this shop's own phone screens on a phone on the same Wi-Fi.
  const phoneHref = `/phone?to=${encodeURIComponent(phonePath)}`

  return (
    <PortalPage
      role="shop"
      desk="Tallowfield's shop desk"
      testId="shop-desk"
      eyebrow={
        <>
          {name} · owner · synthetic demo shop{shop?.city ? ` in ${shop.city}` : ""}
        </>
      }
      title={`${short}'s shop desk`}
      badges={<StatusBadge kind="synthetic" />}
      lede={
        <span className="inline-flex items-center gap-1">
          Defence work from Northgate (fictional), at a glance. Free for your shop.
          <InfoTip label="What is this desk?">
            Defence work offered to your shop by Northgate (a fictional defence company), what one step would win more,
            and which certificates need attention. Using it is free.
          </InfoTip>
        </span>
      }
    >
      {!routed && demo.ready ? (
        <StartDemo
          message="Northgate hasn't sent offers yet. Load its parts list and Shieldworks matches each job to one qualified shop, then your offers appear here."
          roleMessage={c("empty.role.shop")}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel
          title="Work for you"
          icon={Inbox}
          action={{ label: "See all offers", href: "/shop/work" }}
          className="lg:col-span-3"
          testId="panel-work"
        >
          {b.loading && !b.detail ? (
            <div className="h-20 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" aria-hidden />
          ) : b.offers.length ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Stat
                  kind="reply"
                  value={open.length}
                  label={open.length === 1 ? "offer needs a reply" : "offers need a reply"}
                  testId="shop-open-offers"
                />
                <Stat kind="accepted" value={accepted.length} label="accepted" />
                <Stat kind="money" value={fmtMoney(offerValue, { compact: true })} label="of work from Northgate" />
              </div>
              {pkg && pkg.count > 0 ? (
                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-slate-700" data-testid="shop-desk-package">
                  <span className="font-medium text-foreground">{packageLine(pkg)}</span>
                  {pkg.assumed ? <AssumptionTag note={t("size.assumption", { years: pkg.years })} /> : null}
                  {pkgVerdict ? (
                    <span className={cn("font-medium", pkg.meets ? "text-assigned" : "text-amber-800")}>· {pkgVerdict}</span>
                  ) : null}
                </p>
              ) : null}
              <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
                No bidding: each job was offered only to you.
                <InfoTip label="Why you got these offers">
                  Shieldworks matched each of Northgate&apos;s jobs to one qualified shop: the process, size, certificates and
                  free hours fit. Open an offer to see why you fit, then accept or decline it.
                </InfoTip>
                {newCount ? (
                  <span className="font-medium text-assigned">
                    {newCount} new {newCount === 1 ? "offer" : "offers"} after Northgate paid for{" "}
                    {trainingWelding ? "welder training" : "the training"}.
                  </span>
                ) : null}
              </p>
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {deskOffers.map((o) => (
                  <li key={o.job_id}>
                    <Link
                      href={wp(
                        o.status === "accepted"
                          ? `/shops/${SHOP_ID}/offers/${encodeURIComponent(o.job_id)}/award`
                          : `/shops/${SHOP_ID}`
                      )}
                      prefetch={false}
                      data-testid={`desk-offer-${o.job_id}`}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <ProcessArt tags={b.jobsById[o.job_id]?.process_tags} className="size-11" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium text-foreground" title={o.description}>
                          {o.description.split(",")[0]}
                        </span>
                        <span className="text-xs text-muted-foreground">{o.job_id}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1 tabular-nums sm:flex-row sm:items-center sm:gap-2">
                        <span className="text-base font-semibold">{fmtMoney(o.value_cad, { compact: true })}</span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                            o.status === "accepted"
                              ? "bg-assigned-soft text-assigned"
                              : o.status === "declined"
                                ? "bg-muted text-muted-foreground"
                                : "bg-public-soft text-public"
                          )}
                        >
                          {o.status === "offered" ? "Needs a reply" : o.status === "accepted" ? "Accepted" : "Declined"}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Northgate hasn&apos;t sent offers yet.</p>
          )}
        </Panel>

        <Panel title="One step to more work" icon={Sparkles} className="lg:col-span-2" testId="panel-readiness">
          {readiness ? (
            <div className="flex items-center gap-4">
              <CertBadgeArt className="size-20 sm:size-24" />
              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-xl leading-snug font-semibold" data-testid="readiness-headline">
                  <CertName type={readiness.requirement} /> → {readiness.jobs_unlocked.length} more{" "}
                  {readiness.jobs_unlocked.length === 1 ? "job" : "jobs"} worth {fmtMoney(readiness.value_cad, { compact: true })}
                </p>
                {readiness.requirement === "CWB_W47.1" && !funded && fundingRequest ? (
                  <p className="flex items-start gap-2 text-sm font-medium text-funded" data-testid="shop-funding-requested">
                    <Send className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>Funding requested · awaiting Northgate.</span>
                  </p>
                ) : readiness.requirement === "CWB_W47.1" && !funded ? (
                  <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
                    Northgate can pay for the training.
                    <InfoTip label="How welder certification works">
                      The company is certified, and each welder passes a test. Northgate can pay for the welder training and
                      earns credit for it.
                    </InfoTip>
                    <Link
                      href={wp(`/shops/${SHOP_ID}`)}
                      prefetch={false}
                      className="font-medium text-foreground underline underline-offset-4"
                    >
                      See how
                    </Link>
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {routed ? "Nothing within one step right now." : "Shows once Northgate's parts list is matched."}
            </p>
          )}
          {training ? (
            <div className="flex flex-col gap-2 rounded-xl bg-funded-soft px-3 py-3 text-funded" data-testid="shop-training">
              <div className="flex items-center gap-3">
                {trainingWelding ? (
                  <WelderArt className="h-16 w-32 shrink-0" />
                ) : (
                  <GraduationCap className="size-12 shrink-0" aria-hidden />
                )}
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="flex items-baseline gap-2">
                    <strong className="text-4xl leading-none font-semibold tabular-nums">{training.trainees}</strong>
                    <span className="text-base font-semibold">{trainingWorkers} in training</span>
                    {trainingWelding ? (
                      <InfoTip label="About the welder training" className="self-center">
                        Northgate pays for the training directly. The stuck welding jobs start once the welders qualify. Shieldworks
                        never shows trainees&apos; names.
                      </InfoTip>
                    ) : (
                      <InfoTip label="About the training" className="self-center">
                        Northgate pays for the training directly. The stuck jobs start once the trainees qualify. Shieldworks never
                        shows trainees&apos; names.
                      </InfoTip>
                    )}
                  </p>
                  <SeatDots count={training.trainees} />
                </div>
              </div>
              <p className="flex flex-wrap items-center gap-x-1 text-sm">
                <span className="font-medium">Paid by Northgate.</span>
                <span className="text-funded/80">{training.recipient_example}</span>
              </p>
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel
          title="Certificates due"
          icon={CalendarClock}
          action={{ label: "All certificates", href: wp(`/shops/${SHOP_ID}#certificates`) }}
          className="lg:col-span-3"
          testId="panel-certs"
        >
          {b.loading && !b.detail ? (
            <div className="h-16 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" aria-hidden />
          ) : (
            <>
              <p className="flex items-center gap-2 text-[0.95rem]">
                {due.length ? (
                  <span className="font-semibold text-blocked">
                    {due.length} {due.length === 1 ? "certificate needs" : "certificates need"} attention
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-medium text-assigned">
                    <CircleCheck className="size-4" aria-hidden /> Nothing due soon
                  </span>
                )}
                <span className="text-muted-foreground" data-testid="shop-cert-count">
                  · {fmtCertCount({ held: heldCount, inTraining: trainingCount })}
                </span>
              </p>
              {onFile.length ? (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {onFile.slice(0, 4).map((r) => {
                    const inTraining = certInTraining(r.status)
                    const warn = !inTraining && needsAttention(r)
                    return (
                      <li
                        key={r.cert_type}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-sm",
                          warn ? "border-blocked/40 bg-blocked-soft" : "border-border"
                        )}
                      >
                        <CertIconTile type={r.cert_type} tone={warn ? "warn" : inTraining ? "training" : "neutral"} />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <CertName type={r.cert_type} className="font-medium leading-snug" />
                          {inTraining ? (
                            <span className="inline-flex w-fit items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 text-xs font-medium text-amber-800">
                              <Clock className="size-3" aria-hidden />
                              {CERT_IN_TRAINING_LABEL}
                            </span>
                          ) : (
                            <span
                              className={cn(
                                "inline-flex w-fit items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap",
                                warn ? "bg-blocked/15 text-blocked" : "bg-muted text-muted-foreground"
                              )}
                            >
                              <CalendarClock className="size-3" aria-hidden />
                              {r.act_by ? `Due ${shortDate(r.act_by, appToday())}` : "no date yet"}
                            </span>
                          )}
                        </span>
                        <InfoTip label={`About this certificate: ${r.cert_type}`} className="self-start">
                          {inTraining ? (
                            <>Status: {CERT_IN_TRAINING_LABEL}. Paid by Northgate · not held yet.</>
                          ) : (
                            <>
                              Status: {r.status}.{" "}
                              {r.act_by
                                ? `${renewalVerb(r.cert_type)} by ${shortDate(r.act_by, appToday())}.`
                                : "No renewal date on file yet."}
                            </>
                          )}
                        </InfoTip>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                Dates on a synthetic shop are illustrative. <AssumptionTag note="Renewal reminders use demo rules; check each program's own deadlines." />
              </p>
            </>
          )}
        </Panel>

        <div className="flex flex-col gap-3 lg:col-span-2">
          <BigAction
            href={wp(phoneHref)}
            icon={Smartphone}
            label="Open on your phone"
            hint="Scan a code, then reply to offers from the shop floor"
            primary={open.length > 0}
          />
          <p className="-mt-1 text-right text-sm text-muted-foreground">
            <Link
              href={wp(phonePath)}
              prefetch={false}
              className="underline underline-offset-4 hover:text-foreground"
              data-testid="shop-phone-preview"
            >
              Preview the phone screens here
            </Link>
          </p>
        </div>
      </div>

      <Panel title="Your profile" icon={Factory} action={{ label: "Full profile", href: `/shops/${SHOP_ID}` }} testId="panel-profile">
        {shop ? (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Town</dt>
              <dd className="font-medium">{shop.city}, Ontario</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Employees</dt>
              <dd className="font-medium">
                {shop.employee_band}
                {shop.is_sme ? " · small business" : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">What you do</dt>
              <dd className="font-medium">{shop.processes.map((p) => PROCESS_LABEL[p] ?? p).join(", ")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Shop hours a week</dt>
              <dd className="font-medium tabular-nums">{shop.capacity_hours_week}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Machines</dt>
              <dd className="font-medium">{shop.machines.join(" · ")}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Contact (role address)</dt>
              <dd className="font-medium break-all">{shop.contact_role_email ?? "—"}</dd>
            </div>
          </dl>
        ) : (
          <div className="h-16 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" aria-hidden />
        )}
        <p className="text-xs text-muted-foreground">Synthetic demo shop: made up for this demo. Shieldworks never stores drawings.</p>
      </Panel>
    </PortalPage>
  )
}
