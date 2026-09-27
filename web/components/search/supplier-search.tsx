"use client"

// /prime/suppliers: "Find suppliers" for Northgate (fictional). A plain-language search box,
// quick chips and filters over GET /search/shops (docs/api.md §7). Demo data answers in the
// browser; live mode asks the engine, which answers from Neo4j when it is loaded.

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, Info, LoaderCircle, Search, SearchX, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { PortalPage } from "@/components/portal/portal-page"
import { useWithParams } from "@/lib/ui/use-with-params"
import { useShopSearch } from "@/lib/search/client"
import { CITY_NAMES } from "@/lib/search/local"
import {
  CERT_KEYS,
  PROCESS_KEYS,
  QUICK_CHIPS,
  DEFAULT_RADIUS_KM,
  RADIUS_OPTIONS,
  certFirst,
  describeFilters,
  parseQuery,
  processPlain,
} from "@/lib/search/labels"
import type { DndHistory, ShopSearchParams } from "@/lib/search/types"
import { EngineBadge } from "./engine-badge"
import { SearchExplainer } from "./search-explainer"
import { ShopResultCard } from "./shop-result-card"

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

export function SupplierSearch({ dnd }: { dnd: Record<string, DndHistory> }) {
  const wp = useWithParams()
  const [filters, setFilters] = React.useState<Filters>(INITIAL)
  const [text, setText] = React.useState("")
  const [understood, setUnderstood] = React.useState<string[] | null>(null)

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
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseQuery(text, CITY_NAMES)
    if (!text.trim()) {
      setFilters(EMPTY)
      setUnderstood(null)
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
    setUnderstood(parsed.q ? [`name or city contains "${parsed.q}"`] : parsed.recognised)
  }

  const applyChip = (key: string) => {
    const chip = QUICK_CHIPS.find((c) => c.key === key)
    if (!chip) return
    setText("")
    set({ process: chip.process, cert: chip.cert, q: null })
  }
  const activeChip = QUICK_CHIPS.find((c) => sameList(c.process, filters.process) && sameList(c.cert, filters.cert) && !filters.q)

  const summary = describeFilters(params)
  const counts = data?.counts

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
          <p className="text-sm text-slate-700" data-understood>
            <span className="font-medium">Understood as: </span>
            {understood.length ? understood.join(" · ") : "everything (no filters)"}
          </p>
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
                setFilters(EMPTY)
                setUnderstood(null)
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
                {counts.total > (data?.results.length ?? 0) ? ` · showing the top ${data?.results.length}` : ""}
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

          {data && data.results.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted px-6 py-12 text-center">
              <SearchX className="size-6 text-muted-foreground" aria-hidden />
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
            </div>
          ) : null}

          <div className={cn("grid gap-4 xl:grid-cols-2", loading && "opacity-60 transition-opacity")}>
            {data?.results.map((s) => (
              <ShopResultCard key={s.shop_id} shop={s} query={data.query} />
            ))}
          </div>

          <SearchExplainer />
        </section>
      </div>
    </PortalPage>
  )
}
