"use client"

// /prime/suppliers: "Find suppliers" for Northgate (fictional). A plain-language search box,
// quick chips and filters over GET /search/shops (docs/api.md §7). Demo data answers in the
// browser; live mode asks the engine, which answers from Neo4j when it is loaded.

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, CircleCheck, Info, LoaderCircle, Lock, Search, SearchX, TriangleAlert, UserRoundX, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { PortalPage } from "@/components/portal/portal-page"
import { useWithParams } from "@/lib/ui/use-with-params"
import { useDemo } from "@/lib/data/store"
import { useAppActions } from "@/lib/app/actions-store"
import { fixtures } from "@/lib/api/fixtures"
import type { Job } from "@/lib/api/types"
import { useShopSearch } from "@/lib/search/client"
import { CITY_NAMES, SHOP_NAMES, fixtureShop } from "@/lib/search/local"
import { useReoffers } from "@/lib/search/reoffers"
import { shortShopName } from "@/lib/app/feed"
import {
  CERT_KEYS,
  COVERAGE_NOTE,
  PROCESS_KEYS,
  QUICK_CHIPS,
  DEFAULT_RADIUS_KM,
  RADIUS_OPTIONS,
  certFirst,
  describeFilters,
  nameHintScore,
  parseQuery,
  processPlain,
  type ParsedQuery,
} from "@/lib/search/labels"
import type { DndHistory, ShopSearchParams } from "@/lib/search/types"
import { EngineBadge } from "./engine-badge"
import { SearchExplainer } from "./search-explainer"
import { ShopResultCard, hasTrainingOnlyMatch, type OfferJob } from "./shop-result-card"

interface Filters {
  process: string[]
  cert: string[]
  near: string | null
  radius: number
  includePublic: boolean
  dnd: boolean
  q: string | null
}

const DEFAULT_CHIP = QUICK_CHIPS.find((c) => c.key === "cwb-welding")!
const INITIAL: Filters = {
  process: DEFAULT_CHIP.process,
  cert: DEFAULT_CHIP.cert,
  near: null,
  radius: DEFAULT_RADIUS_KM,
  includePublic: true,
  dnd: false,
  q: null,
}
const EMPTY: Filters = { ...INITIAL, process: [], cert: [] }

const selectCls =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring"

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

const noopSubscribe = () => () => {}
const readSearch = () => (typeof window === "undefined" ? "" : window.location.search)
const serverSearch = () => ""

/** ?job=NG-005 (from the phone's "Find another shop"). Hydration-safe, like useWithParams. */
function useJobParam(): string | null {
  usePathname() // re-read on navigation
  const search = React.useSyncExternalStore(noopSubscribe, readSearch, serverSearch)
  const v = new URLSearchParams(search).get("job")
  return v?.trim() ? v.trim() : null
}

// ---------------------------------------------------------------------------- URL state
// The search lives in the URL (?q=<typed text>&process=&cert=&near=&radius=&dnd=1&source=
// synthetic&name=<name search>), so a profile's Back button returns to the same results.
// No filter keys = the default "Certified welding (CWB)" chip.

const URL_KEYS = ["q", "name", "process", "cert", "near", "radius", "dnd", "source"] as const

function sameFilters(a: Filters, b: Filters): boolean {
  return (
    sameList(a.process, b.process) &&
    sameList(a.cert, b.cert) &&
    a.near === b.near &&
    (a.near ? a.radius === b.radius : true) &&
    a.includePublic === b.includePublic &&
    a.dnd === b.dnd &&
    (a.q ?? null) === (b.q ?? null)
  )
}

/** Filters (and the searched text) as URL params; null for the untouched default search. */
function toUrlParams(f: Filters, text: string): [string, string][] | null {
  if (!text && sameFilters(f, INITIAL)) return null
  const out: [string, string][] = []
  if (text) out.push(["q", text])
  if (f.q) out.push(["name", f.q])
  out.push(["process", f.process.join(",")], ["cert", f.cert.join(",")])
  if (f.near) out.push(["near", f.near], ["radius", String(f.radius)])
  if (f.dnd) out.push(["dnd", "1"])
  if (!f.includePublic) out.push(["source", "synthetic"])
  return out
}

/** Filters from the URL: explicit keys, or (only ?q=) the text read as a request. null: none. */
function fromUrl(search: string): { filters: Filters; text: string; parsed: ParsedQuery | null } | null {
  let p: URLSearchParams
  try {
    p = new URLSearchParams(search)
  } catch {
    return null
  }
  const text = (p.get("q") ?? "").trim().slice(0, 200)
  const explicit = p.has("process") || p.has("cert")
  if (!explicit && !text) return null
  const parsed = text ? parseQuery(text, CITY_NAMES, SHOP_NAMES) : null
  if (!explicit && parsed) {
    return {
      text,
      parsed,
      filters: {
        ...EMPTY,
        includePublic: parsed.includePublic ?? (p.get("source") === "synthetic" ? false : true),
        process: parsed.process,
        cert: parsed.cert,
        near: parsed.near,
        radius: parsed.radius_km ?? DEFAULT_RADIUS_KM,
        dnd: !!parsed.dnd_history,
        q: parsed.q,
      },
    }
  }
  const list = (k: string, allowed: readonly string[]) =>
    (p.get(k) ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter((x, i, a) => allowed.includes(x) && a.indexOf(x) === i)
  const nearRaw = (p.get("near") ?? "").trim().toLowerCase()
  const near = CITY_NAMES.find((c) => c.toLowerCase() === nearRaw) ?? null
  const r = Number(p.get("radius"))
  const name = (p.get("name") ?? "").trim().slice(0, 200)
  const filters: Filters = {
    process: list("process", PROCESS_KEYS),
    cert: list("cert", CERT_KEYS),
    near,
    radius: Number.isFinite(r) && r >= 1 && r <= 5000 ? Math.round(r) : DEFAULT_RADIUS_KM,
    includePublic: p.get("source") !== "synthetic",
    dnd: p.get("dnd") === "1" || p.get("dnd") === "true",
    q: name || null,
  }
  return { filters, text, parsed }
}

/** "Understood as" lines for a read request. */
function understoodFor(parsed: ParsedQuery): string[] {
  if (parsed.nameMatch) return parsed.recognised
  return parsed.q ? [`name or city contains "${parsed.q}"`] : parsed.recognised
}

const isClientSnapshot = () => true
const isServerSnapshot = () => false

/** A job's needs as search filters: its processes, its certificates, and security clearance when controlled. */
function jobFilters(job: Job): Filters {
  const cert = [...job.required_certs] as string[]
  if (job.controlled && !cert.includes("CGP")) cert.push("CGP")
  return { ...EMPTY, process: [...job.process_tags], cert }
}

/** "Fire-control sensor mounting bracket" from the full description. */
function jobTitle(job: Job): string {
  return job.description.split(",")[0].trim()
}

/**
 * The job named by ?job=, and the shop that said no to it (the one to replace).
 * Jobs come from the store (live or demo); the demo parts list is the fallback.
 */
function useJobContext(jobId: string | null) {
  const { jobs, offerStatus, assignments } = useDemo()
  const { decisions } = useAppActions()
  return React.useMemo(() => {
    if (!jobId) return null
    const want = jobId.toUpperCase()
    const job =
      jobs.find((j) => j.id.toUpperCase() === want) ??
      (fixtures.jobs.jobs as Job[]).find((j) => j.id.toUpperCase() === want) ??
      null
    if (!job) return { jobId, job: null, declinedBy: null, declinedName: null }
    const declines = Object.values(decisions)
      .filter((d) => d.job_id === job.id && d.decision === "declined")
      .sort((a, b) => (a.at < b.at ? 1 : -1))
    let declinedBy: string | null = declines[0]?.shop_id ?? null
    if (!declinedBy) {
      const k = Object.entries(offerStatus).find(([key, v]) => key.endsWith(`:${job.id}`) && v === "declined")
      declinedBy = k ? k[0].slice(0, k[0].length - job.id.length - 1) : null
    }
    const assigned = assignments.find((a) => a.job_id === job.id)
    const declinedName = declinedBy
      ? (assigned?.shop_id === declinedBy ? assigned.shop_name : null) ?? fixtureShop(declinedBy)?.name ?? declinedBy
      : null
    return { jobId, job, declinedBy, declinedName }
  }, [jobId, jobs, offerStatus, assignments, decisions])
}

export function SupplierSearch({ dnd }: { dnd: Record<string, DndHistory> }) {
  const wp = useWithParams()
  const [filters, setFilters] = React.useState<Filters>(INITIAL)
  const [text, setText] = React.useState("")
  const [understood, setUnderstood] = React.useState<string[] | null>(null)
  const [ignored, setIgnored] = React.useState<string[]>([])
  const [notice, setNotice] = React.useState<string | null>(null)
  const [rankHint, setRankHint] = React.useState<string | null>(null)
  // The text of the last search that was run (kept in the URL; `text` is the live input).
  const [searched, setSearched] = React.useState("")
  const router = useRouter()
  const reoffers = useReoffers()
  const { reofferJob } = useDemo()

  // Restore the search from the URL once, on the first client render (before the default
  // chip is kept): Back from a profile lands on the same results.
  const isClient = React.useSyncExternalStore(noopSubscribe, isClientSnapshot, isServerSnapshot)
  const [restored, setRestored] = React.useState<{ job: string | null } | null>(null)
  if (isClient && !restored) {
    const init = fromUrl(window.location.search)
    const job = new URLSearchParams(window.location.search).get("job")?.trim() || null
    setRestored({ job: init && job ? job : null })
    if (init) {
      setFilters(init.filters)
      setText(init.text)
      setSearched(init.text)
      const p = init.parsed
      if (p && p.q === init.filters.q && sameList(p.process, init.filters.process) && sameList(p.cert, init.filters.cert)) {
        setUnderstood(understoodFor(p))
        setIgnored(p.ignored)
        setNotice(p.notice)
        setRankHint(p.rankHint)
      }
    }
  }

  // "Find another shop" for a declined job: start from that job's needs, not the default chip.
  const jobParam = useJobParam()
  const [dismissedJob, setDismissedJob] = React.useState<string | null>(null)
  const ctx = useJobContext(jobParam && jobParam !== dismissedJob ? jobParam : null)
  const [appliedJob, setAppliedJob] = React.useState<string | null>(null)
  if (restored?.job && ctx?.job && appliedJob === null && restored.job.toUpperCase() === ctx.job.id.toUpperCase()) {
    // Back from a profile: the URL already has this job's (possibly adjusted) filters.
    setAppliedJob(ctx.job.id)
  } else if (restored && ctx?.job && appliedJob !== ctx.job.id) {
    // Adjust state while rendering (once per job id): React re-renders before painting.
    setAppliedJob(ctx.job.id)
    setFilters(jobFilters(ctx.job))
    setText("")
    setSearched("")
    setUnderstood(null)
    setIgnored([])
    setNotice(null)
    setRankHint(null)
  }
  const excluded = ctx?.job ? ctx.declinedBy : null
  // The job was already sent to another shop from here (or the phone): show it as sent.
  const sentTo = ctx?.job ? reoffers.get(ctx.job.id) ?? null : null
  const sentToCurrent = sentTo && sentTo.shop_id !== excluded ? sentTo : null

  // Mirror the search into the URL (replace, never push: Back leaves the page, not a filter).
  React.useEffect(() => {
    if (!restored) return
    try {
      const url = new URL(window.location.href)
      for (const k of URL_KEYS) url.searchParams.delete(k)
      for (const [k, v] of toUrlParams(filters, searched) ?? []) url.searchParams.set(k, v)
      const next = `${url.pathname}${url.search}${url.hash}`
      if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`)
        window.history.replaceState(window.history.state, "", next)
    } catch {
      /* URL unchanged: the search still works, Back just won't restore it */
    }
  }, [restored, filters, searched])

  const clearJob = () => {
    if (!jobParam) return
    setDismissedJob(jobParam)
    setAppliedJob(null)
    setFilters(INITIAL)
    setSearched("")
    setText("")
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete("job")
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    } catch {
      /* URL unchanged; the job is still dismissed for this visit */
    }
  }

  const params: ShopSearchParams = {
    q: filters.q,
    process: filters.process,
    cert: filters.cert,
    near: filters.near,
    radius_km: filters.near ? filters.radius : null,
    source: filters.includePublic ? "all" : "synthetic",
    dnd_history: filters.dnd ? true : null,
    limit: 25,
  }
  const { data, loading, error, origin } = useShopSearch(params, dnd)

  const set = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setUnderstood(null)
    setIgnored([])
    setNotice(null)
    if ("q" in patch) setRankHint(null)
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseQuery(text, CITY_NAMES, SHOP_NAMES)
    setSearched(text.trim())
    setNotice(parsed.notice)
    setRankHint(parsed.rankHint)
    if (!text.trim()) {
      setFilters(EMPTY)
      setUnderstood(null)
      setIgnored([])
      return
    }
    setFilters((f) => ({
      ...EMPTY,
      includePublic: parsed.includePublic ?? f.includePublic,
      process: parsed.process,
      cert: parsed.cert,
      near: parsed.near,
      radius: parsed.radius_km ?? (parsed.near ? DEFAULT_RADIUS_KM : f.radius),
      dnd: !!parsed.dnd_history,
      q: parsed.q,
    }))
    setUnderstood(understoodFor(parsed))
    setIgnored(parsed.ignored)
  }

  const applyChip = (key: string) => {
    const chip = QUICK_CHIPS.find((c) => c.key === key)
    if (!chip) return
    setText("")
    setSearched("")
    set({ process: chip.process, cert: chip.cert, q: null })
  }
  const activeChip = QUICK_CHIPS.find((c) => sameList(c.process, filters.process) && sameList(c.cert, filters.cert) && !filters.q)

  const summary = describeFilters(params)
  // Leave out the shop that said no, and list shops that only have a certificate in
  // training after the ones that hold it (stable: engine order otherwise).
  const results = React.useMemo(() => {
    if (!data) return []
    const rows = data.results.filter((r) => r.shop_id !== excluded)
    const training = rows.map((r) => hasTrainingOnlyMatch(r, data.query))
    // The request also looked like a name: shops whose names share two or more of its words first.
    const named = rows.map((r) => nameHintScore(rankHint, r.name))
    return rows
      .map((r, i) => ({ r, i, t: training[i] ? 1 : 0, n: named[i] }))
      .sort((a, b) => b.n - a.n || a.t - b.t || a.i - b.i)
      .map((x) => x.r)
  }, [data, excluded, rankHint])

  /** "Offer NG-005 to Tessellate": only for a declined job not yet sent on, and synthetic shops. */
  const offerFor = (shopId: string, name: string | null): OfferJob | null => {
    const job = ctx?.job
    if (!job || !excluded || sentToCurrent) return null
    const label = shortShopName(name) || shopId
    return {
      jobId: job.id,
      shopLabel: label,
      onOffer: async () => {
        const r = await reofferJob(job.id, shopId, name, excluded)
        if (!r) return false
        toast.success(`${job.id} offered to ${label}`, {
          description: "It's a new offer for them. Credit stays counted as placed (demo).",
          action: { label: "Northgate's desk", onClick: () => router.push(wp("/prime")) },
        })
        return true
      },
    }
  }
  const removed = data ? data.results.length - results.length : 0
  const counts = data?.counts
    ? {
        total: Math.max(0, data.counts.total - removed),
        synthetic: Math.max(0, data.counts.synthetic - removed),
        public: data.counts.public,
      }
    : null

  return (
    <PortalPage
      role="prime"
      desk="Northgate's desk"
      testId="find-suppliers"
      eyebrow="Northgate Land Systems (fictional defence company) · supplier development"
      title="Find suppliers"
      badges={data ? <EngineBadge engine={data.engine} origin={origin} /> : null}
      lede="Search small Canadian shops by what you need made. Demo shops are synthetic; real shops come from public data and are never sent work until they claim their profile."
    >
      <div className="-mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        <Link
          href={wp("/prime")}
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-slate-700 underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Northgate&apos;s desk
        </Link>
        <Link
          href={wp("/graph")}
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-slate-700 underline-offset-4 hover:underline"
        >
          See the supplier map →
        </Link>
      </div>

      {jobParam && jobParam !== dismissedJob && ctx ? (
        <section
          aria-label="Job to place"
          data-job-context={ctx.jobId}
          className="flex flex-col gap-2 rounded-xl border border-blocked/30 bg-blocked-soft p-4 sm:p-5"
        >
          {ctx.job ? (
            <>
              <p className="flex items-start gap-2 text-base font-semibold text-slate-900">
                <UserRoundX className="mt-0.5 size-5 shrink-0 text-blocked" aria-hidden />
                <span>
                  {ctx.declinedName ? `Replacing ${ctx.declinedName} on ` : "Finding a shop for "}
                  {ctx.job.id} · {jobTitle(ctx.job)}
                </span>
              </p>
              <p className="text-sm text-slate-800">
                {ctx.declinedName ? `${ctx.declinedName} said no to this job, so it's left out. ` : ""}
                Showing shops that do {ctx.job.process_tags.map((p) => processPlain(p).toLowerCase()).join(" + ")}
                {ctx.job.required_certs.length
                  ? ` and hold ${ctx.job.required_certs.map((c) => certFirst(c)).join(" + ")}`
                  : ""}
                .
              </p>
              {sentToCurrent ? (
                <p
                  role="status"
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-assigned/30 bg-assigned-soft px-3 py-2 text-sm text-slate-900"
                  data-reoffered-to={sentToCurrent.shop_id}
                >
                  <CircleCheck className="size-4 shrink-0 text-assigned" aria-hidden />
                  <span>
                    Offered to {shortShopName(sentToCurrent.shop_name) || sentToCurrent.shop_id}. It&apos;s a new offer for
                    them; credit stays counted as placed (demo).
                  </span>
                  <Link href={wp("/prime")} className="font-medium underline underline-offset-4">
                    Back to Northgate&apos;s desk
                  </Link>
                </p>
              ) : ctx.declinedName ? (
                <p className="text-sm text-slate-800">
                  Pick a demo shop below and use &ldquo;Offer {ctx.job.id}&rdquo; to send it the job.
                </p>
              ) : null}
              {ctx.job.controlled ? (
                <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-controlled/25 bg-controlled-soft px-2.5 py-0.5 text-xs font-medium text-controlled">
                  <Lock className="size-3.5" aria-hidden />
                  Controlled part: only shops with {certFirst("CGP")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-800">
              Couldn&apos;t find job {ctx.jobId} in Northgate&apos;s parts list. Showing the usual search.
            </p>
          )}
          <button
            type="button"
            onClick={clearJob}
            className="w-fit text-sm font-medium text-slate-700 underline underline-offset-4 hover:text-slate-900"
          >
            Search all shops instead
          </button>
        </section>
      ) : null}

      <section aria-labelledby="need-label" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-2" role="search">
          <label id="need-label" htmlFor="need" className="text-lg font-semibold tracking-tight">
            What do you need made?
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="need"
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. certified welding near London, or welding with past defence contracts"
              className="h-12 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring"
              autoComplete="off"
            />
            <button
              type="submit"
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-base font-semibold text-background hover:bg-foreground/90 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Search className="size-5" aria-hidden />
              Search
            </button>
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-2" aria-label="Quick searches">
          <span className="text-sm text-muted-foreground">Try:</span>
          {QUICK_CHIPS.map((c) => {
            const on = activeChip?.key === c.key
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => applyChip(c.key)}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
                  on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-background hover:bg-muted"
                )}
              >
                {c.label}
              </button>
            )
          })}
        </div>
        {understood ? (
          <div className="flex flex-col gap-1 text-sm text-slate-700" data-understood>
            <p>
              <span className="font-medium">Understood as: </span>
              {understood.length ? understood.join(" · ") : "everything (no filters)"}
            </p>
            {notice ? (
              <p className="flex items-start gap-1.5 text-amber-800" data-name-notice>
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{notice}.</span>
              </p>
            ) : null}
            {ignored.map((place) => (
              <p key={place} className="flex items-start gap-1.5 text-amber-800" data-ignored-place>
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  Couldn&apos;t use &ldquo;{place}&rdquo;: {COVERAGE_NOTE}.
                </span>
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside aria-label="Filters" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 lg:self-start">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Filters</h2>
            <button
              type="button"
              onClick={() => {
                setText("")
                setSearched("")
                setFilters(EMPTY)
                setUnderstood(null)
                setIgnored([])
                setNotice(null)
                setRankHint(null)
              }}
              className="text-sm font-medium text-slate-700 underline-offset-4 hover:underline"
            >
              Clear all
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Process
              <select
                className={selectCls}
                value={filters.process[0] ?? ""}
                onChange={(e) => set({ process: e.target.value ? [e.target.value] : [] })}
              >
                <option value="">Any process</option>
                {PROCESS_KEYS.map((p) => (
                  <option key={p} value={p}>
                    {processPlain(p)}
                  </option>
                ))}
              </select>
              {filters.process.length > 1 ? (
                <span className="text-xs font-normal text-muted-foreground">
                  Also: {filters.process.slice(1).map(processPlain).join(", ")}
                </span>
              ) : null}
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Certificate
              <select
                className={selectCls}
                value={filters.cert[0] ?? ""}
                onChange={(e) => set({ cert: e.target.value ? [e.target.value] : [] })}
              >
                <option value="">Any certificate</option>
                {CERT_KEYS.map((c) => (
                  <option key={c} value={c}>
                    {certFirst(c)}
                  </option>
                ))}
              </select>
              {filters.cert.length > 1 ? (
                <span className="text-xs font-normal text-muted-foreground">
                  Also: {filters.cert.slice(1).map(certFirst).join(", ")}
                </span>
              ) : null}
            </label>
            <div className="flex flex-col gap-1 text-sm font-medium">
              <span id="near-label">Near</span>
              <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
                <select
                  aria-labelledby="near-label"
                  className={selectCls}
                  value={filters.near ?? ""}
                  onChange={(e) => set({ near: e.target.value || null })}
                >
                  <option value="">Anywhere</option>
                  {CITY_NAMES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Radius"
                  className={selectCls}
                  value={filters.radius}
                  disabled={!filters.near}
                  onChange={(e) => set({ radius: Number(e.target.value) })}
                >
                  {(RADIUS_OPTIONS as readonly number[]).includes(filters.radius) ? null : (
                    <option value={filters.radius}>{filters.radius} km</option>
                  )}
                  {RADIUS_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r} km
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-slate-900"
                  checked={filters.includePublic}
                  onChange={(e) => set({ includePublic: e.target.checked })}
                />
                <span>
                  <span className="font-medium">Include real shops</span>
                  <span className="block text-xs text-muted-foreground">Public data — unverified — not affiliated</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-slate-900"
                  checked={filters.dnd}
                  onChange={(e) => set({ dnd: e.target.checked })}
                />
                <span>
                  <span className="font-medium">Has National Defence contract history</span>
                  <span className="block text-xs text-muted-foreground">Public record, matched by company name</span>
                </span>
              </label>
            </div>
          </div>
        </aside>

        <section aria-labelledby="results-title" aria-busy={loading} className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="results-title" className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
              {counts ? (
                <span data-result-count={counts.total}>
                  {counts.total} shop{counts.total === 1 ? "" : "s"} match
                </span>
              ) : (
                <span>Searching…</span>
              )}
              {loading ? <LoaderCircle className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Searching" /> : null}
            </h2>
            {counts ? (
              <p className="text-sm text-muted-foreground">
                {counts.synthetic} synthetic demo shop{counts.synthetic === 1 ? "" : "s"} · {counts.public} real shop
                {counts.public === 1 ? "" : "s"} (public data){summary ? ` · ${summary}` : ""}
                {counts.total > results.length ? ` · showing the top ${results.length}` : ""}
              </p>
            ) : null}
          </div>

          <p className="flex items-start gap-2 rounded-lg border border-public/25 bg-public-soft px-3 py-2 text-sm text-slate-800">
            <Info className="mt-0.5 size-4 shrink-0 text-public" aria-hidden />
            <span>
              Real shops were discovered in public data (Statistics Canada, company websites). They aren&apos;t sent
              work until they claim their profile. Only synthetic demo shops receive Northgate&apos;s demo offers.
            </span>
          </p>

          {error ? (
            <p role="alert" className="rounded-lg border border-blocked/30 bg-blocked-soft px-3 py-2 text-sm text-slate-800">
              {error}
            </p>
          ) : null}

          {data && results.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted px-6 py-12 text-center">
              <SearchX className="size-6 text-muted-foreground" aria-hidden />
              {filters.q ? (
                <>
                  <p className="text-lg font-semibold">No listed shop matches &ldquo;{filters.q}&rdquo;.</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    The name search looks at shop names and cities. Clear it to search by what you need made.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setText("")
                      setSearched("")
                      set({ q: null })
                    }}
                    className="inline-flex h-10 items-center gap-1.5 rounded-md border border-slate-300 bg-background px-3 text-sm font-medium hover:bg-muted"
                  >
                    <X className="size-4" aria-hidden />
                    Clear the name search
                  </button>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold">No shop has all of that yet.</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Try a wider radius, include real shops, or drop a certificate. When no shop qualifies for a job,
                    Northgate can pay to train workers so a shop does.
                  </p>
                  <button
                    type="button"
                    onClick={() => set({ near: null, dnd: false, includePublic: true })}
                    className="inline-flex h-10 items-center gap-1.5 rounded-md border border-slate-300 bg-background px-3 text-sm font-medium hover:bg-muted"
                  >
                    <X className="size-4" aria-hidden />
                    Widen the search
                  </button>
                </>
              )}
            </div>
          ) : null}

          <div className={cn("grid gap-4 xl:grid-cols-2", loading && "opacity-60 transition-opacity")}>
            {data
              ? results.map((s) => (
                  <ShopResultCard
                    key={s.shop_id}
                    shop={s}
                    query={data.query}
                    offer={s.source === "synthetic" ? offerFor(s.shop_id, s.name) : null}
                  />
                ))
              : null}
          </div>

          <SearchExplainer />
        </section>
      </div>
    </PortalPage>
  )
}
