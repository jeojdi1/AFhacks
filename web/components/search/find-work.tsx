"use client"

// /shop/work: "Find work" for Tallowfield Fabricating Ltd. (synthetic demo shop).
// GET /search/jobs (docs/api.md §7): Northgate jobs it qualifies for, jobs one step away
// (with the phone app's "how to get it" page), and open federal defence tenders (OGL).

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDashed,
  Clock,
  ExternalLink,
  Inbox,
  Landmark,
  LoaderCircle,
  Lock,
  Search,
  Send,
  TriangleAlert,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtMoney } from "@/lib/format"
import { useDemo } from "@/lib/data/store"
import { c } from "@/lib/ui/copy"
import { useWithParams } from "@/lib/ui/use-with-params"
import { growHref } from "@/lib/app/readiness"
import { PortalPage, Panel } from "@/components/portal/portal-page"
import { EmptyState } from "@/components/muster/empty-state"
import { Details } from "@/components/muster/details"
import { Term } from "@/components/muster/term"
import { useJobSearch } from "@/lib/search/client"
import { fixtureShop, fundedUnlocks } from "@/lib/search/local"
import { PROCESS_KEYS, canadaBuysSearchUrl, certFirst, fmtDate, processPlain } from "@/lib/search/labels"
import type { EligibleJob, MissingReq, NearMissJob, Tender } from "@/lib/search/types"
import { TermText } from "./term-text"
import { TENDER_KIND_LABEL, fitTenders, type TenderKind } from "./work-tenders"

const selectCls =
  "h-10 min-w-0 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring"

function reqLabel(m: MissingReq): string {
  return m.kind === "cert" ? certFirst(m.requirement) : `${processPlain(m.requirement)} (a process the shop doesn't do yet)`
}

/** Certificate names as they appear in routing reasons ("Welding + CWB W47.1"). */
const CERT_IN_REASON: [RegExp, string][] = [
  [/\bCWB W47\.1\b/, "CWB_W47.1"],
  [/\bCGP\b/, "CGP"],
  [/\bCPCSC Level 1\b/, "CPCSC_L1"],
  [/\bAS9100\b/, "AS9100"],
  [/\bISO 9001\b/, "ISO9001"],
  [/\bNadcap\b/i, "NADCAP"],
]

/** The certificate a reason names that this shop only has in training (pending_training), or null. */
function reasonTrainingCert(r: string, inTraining: Set<string>): string | null {
  for (const [re, type] of CERT_IN_REASON) {
    if (!re.test(r)) continue
    if (type === "NADCAP") {
      const hit = [...inTraining].find((t) => t.startsWith("NADCAP"))
      if (hit) return hit
    } else if (inTraining.has(type)) return type
  }
  return null
}

function plainReason(r: string): string {
  return r.replace(/SME: 2x direct credit/, "small business: counts double")
}

function StatusChip({ job }: { job: EligibleJob }) {
  if (job.status === "offered_to_you") {
    const accepted = job.offer_status === "accepted"
    const declined = job.offer_status === "declined"
    return (
      <span
        className={cn(
          "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium",
          declined ? "border-slate-300 bg-slate-50 text-slate-700" : "border-assigned/25 bg-assigned-soft text-assigned"
        )}
      >
        {declined ? <CircleDashed className="size-3.5" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
        {accepted ? "Offered to you · accepted" : declined ? "Offered to you · declined" : "Offered to you"}
      </span>
    )
  }
  if (job.status === "assigned_elsewhere")
    return (
      <span className="inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-600">
        <ArrowRight className="size-3.5" aria-hidden />
        Went to another shop
      </span>
    )
  return (
    <span className="inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2.5 text-xs font-medium text-slate-700">
      <CircleDashed className="size-3.5" aria-hidden />
      Open: not matched yet
    </span>
  )
}

function WorkRow({ job, shopId, inTraining }: { job: EligibleJob; shopId: string; inTraining: Set<string> }) {
  const wp = useWithParams()
  const mine = job.status === "offered_to_you"
  return (
    <li
      data-job-id={job.job_id}
      data-status={job.status}
      className={cn("flex flex-col gap-2 rounded-lg border p-3 sm:p-4", mine ? "border-assigned/30 bg-assigned-soft/40" : "border-border")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip job={job} />
        {job.controlled ? (
          <span className="inline-flex h-6 items-center gap-1 rounded-full border border-controlled/25 bg-controlled-soft px-2 text-xs font-medium text-controlled">
            <Lock className="size-3.5" aria-hidden />
            <Term k="CONTROLLED">Controlled part</Term>
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">{job.job_id}</span>
      </div>
      <p className="font-medium">
        <TermText text={job.description} />
      </p>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
        <span>
          <span className="font-semibold">{fmtMoney(job.value_cad, { compact: true })}</span> of work
        </span>
        <span>
          {fmtMoney(job.credit_cad, { compact: true })} credit for Northgate
          {job.multiplier === 2 ? " · counts double (2×)" : ""}
        </span>
        <span>{job.hours_week} hours a week</span>
        {job.process_tags.length ? <span>{job.process_tags.map(processPlain).join(" + ")}</span> : null}
      </p>
      {mine ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {job.reasons.length ? (
            <p className="text-sm text-muted-foreground" data-why-you>
              Why you:{" "}
              {job.reasons.map((r, i) => {
                const training = reasonTrainingCert(r, inTraining)
                return (
                  <React.Fragment key={r}>
                    {i ? " · " : null}
                    {training ? (
                      <span className="inline-flex items-center gap-1 text-amber-800" data-reason-training>
                        <Clock className="size-3.5 shrink-0" aria-hidden />
                        <span>
                          <TermText text={plainReason(r)} /> ({training.startsWith("CWB") ? "welders" : "staff"} in training,{" "}
                          not held yet)
                        </span>
                      </span>
                    ) : (
                      <TermText text={plainReason(r)} />
                    )}
                  </React.Fragment>
                )
              })}
            </p>
          ) : (
            <span />
          )}
          <Link
            href={wp(`/m/shops/${encodeURIComponent(shopId)}/offers/${encodeURIComponent(job.job_id)}`)}
            prefetch={false}
            className="inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
          >
            Open the offer →
          </Link>
        </div>
      ) : null}
    </li>
  )
}

function NearRow({ job, shopId }: { job: NearMissJob; shopId: string }) {
  const wp = useWithParams()
  return (
    <li data-job-id={job.job_id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        {job.status === "open" ? (
          <span className="inline-flex h-6 items-center gap-1 rounded-full border border-blocked/30 bg-blocked-soft px-2.5 text-xs font-medium text-blocked">
            <TriangleAlert className="size-3.5" aria-hidden />
            <Term k="STUCK">Stuck: no shop can take it yet</Term>
          </span>
        ) : job.status === "assigned_elsewhere" ? (
          <span className="inline-flex h-6 items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-600">
            <ArrowRight className="size-3.5" aria-hidden />
            Went to another shop
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">{job.job_id}</span>
      </div>
      <p className="font-medium">
        <TermText text={job.description} />
      </p>
      <p className="text-sm text-slate-700">
        <span className="font-semibold">{fmtMoney(job.value_cad, { compact: true })}</span> of work · {job.hours_week} hours a week
      </p>
      <ul className="flex flex-col gap-1.5">
        {job.missing.map((m) => (
          <li key={m.requirement} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/70 px-3 py-2 text-sm">
            <span>
              <span className="font-medium">Missing: </span>
              {reqLabel(m)}
            </span>
            <Link
              href={wp(growHref(shopId, m.requirement))}
              prefetch={false}
              className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
            >
              See how to get it →
            </Link>
          </li>
        ))}
      </ul>
    </li>
  )
}

function TenderRow({ t, kind }: { t: Tender; kind?: Exclude<TenderKind, "fits"> }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border p-3 sm:p-4" data-tender-kind={kind ?? "fits"}>
      {kind ? (
        <span className="inline-flex h-6 w-fit items-center rounded-full border border-slate-300 bg-slate-50 px-2.5 text-xs font-medium text-slate-700">
          {TENDER_KIND_LABEL[kind]}
        </span>
      ) : null}
      <p className="font-medium">{t.title}</p>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
        <span>{t.buyer ?? "Government of Canada"}</span>
        <span>Closes {fmtDate(t.closing_date)}</span>
        {t.region ? <span>{t.region}</span> : null}
        {t.notice_type ? <span>{t.notice_type}</span> : null}
      </p>
      <p className="text-xs text-muted-foreground">
        Reference {t.reference}
        {t.solicitation_number ? ` · solicitation ${t.solicitation_number}` : ""}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a
          href={canadaBuysSearchUrl(t.reference)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
        >
          Find it on CanadaBuys
          <ExternalLink className="size-3.5" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        {t.url ? (
          <a
            href={t.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
          >
            Notice page
            <ExternalLink className="size-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    </li>
  )
}

export function FindWork() {
  const { demoShopId, stage, ready, fundedIds, gaps } = useDemo()
  const wp = useWithParams()
  const shopId = demoShopId ?? "syn-012"
  const shop = fixtureShop(shopId)
  const [q, setQ] = React.useState("")
  const [process, setProcess] = React.useState("")
  const { data, loading, error } = useJobSearch(shopId, q, process ? [process] : [])
  // The summary cards always describe ALL of this shop's work, not the current search, so
  // they match the shop desk and don't drop to $0 while typing.
  const { data: allData } = useJobSearch(shopId, "", [])
  const filtering = !!q.trim() || !!process
  const totals = (filtering ? allData : data) ?? allData ?? null

  // Certificates this shop has only in training (a funded package): they count for matching,
  // but are not held yet.
  const inTraining = React.useMemo(
    () => new Set(fundedUnlocks(fundedIds, gaps?.suggestions).get(shopId) ?? []),
    [fundedIds, gaps, shopId]
  )

  // "Offered to you" = open or accepted offers, the same set as the tile above. Declined ones
  // are listed apart: they are not work for you.
  const offered = data?.eligible.filter((e) => e.status === "offered_to_you" && e.offer_status !== "declined") ?? []
  const turnedDown = data?.eligible.filter((e) => e.status === "offered_to_you" && e.offer_status === "declined") ?? []
  const others = data?.eligible.filter((e) => e.status !== "offered_to_you") ?? []
  const oneStep = data?.near_miss.filter((n) => n.missing.length === 1) ?? []
  const twoSteps = data?.near_miss.filter((n) => n.missing.length > 1) ?? []

  // Declined offers are not work for you: left out of the totals, as on the shop desk.
  const liveOffers = (totals?.eligible ?? []).filter((e) => e.status === "offered_to_you" && e.offer_status !== "declined")
  const offeredValue = liveOffers.reduce((s, e) => s + e.value_cad, 0)
  const allOneStep = (totals?.near_miss ?? []).filter((n) => n.missing.length === 1)
  const oneStepValue = allOneStep.reduce((s, e) => s + e.value_cad, 0)

  // Tenders: only goods a manufacturer could make or supply; equipment purchases set aside.
  const tenders = fitTenders(data?.tenders ?? [], { q, process })
  const allTenders = fitTenders(totals?.tenders ?? [], { q: "", process: "" })

  // "Get X → N more jobs worth $Y", grouped by the one missing requirement.
  const groupMap = new Map<string, { req: MissingReq; n: number; value: number }>()
  for (const j of oneStep) {
    const r = j.missing[0]
    const g = groupMap.get(r.requirement) ?? { req: r, n: 0, value: 0 }
    g.n += 1
    g.value += j.value_cad
    groupMap.set(r.requirement, g)
  }
  const groups = [...groupMap.values()].sort((a, b) => b.value - a.value)

  // Offers exist only once the parts list is matched. Keep the empty state (and its
  // load-and-match button) mounted through "uploaded" so the one click finishes routing.
  const empty = ready && (stage === "empty" || stage === "uploaded")

  return (
    <PortalPage
      role="shop"
      desk="Tallowfield's shop desk"
      testId="find-work"
      eyebrow={
        <>
          {shop?.name ?? shopId} · owner · synthetic demo shop{shop?.city ? ` in ${shop.city}` : ""}
        </>
      }
      title="Find work"
      lede="Northgate jobs your shop qualifies for, jobs you're one step away from, and open federal defence tenders. No bidding: each Northgate job is offered to one shop."
    >
      <Link
        href={wp("/shop")}
        className="-mt-3 inline-flex w-fit items-center gap-1 text-sm font-medium text-slate-700 underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Shop desk
      </Link>

      {error ? (
        <p role="alert" className="rounded-lg border border-blocked/30 bg-blocked-soft px-3 py-2 text-sm text-slate-800">
          {error}
        </p>
      ) : null}

      {!empty && totals ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-work-stats>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Offered to you</p>
            <p className="text-2xl font-semibold tabular-nums">{fmtMoney(offeredValue, { compact: true })}</p>
            <p className="text-sm text-slate-700">
              {liveOffers.length} job{liveOffers.length === 1 ? "" : "s"} from Northgate
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">One step away</p>
            <p className="text-2xl font-semibold tabular-nums">{fmtMoney(oneStepValue, { compact: true })}</p>
            <p className="text-sm text-slate-700">
              {allOneStep.length} more job{allOneStep.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Open federal defence tenders</p>
            <p className="text-2xl font-semibold tabular-nums">{allTenders.fits.length}</p>
            <p className="text-sm text-slate-700">
              for parts, in your categories
              {allTenders.setAside.length ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {allTenders.setAside.length} equipment or off-the-shelf {allTenders.setAside.length === 1 ? "notice" : "notices"} left out
                </span>
              ) : null}
            </p>
          </div>
        </div>
      ) : null}

      <Panel title="Work for you" icon={Inbox} id="work-for-you" testId="work-for-you">
        <form
          role="search"
          onSubmit={(e) => e.preventDefault()}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <label htmlFor="job-q" className="sr-only">
            Search jobs
          </label>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="job-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search jobs: part, material or job number"
              className="h-10 w-full min-w-0 rounded-md border border-input bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring"
              autoComplete="off"
            />
          </div>
          <label className="sr-only" htmlFor="job-process">
            Process
          </label>
          <select id="job-process" className={selectCls} value={process} onChange={(e) => setProcess(e.target.value)}>
            <option value="">Any process</option>
            {PROCESS_KEYS.map((p) => (
              <option key={p} value={p}>
                {processPlain(p)}
              </option>
            ))}
          </select>
          {loading ? <LoaderCircle className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading" /> : null}
        </form>

        {empty ? (
          <EmptyState title={c("shop.empty.title")} body={c("shop.empty.body")} run={{ label: c("run.loadAndMatch.shop") }} />
        ) : (
          <div className={cn("flex flex-col gap-4", loading && "opacity-60")}>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                Offered to you ({offered.length})
              </h3>
              {offered.length ? (
                <ul className="flex flex-col gap-2">
                  {offered.map((j) => (
                    <WorkRow key={j.job_id} job={j} shopId={shopId} inTraining={inTraining} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {filtering ? "No offers match this search." : turnedDown.length ? "No open offers." : "No offers yet."}
                </p>
              )}
            </div>
            {turnedDown.length ? (
              <div data-turned-down>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">You said no ({turnedDown.length})</h3>
                <ul className="flex flex-col gap-2">
                  {turnedDown.map((j) => (
                    <WorkRow key={j.job_id} job={j} shopId={shopId} inTraining={inTraining} />
                  ))}
                </ul>
              </div>
            ) : null}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                You qualify, but it went to another shop or isn&apos;t matched yet ({others.length})
              </h3>
              {others.length ? (
                <ul className="flex flex-col gap-2">
                  {others.map((j) => (
                    <WorkRow key={j.job_id} job={j} shopId={shopId} inTraining={inTraining} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None{filtering ? " for this search" : ""}.</p>
              )}
            </div>
          </div>
        )}
      </Panel>

      {!empty ? (
        <Panel title="1 step away" icon={Check} id="one-step" testId="one-step-away">
          <p className="-mt-1 text-sm text-muted-foreground">
            Jobs your shop would qualify for with one more certificate or process.
          </p>
          {groups.length ? (
            <ul className="flex flex-col gap-1.5" data-readiness-lines>
              {groups.map((g) => (
                <li key={g.req.requirement} className="text-base font-semibold">
                  Get {reqLabel(g.req)} → qualify for {g.n} more job{g.n === 1 ? "" : "s"} worth{" "}
                  {fmtMoney(g.value, { compact: true })}
                </li>
              ))}
            </ul>
          ) : null}
          {oneStep.length ? (
            <ul className={cn("flex flex-col gap-2", loading && "opacity-60")}>
              {oneStep.map((j) => (
                <NearRow key={j.job_id} job={j} shopId={shopId} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {filtering ? "Nothing one step away matches this search." : "Nothing is one step away right now."}
            </p>
          )}
          {twoSteps.length ? (
            <Details summary={`Show ${twoSteps.length} jobs two steps away`} openSummary="Hide jobs two steps away">
              <ul className="flex flex-col gap-2">
                {twoSteps.map((j) => (
                  <NearRow key={j.job_id} job={j} shopId={shopId} />
                ))}
              </ul>
            </Details>
          ) : null}
        </Panel>
      ) : null}

      <Panel title="Open federal defence tenders" icon={Landmark} id="tenders" testId="tenders">
        <p className="-mt-1 text-sm text-muted-foreground">
          Real public notices from CanadaBuys for parts in your shop&apos;s categories, Ontario first. Notices where
          National Defence is buying equipment (a lathe, a milling machine) or off-the-shelf items are left out. Muster is not affiliated with
          CanadaBuys; bid through CanadaBuys.
          {filtering ? " Narrowed by your search." : ""}
        </p>
        {tenders.fits.length ? (
          <ul className="flex flex-col gap-2" data-tenders-fit>
            {tenders.fits.map((t) => (
              <TenderRow key={t.reference} t={t} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground" data-tenders-none>
            {!data
              ? "Loading…"
              : filtering
                ? "No open tenders for parts match this search."
                : "No open tenders for parts in your categories right now."}
          </p>
        )}
        {tenders.setAside.length ? (
          <Details
            storyHidden={false}
            summary={`Show ${tenders.setAside.length} left out (equipment or off-the-shelf items, not parts to make)`}
            openSummary="Hide the ones left out"
          >
            <ul className="flex flex-col gap-2">
              {tenders.setAside.map((t) => (
                <TenderRow key={t.reference} t={t} kind={t.kind} />
              ))}
            </ul>
          </Details>
        ) : null}
        <p className="text-xs text-muted-foreground" data-ogl>
          {data?.tenders_source ??
            "CanadaBuys open tender notices (Open Government Licence); sample retrieved 2026-09-26."}{" "}
          Contains information licensed under the{" "}
          <a
            href="https://open.canada.ca/en/open-government-licence-canada"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Open Government Licence – Canada
          </a>
          .
        </p>
      </Panel>
    </PortalPage>
  )
}
