"use client"

// /shop: desktop portal for Tallowfield Fabricating Ltd. (synthetic, syn-012).
// Work for you, the one step that unlocks more work, certificates due, the
// phone link and a profile summary. Data: useShopBundle() (the phone app's hook).

import * as React from "react"
import Link from "next/link"
import { Award, CalendarClock, CircleCheck, Clock, Factory, GraduationCap, Inbox, Send, Smartphone, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { useShopBundle } from "@/lib/app/shop-bundle"
import { useAppActions } from "@/lib/app/actions-store"
import { useWithParams } from "@/lib/ui/use-with-params"
import { growHref } from "@/lib/app/readiness"
import { needsAttention, renewalVerb, renewalsFor, shortDate } from "@/lib/app/renewals"
import { appToday } from "@/lib/app/today"
import { CERT_IN_TRAINING_LABEL, certInTraining, fmtCertCount, fmtMoney, PROCESS_LABEL } from "@/lib/format"
import { StatusBadge } from "@/components/muster/status-badge"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { PortalPage, Panel, BigAction } from "./portal-page"
import { CertName } from "./plain"
import { StartDemo, useRouted } from "./start-demo"

export const SHOP_ID = "syn-012"

/** Desk order: offers that need a reply first, then accepted, then declined (job order within each). */
const OFFER_ORDER: Record<string, number> = { offered: 0, accepted: 1, declined: 2 }

function Stat({ value, label, testId }: { value: React.ReactNode; label: string; testId?: string }) {
  return (
    <div className="flex min-w-0 flex-col" data-testid={testId}>
      <span className="text-[1.75rem] leading-tight font-semibold tracking-tight tabular-nums">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
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
  // On file = held or in training. A pending_training certificate is NOT held (welders are
  // still training, paid by Northgate): count it separately and never flag it for renewal.
  const onFile = renewals.filter((r) => r.status !== "unknown" || r.date_basis === "shop-declared")
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
        <>
          Defence work offered to your shop by Northgate (a fictional defence company), what one step would win more,
          and which certificates need attention. Using it is free.
        </>
      }
    >
      {!routed && demo.ready ? (
        <StartDemo message="Northgate hasn't sent offers yet. Load its parts list and Muster matches each job to one qualified shop, then your offers appear here." />
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
              <div className="grid grid-cols-3 gap-3">
                <Stat value={open.length} label={open.length === 1 ? "offer needs a reply" : "offers need a reply"} testId="shop-open-offers" />
                <Stat value={accepted.length} label="accepted" />
                <Stat value={fmtMoney(offerValue, { compact: true })} label="of work from Northgate" />
              </div>
              <p className="text-sm text-muted-foreground">
                No bidding: each job was offered only to you.
                {newCount ? (
                  <span className="ml-1 font-medium text-assigned">
                    {newCount} new {newCount === 1 ? "offer" : "offers"} after Northgate paid for welder training.
                  </span>
                ) : null}
              </p>
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {deskOffers.map((o) => (
                  <li key={o.job_id}>
                    <Link
                      href={wp(`/m/shops/${SHOP_ID}/offers/${encodeURIComponent(o.job_id)}`)}
                      prefetch={false}
                      data-testid={`desk-offer-${o.job_id}`}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1 truncate text-foreground" title={o.description}>
                        {o.description.split(",")[0]}
                        <span className="ml-1.5 text-xs text-muted-foreground">{o.job_id}</span>
                      </span>
                      <span className="flex items-center gap-2 tabular-nums">
                        {fmtMoney(o.value_cad, { compact: true })}
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
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
            <div className="flex flex-col gap-2">
              <p className="text-lg leading-snug font-semibold" data-testid="readiness-headline">
                <CertName type={readiness.requirement} /> → {readiness.jobs_unlocked.length} more{" "}
                {readiness.jobs_unlocked.length === 1 ? "job" : "jobs"} worth {fmtMoney(readiness.value_cad, { compact: true })}
              </p>
              {readiness.requirement === "CWB_W47.1" && !funded && fundingRequest ? (
                <p className="flex items-start gap-2 text-sm font-medium text-funded" data-testid="shop-funding-requested">
                  <Send className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    Funding requested · awaiting Northgate.{" "}
                    <span className="font-normal text-muted-foreground">You asked Northgate to pay for the welder training.</span>
                  </span>
                </p>
              ) : readiness.requirement === "CWB_W47.1" && !funded ? (
                <p className="text-sm text-muted-foreground">
                  The company is certified, and each welder passes a test. Northgate can pay for the welder training.{" "}
                  <Link
                    href={wp(growHref(SHOP_ID, "CWB_W47.1"))}
                    prefetch={false}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    See how
                  </Link>
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {routed ? "Nothing within one step right now." : "Shows once Northgate's parts list is matched."}
            </p>
          )}
          {training ? (
            <div className="flex items-start gap-2 rounded-lg bg-funded-soft px-3 py-2 text-sm text-funded" data-testid="shop-training">
              <GraduationCap className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <strong className="font-semibold">
                  {training.trainees} welders in training, paid by Northgate.
                </strong>{" "}
                {training.recipient_example}. The stuck welding jobs start once they qualify.
              </span>
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel
          title="Certificates due"
          icon={CalendarClock}
          action={{ label: "All certificates", href: `${phoneHref}/certs` }}
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
                <ul className="flex flex-col gap-1.5">
                  {onFile.slice(0, 4).map((r) => (
                    <li key={r.cert_type} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                      <span className="flex items-center gap-2">
                        <Award className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <CertName type={r.cert_type} className="font-medium" />
                        {certInTraining(r.status) ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 text-xs font-medium text-amber-800">
                            <Clock className="size-3" aria-hidden />
                            {CERT_IN_TRAINING_LABEL}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{r.status}</span>
                        )}
                      </span>
                      {certInTraining(r.status) ? (
                        <span className="text-muted-foreground">paid by Northgate · not held yet</span>
                      ) : (
                        <span className={cn("text-muted-foreground", needsAttention(r) && "font-medium text-blocked")}>
                          {r.act_by ? `${renewalVerb(r.cert_type)} by ${shortDate(r.act_by, appToday())}` : "no date yet"}
                        </span>
                      )}
                    </li>
                  ))}
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
          <BigAction href="/shop/work" icon={Inbox} label="Work for you" hint="Every offer, with why you fit" />
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
        <p className="text-xs text-muted-foreground">Synthetic demo shop: made up for this demo. Muster never stores drawings.</p>
      </Panel>
    </PortalPage>
  )
}
