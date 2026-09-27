"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, Building2, ExternalLink, Globe, Info, MapPin, Users } from "lucide-react"
import { useDemo } from "@/lib/data/store"
import { MATERIAL_LABEL, PROCESS_LABEL, fmtMoney } from "@/lib/format"
import { Skeleton } from "@/components/ui/skeleton"
import { CapabilitiesCard } from "./capabilities-card"
import { CertificationsCard } from "./certifications-card"
import { OfferInbox } from "./offer-inbox"
import { ReadinessCard } from "./readiness-card"
import { ShopHeader } from "./shop-header"
import { TrainingCard } from "./training-card"
import {
  fx,
  isPublicShopId,
  publicShopDetailFrom,
  type PublicShopDetail,
  type PublicShopExtras,
} from "@/lib/data/fixture-source"
import { ShopLabelBadge, certLabel } from "./badges"
import type { JobInfo, ShopDetail } from "./types"

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: "good" | "warn"
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4">
      <div className="text-sm text-zinc-500">{label}</div>
      <div
        className={
          "mt-1 text-3xl font-semibold tabular-nums tracking-tight " +
          (tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-zinc-900")
        }
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-sm text-zinc-500">{sub}</div>}
    </div>
  )
}

export function ShopView({ id }: { id: string }) {
  // Discovered public shops (pub-XXX) are listed but never routed: their page shows
  // capabilities, self-reported certs and provenance only (no offers/readiness/training).
  return isPublicShopId(id) ? <PublicShopView id={id} /> : <RoutableShopView id={id} />
}

function RoutableShopView({ id }: { id: string }) {
  const demo = useDemo()
  const { stage, mode, fundResults, jobs, blocked, offerStatus, setOfferStatus } = demo

  // Keep the latest loader in a ref so an unstable function identity never re-triggers the fetch.
  const getShopRef = useRef(demo.getShop)
  useEffect(() => {
    getShopRef.current = demo.getShop
  })

  const fundKey = Object.keys(fundResults ?? {}).sort().join(",")
  const fetchKey = `${id}|${stage}|${mode}|${fundKey}`
  const [result, setResult] = useState<{ key: string; data?: ShopDetail; error?: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    getShopRef
      .current(id)
      .then((data) => {
        if (!cancelled) setResult({ key: fetchKey, data })
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setResult((prev) => ({
            key: fetchKey,
            data: prev?.data,
            error: e instanceof Error ? e.message : String(e),
          }))
      })
    return () => {
      cancelled = true
    }
  }, [id, fetchKey])

  const data = result?.data && result.data.shop.id === id ? result.data : undefined

  const newJobIds = useMemo(() => {
    const s = new Set<string>()
    for (const r of Object.values(fundResults ?? {})) {
      for (const j of r?.unblocked_jobs ?? []) s.add(j.job_id)
    }
    return s
  }, [fundResults])

  const jobInfo = useMemo(() => {
    const m: Record<string, JobInfo> = {}
    for (const j of jobs ?? []) m[j.id] = { part_no: j.part_no, description: j.description, value_cad: j.est_value_cad }
    for (const b of blocked ?? [])
      m[b.job_id] ??= { part_no: b.part_no, description: b.description, value_cad: b.value_cad }
    return m
  }, [jobs, blocked])

  if (!data) {
    if (result?.error) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-5 text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden />
            Could not load shop “{id}”
          </div>
          <p className="mt-1 text-sm">{result.error}</p>
          <Link href="/network" className="mt-3 inline-block text-sm font-medium underline">
            Back to the network
          </Link>
        </div>
      )
    }
    return (
      <div className="space-y-6" aria-busy>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-12">
          <Skeleton className="h-96 lg:col-span-7" />
          <Skeleton className="h-96 lg:col-span-5" />
        </div>
      </div>
    )
  }

  const { shop, certifications, offers, readiness, training } = data
  const routed = stage === "routed" || stage === "funded" || offers.length > 0
  const offeredValue = offers.reduce((s, o) => s + o.value_cad, 0)
  const creditValue = offers.reduce((s, o) => s + o.credit_cad, 0)
  const readinessValue = readiness.reduce((s, r) => s + (r.value_cad ?? 0), 0)
  const readinessJobs = readiness.reduce((s, r) => s + (r.jobs_unlocked?.length ?? 0), 0)
  const funded = training.filter((t) => t.status === "funded")
  const trainees = funded.reduce((s, t) => s + (t.trainees ?? 0), 0)
  const newCount = offers.filter((o) => newJobIds.has(o.job_id)).length

  return (
    <div className="space-y-8">
      <ShopHeader shop={shop} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Defence work offered"
          value={fmtMoney(offeredValue, { compact: true })}
          sub={
            `${offers.length} job${offers.length === 1 ? "" : "s"}` +
            (newCount > 0 ? ` · ${newCount} new after training` : "")
          }
        />
        <Stat
          label="ITB credit it earns the prime"
          value={fmtMoney(creditValue, { compact: true })}
          sub={shop.is_sme ? "Small or mid-sized enterprise (SME): work counts 2x" : "Counts 1x (not an SME)"}
        />
        <Stat
          label="Within reach"
          value={fmtMoney(readinessValue, { compact: true })}
          sub={`${readinessJobs} more job${readinessJobs === 1 ? "" : "s"} one step away`}
          tone={readinessValue > 0 ? "warn" : undefined}
        />
        <Stat
          label="Workers in training"
          value={String(trainees)}
          sub={funded.length > 0 ? "Funded by the prime" : "None funded yet"}
          tone={trainees > 0 ? "good" : undefined}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <OfferInbox
            offers={offers}
            shopId={shop.id}
            newJobIds={newJobIds}
            offerStatus={offerStatus ?? {}}
            onDecide={(jobId, status) => setOfferStatus(shop.id, jobId, status)}
            routed={routed}
          />
        </div>
        <div className="space-y-6 lg:col-span-5">
          <ReadinessCard items={readiness} jobInfo={jobInfo} training={training} routed={routed} />
          <TrainingCard training={training} />
        </div>
      </div>

      <CertificationsCard certifications={certifications} shopId={shop.id} />
      <CapabilitiesCard shop={shop} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Discovered public shop (pub-XXX): a real company found in public data. Shown as a
// profile only: capabilities, self-reported certifications with their sources, and
// provenance. It is not onboarded, so it gets no offers, readiness or training, and it
// is never presented as a customer or partner.

const SELF_REPORTED = "Self-reported on company website (unverified)"

const PROVENANCE_FIELD: Record<string, string> = {
  name: "Company name",
  lat_lon: "Location",
  city: "City",
  processes: "Processes",
  materials: "Materials",
  machines: "Machines",
  naics: "Industry code (NAICS)",
  employee_band: "Employees",
  is_sme: "SME status",
  website: "Website",
}

const CONFIDENCE_LABEL: Record<string, string> = {
  "website-self-reported": "Company website (self-reported)",
  search: "Web search / geocoder (approximate)",
  odbus: "Statistics Canada ODBus (Open Government Licence)",
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

function provenanceField(field: string): string {
  if (field.startsWith("certifications.")) return certLabel(field.slice("certifications.".length))
  return PROVENANCE_FIELD[field] ?? field.replace(/_/g, " ")
}

function SourceLink({ url, children }: { url: string; children?: ReactNode }) {
  // Some sources are datasets, not web pages (e.g. "data/processed/candidates.csv (StatCan ODBus, OGL)").
  if (!/^https?:\/\//.test(url)) return <span className="text-sm break-words text-zinc-600">{url}</span>
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex max-w-full items-center gap-1 break-all text-sm font-medium text-sky-800 underline decoration-sky-300 underline-offset-2 hover:text-sky-950"
    >
      {children ?? hostOf(url)}
      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
    </a>
  )
}

function DiscoveredBadge({ className }: { className?: string }) {
  return (
    <span
      className={
        "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-public/25 bg-public-soft px-2.5 text-xs font-medium text-public " +
        (className ?? "")
      }
      title="Discovered from public data: unverified, not affiliated, not onboarded"
    >
      <Globe className="size-3.5" aria-hidden />
      Discovered · unverified
    </span>
  )
}

function ClaimButton() {
  const tip = "Profile claiming is on our roadmap"
  return (
    <span className="group relative inline-flex" tabIndex={0} aria-describedby="claim-tip" title={tip}>
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="inline-flex h-9 cursor-not-allowed items-center rounded-lg border border-zinc-200 bg-zinc-100 px-4 text-sm font-medium text-zinc-500"
      >
        Claim this profile
      </button>
      <span
        id="claim-tip"
        role="tooltip"
        className="pointer-events-none absolute top-full left-0 z-20 sm:right-0 sm:left-auto mt-2 w-max max-w-[16rem] rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 group-focus:opacity-100"
      >
        {tip}
      </span>
    </span>
  )
}

function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <header className="border-b border-zinc-100 px-5 py-4 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-zinc-500">{sub}</p>}
      </header>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  )
}

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-zinc-500">{empty}</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <span
          key={t}
          className="inline-flex h-7 items-center rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-sm text-zinc-800"
        >
          {t}
        </span>
      ))}
    </div>
  )
}

function PublicShopView({ id }: { id: string }) {
  const demo = useDemo()
  const getShopsRef = useRef(demo.getShops)
  useEffect(() => {
    getShopsRef.current = demo.getShops
  })
  const [result, setResult] = useState<{ id: string; data?: PublicShopDetail; error?: string } | null>(null)

  // The GET /shops entry carries everything a public profile shows (cert sources included),
  // so the page is built from the list in both modes. An engine without public shops falls
  // back to the bundled public-data fixture.
  useEffect(() => {
    let cancelled = false
    getShopsRef
      .current()
      .then((r) => {
        const entry = r.shops.find((s) => s.id === id)
        const data = entry ? publicShopDetailFrom(entry) : fx<PublicShopDetail>("GET", `/shops/${id}`)
        if (cancelled) return
        setResult(data ? { id, data } : { id, error: "No discovered shop has this id." })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const data = fx<PublicShopDetail>("GET", `/shops/${id}`)
        setResult(data ? { id, data } : { id, error: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [id, demo.mode])

  const data = result?.id === id ? result.data : undefined

  if (!data) {
    if (result?.id === id && result.error) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-5 text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden />
            Could not load shop “{id}”
          </div>
          <p className="mt-1 text-sm">{result.error}</p>
          <Link href="/network" className="mt-3 inline-block text-sm font-medium underline">
            Back to the network
          </Link>
        </div>
      )
    }
    return (
      <div className="space-y-6" aria-busy>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-16" />
        <div className="grid gap-6 lg:grid-cols-12">
          <Skeleton className="h-72 lg:col-span-7" />
          <Skeleton className="h-72 lg:col-span-5" />
        </div>
      </div>
    )
  }

  const shop = data.shop as PublicShopDetail["shop"] & PublicShopExtras
  const provenance = shop.provenance ?? []
  const sourceFor = (field: string) => provenance.find((p) => p.field === field && p.source_url)?.source_url ?? null
  const claimed = data.certifications.filter((c) => c.status !== "unknown")
  const leads = data.certifications.filter((c) => c.status === "unknown" && c.source_url)
  const notStated = data.certifications.filter((c) => c.status === "unknown" && !c.source_url)
  const processes = (shop.processes ?? []).map((p) => PROCESS_LABEL[p] ?? p)
  const materials = (shop.materials ?? []).map((m) => MATERIAL_LABEL[m] ?? m)
  const machines = shop.machines ?? []
  const notes = (shop.notes ?? "")
    .split(";")
    .map((n) => n.trim())
    .filter(Boolean)
  const smeSource = provenance.find((p) => p.field === "employee_band" || p.field === "is_sme")
  const fromOdbus = (field: string) => provenance.some((p) => p.field === field && p.confidence === "odbus")

  return (
    <div className="space-y-6 sm:space-y-8" data-shop-kind="discovered">
      <header className="space-y-3">
        <Link href="/network" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800">
          <ArrowLeft className="size-3.5" aria-hidden />
          Network
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight break-words text-zinc-900 sm:text-4xl">{shop.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <DiscoveredBadge />
              <ShopLabelBadge source="public" label={shop.label} />
            </div>
          </div>
          <ClaimButton />
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-zinc-600">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4 text-zinc-400" aria-hidden />
            {shop.city}, ON
          </span>
          {shop.naics && (
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-4 text-zinc-400" aria-hidden />
              NAICS {shop.naics}
              <span className="text-zinc-400">{fromOdbus("naics") ? "(StatCan ODBus)" : "(estimated)"}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4 text-zinc-400" aria-hidden />
            {shop.employee_band
              ? `${shop.employee_band} employees ${fromOdbus("employee_band") ? "(StatCan ODBus)" : "(estimated)"}`
              : "Size not stated"}
          </span>
          {shop.website && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Globe className="size-4 shrink-0 text-zinc-400" aria-hidden />
              <SourceLink url={shop.website} />
            </span>
          )}
        </div>
      </header>

      <div
        role="note"
        className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3.5 text-sm text-sky-950 sm:px-5"
      >
        <Info className="mt-0.5 size-4 shrink-0 text-sky-700" aria-hidden />
        <p>
          <span className="font-semibold">Not onboarded: no offers, readiness or training.</span>{" "}
          This company was discovered in public data and is not affiliated with Muster or Northgate. It is not
          offered work until it claims and verifies its profile.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Card title="Capabilities" sub="As described on the company's own website. Unverified.">
            <dl className="space-y-5">
              <div className="space-y-2">
                <dt className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-zinc-700">
                  Processes
                  {sourceFor("processes") && (
                    <span className="text-xs font-normal text-zinc-500">
                      Source: <SourceLink url={sourceFor("processes")!} />
                    </span>
                  )}
                </dt>
                <dd>
                  <Chips items={processes} empty="No processes stated." />
                </dd>
              </div>
              <div className="space-y-2">
                <dt className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-zinc-700">
                  Materials
                  {sourceFor("materials") && (
                    <span className="text-xs font-normal text-zinc-500">
                      Source: <SourceLink url={sourceFor("materials")!} />
                    </span>
                  )}
                </dt>
                <dd>
                  <Chips items={materials} empty="Not stated on the company website." />
                </dd>
              </div>
              <div className="space-y-2">
                <dt className="text-sm font-medium text-zinc-700">Machines</dt>
                <dd>
                  <Chips items={machines} empty="Not stated on the company website." />
                </dd>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-zinc-200 px-4 py-3">
                  <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Size</dt>
                  <dd className="mt-1 text-sm text-zinc-900">
                    {shop.is_sme ? "Small or mid-sized (estimated)" : "Not an SME (estimated)"}
                    {smeSource?.confidence === "search" && (
                      <div className="text-xs text-zinc-500">From web search; not confirmed by the company</div>
                    )}
                  </dd>
                </div>
                <div className="rounded-lg border border-zinc-200 px-4 py-3">
                  <dt className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
                    Capacity and lead time
                  </dt>
                  <dd className="mt-1 text-sm text-zinc-900">
                    Unknown
                    <div className="text-xs text-zinc-500">Shared by the shop when it claims its profile</div>
                  </dd>
                </div>
              </div>
            </dl>
          </Card>
        </div>

        <div className="lg:col-span-5">
          <Card
            title="Certifications"
            sub="What the company says about itself. Muster has not verified any of it."
          >
            {claimed.length === 0 ? (
              <p className="text-sm text-zinc-600">No certifications stated on the company website.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {claimed.map((c) => {
                  const note = c.note && c.note !== SELF_REPORTED ? c.note : null
                  return (
                    <li key={c.type} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                      <div className="font-medium text-zinc-900">{certLabel(c.type)}</div>
                      <div className="inline-flex items-center rounded-full border border-dashed border-sky-300 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-900">
                        {note && !note.startsWith("Self-reported") ? "Listed in a public directory (unverified)" : SELF_REPORTED}
                      </div>
                      {note && <p className="text-xs text-zinc-500">{note}</p>}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                        {c.source_url ? <SourceLink url={c.source_url} /> : <span>No source link</span>}
                        {c.verified_at && <span>read {c.verified_at}</span>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {leads.length > 0 && (
              <div className="mt-5 space-y-2 border-t border-zinc-100 pt-4">
                <div className="text-sm font-medium text-zinc-700">Unconfirmed mentions</div>
                <ul className="space-y-2">
                  {leads.map((c) => (
                    <li key={c.type} className="text-sm text-zinc-600">
                      <span className="font-medium text-zinc-800">{certLabel(c.type)}:</span> {c.note}{" "}
                      <SourceLink url={c.source_url!} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {notStated.length > 0 && (
              <p className="mt-5 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
                Not publicly stated: {notStated.map((c) => certLabel(c.type)).join(", ")}. CPCSC Level 1 is
                self-assessed with no public registry, so only the shop can declare it.
              </p>
            )}
          </Card>
        </div>
      </div>

      <Card
        title="Where this profile comes from"
        sub="Every field keeps its source. Muster stores facts only: no drawings, no personal names, no contact details."
      >
        <ul className="divide-y divide-zinc-100 text-sm">
          {provenance.map((p, i) => (
            <li key={`${p.field}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
              <span className="font-medium text-zinc-800">{provenanceField(p.field)}</span>
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-zinc-600">
                {CONFIDENCE_LABEL[p.confidence] ?? p.confidence}
                {p.source_url && <SourceLink url={p.source_url} />}
              </span>
            </li>
          ))}
        </ul>
        {notes.length > 0 && (
          <div className="mt-4 rounded-lg bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
            <span className="font-medium text-zinc-700">Notes: </span>
            {notes.join("; ")}.
          </div>
        )}
        <p className="mt-4 text-xs text-zinc-500">
          Base list: Statistics Canada Open Database of Businesses (Open Government Licence – Canada), plus each
          company&apos;s own website. {shop.label}.
        </p>
      </Card>
    </div>
  )
}
