"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, ChevronRight, Globe, Info, Search, X } from "lucide-react"
import { useDemo } from "@/lib/data/store"
import { isDiscovered, type PublicShopExtras } from "@/lib/data/fixture-source"
import { PROCESS_LABEL } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { CertChip, ShopLabelBadge, certLabel, certShortLabel, certStatusMeta } from "./badges"
import type { ListShop } from "./types"

const KEY_CERTS = ["CGP", "CWB_W47.1", "AS9100", "ISO9001"] as const
const CERT_ORDER = [
  "CGP",
  "CWB_W47.1",
  "AS9100",
  "ISO9001",
  "CPCSC_L1",
  "NADCAP:HEAT_TREAT",
  "NADCAP:CHEM_PROCESSING",
  "NADCAP:COATINGS",
]
type SourceFilter = "all" | "synthetic" | "public"
type Row = ListShop & PublicShopExtras & { discovered: boolean }

const DISCOVERED_BANNER =
  "Discovered shops come from Statistics Canada ODBus (OGL) and each company's own website; unverified, not affiliated, not yet onboarded — they are not offered work until they claim and verify their profile."

function certStatus(shop: ListShop, type: string): string {
  return shop.cert_summary?.find((c) => c.type === type)?.status ?? "unknown"
}

function hasCert(shop: ListShop, type: string): boolean {
  return certStatusMeta(certStatus(shop, type)).counts
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  )
}

/** Discovered-shop badge: real company from public data, not onboarded, never routed. */
function DiscoveredBadge({ label }: { label?: string | null }) {
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-public/25 bg-public-soft px-2 text-[11px] font-medium text-public"
      title={`${label || "Public data — unverified — not affiliated"}. Not onboarded: not offered work.`}
    >
      <Globe className="size-3" aria-hidden />
      Discovered · unverified
    </span>
  )
}

/** Cert chip for a discovered shop: same colours, but a claim is "self-reported". */
function SelfReportedChip({ type, status }: { type: string; status: string }) {
  const meta = certStatusMeta(status)
  const claimed = status !== "unknown"
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-medium",
        meta.className,
        "border-dashed"
      )}
      title={`${certLabel(type)}: ${claimed ? "self-reported on company website (unverified)" : "not publicly stated"}`}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
      {certShortLabel(type)}
    </span>
  )
}

function ShopBadges({ s, demoShopId }: { s: Row; demoShopId: string | null | undefined }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      {s.discovered ? (
        <>
          <DiscoveredBadge label={s.label} />
          <span className="text-[11px] text-zinc-500">Not affiliated</span>
        </>
      ) : (
        <ShopLabelBadge source={s.source} label={s.label} className="h-5 px-2 text-[11px]" />
      )}
      {s.id === demoShopId && <span className="text-[11px] font-medium text-[#B42318]">Demo shop</span>}
    </div>
  )
}

function CertChips({ s }: { s: Row }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {KEY_CERTS.map((t) =>
        s.discovered ? (
          <SelfReportedChip key={t} type={t} status={certStatus(s, t)} />
        ) : (
          <CertChip key={t} type={t} status={certStatus(s, t)} />
        )
      )}
    </div>
  )
}

const selectCls =
  "h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus-visible:ring-3 focus-visible:ring-zinc-500"

export function NetworkView() {
  const demo = useDemo()
  const router = useRouter()
  const getShopsRef = useRef(demo.getShops)
  useEffect(() => {
    getShopsRef.current = demo.getShops
  })

  const [state, setState] = useState<{ shops?: ListShop[]; error?: string } | null>(null)
  const [query, setQuery] = useState("")
  const [city, setCity] = useState("all")
  const [procFilter, setProcFilter] = useState("all")
  const [certFilter, setCertFilter] = useState("all")
  const [source, setSource] = useState<SourceFilter>("all")

  useEffect(() => {
    let cancelled = false
    getShopsRef
      .current()
      .then((r) => {
        if (!cancelled) setState({ shops: r.shops })
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ error: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [demo.mode])

  const shops = useMemo<Row[]>(
    () => (state?.shops ?? []).map((s) => ({ ...(s as Row), discovered: isDiscovered(s as Row) })),
    [state]
  )
  // The routable network: onboarded shops (the synthetic demo network). Discovered shops
  // are listed for discovery only, so the network stats and demo numbers leave them out.
  const onboarded = useMemo(() => shops.filter((s) => !s.discovered), [shops])
  const cities = useMemo(() => [...new Set(shops.map((s) => s.city))].sort(), [shops])
  const processes = useMemo(
    () =>
      [...new Set(shops.flatMap((s) => s.processes))].sort((a, b) =>
        (PROCESS_LABEL?.[a] ?? a).localeCompare(PROCESS_LABEL?.[b] ?? b)
      ),
    [shops]
  )
  const certTypes = useMemo(() => {
    const present = new Set(shops.flatMap((s) => (s.cert_summary ?? []).filter((c) => certStatusMeta(c.status).counts).map((c) => c.type as string)))
    return CERT_ORDER.filter((t) => present.has(t))
  }, [shops])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return shops
      .filter((s) => source === "all" || (source === "public" ? s.discovered : !s.discovered))
      .filter((s) => city === "all" || s.city === city)
      .filter((s) => procFilter === "all" || (s.processes as string[]).includes(procFilter))
      .filter((s) => certFilter === "all" || hasCert(s, certFilter))
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.city.toLowerCase().includes(q) ||
          s.processes.some((p) => (PROCESS_LABEL?.[p] ?? p).toLowerCase().includes(q))
      )
      .sort((a, b) => Number(a.discovered) - Number(b.discovered) || a.name.localeCompare(b.name))
  }, [shops, query, city, procFilter, certFilter, source])

  const nOnboarded = onboarded.length
  const nDiscovered = shops.length - nOnboarded
  const nSme = onboarded.filter((s) => s.is_sme).length
  const nCgp = onboarded.filter((s) => hasCert(s, "CGP")).length
  const totalHours = onboarded.reduce((s, x) => s + (x.capacity_hours_week ?? 0), 0)
  const onboardedCities = new Set(onboarded.map((s) => s.city)).size
  const filtersActive =
    query !== "" || city !== "all" || procFilter !== "all" || certFilter !== "all" || source !== "all"
  const sourceOptions: { key: SourceFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: shops.length },
    { key: "synthetic", label: "Synthetic demo network", count: nOnboarded },
    { key: "public", label: "Discovered from public data", count: nDiscovered },
  ]
  const clearFilters = () => {
    setQuery("")
    setCity("all")
    setProcFilter("all")
    setCertFilter("all")
    setSource("all")
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">Network</h1>
        <p className="max-w-3xl text-base text-zinc-600">
          {shops.length > 0 && nDiscovered === 0 ? (
            <>
              Illustrative network of {nOnboarded} synthetic shops modelled on southwestern Ontario manufacturers.
              Real ODBus-listed firms would appear with a “Public data — unverified” badge.
            </>
          ) : (
            <>
              The synthetic demo network Muster routes work to, plus real southwestern Ontario manufacturers
              discovered in public data. Discovered shops are listed only: they are never offered work.
            </>
          )}
        </p>
        {shops.length > 0 && nDiscovered > 0 && (
          <p className="text-sm tabular-nums text-zinc-500" data-testid="source-counts">
            {nOnboarded} synthetic · {nDiscovered} discovered
          </p>
        )}
      </header>

      {state?.error && !state.shops ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-5 text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden />
            Could not load shops
          </div>
          <p className="mt-1 text-sm">{state.error}</p>
        </div>
      ) : !state ? (
        <div className="space-y-4" aria-busy>
          <div className="grid gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-[480px]" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Shops in network"
              value={String(nOnboarded)}
              sub={
                `${onboardedCities} cities` +
                (nDiscovered > 0 ? ` · +${nDiscovered} discovered, not routed` : "")
              }
            />
            <Stat
              label="Small and medium-sized"
              value={String(nSme)}
              sub="SME direct work earns the prime 2x credit"
            />
            <Stat label="Controlled Goods (CGP)" value={String(nCgp)} sub="Can take controlled jobs" />
            <Stat
              label="Weekly capacity"
              value={`${totalHours.toLocaleString("en-CA")} h`}
              sub="Shop hours per week, all processes"
            />
          </div>

          {nDiscovered > 0 && (
            <div
              role="note"
              data-testid="discovered-banner"
              className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3.5 text-sm text-sky-950 sm:px-5"
            >
              <Info className="mt-0.5 size-4 shrink-0 text-sky-700" aria-hidden />
              <p>{DISCOVERED_BANNER}</p>
            </div>
          )}

          <section className="rounded-xl border border-zinc-200 bg-white">
            <div className="space-y-3 border-b border-zinc-100 px-4 py-4 sm:px-5">
              {nDiscovered > 0 && nOnboarded > 0 && (
                <div
                  className="flex flex-wrap gap-1 rounded-lg border border-zinc-200 p-0.5 sm:inline-flex"
                  role="group"
                  aria-label="Source"
                >
                  {sourceOptions.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setSource(o.key)}
                      aria-pressed={source === o.key}
                      className={cn(
                        "min-h-8 rounded-md px-3 py-1 text-left text-sm font-medium transition-colors",
                        source === o.key ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
                      )}
                    >
                      {o.label}{" "}
                      <span className={cn("tabular-nums", source === o.key ? "text-zinc-300" : "text-zinc-400")}>
                        {o.count}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative w-full sm:w-auto">
                  <span className="sr-only">Search shops</span>
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
                    aria-hidden
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name, city, process"
                    className={cn(selectCls, "w-full pl-9 sm:w-60")}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-600">
                  City
                  <select className={selectCls} value={city} onChange={(e) => setCity(e.target.value)}>
                    <option value="all">All cities</option>
                    {cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-600">
                  Process
                  <select
                    className={cn(selectCls, "max-w-[11rem]")}
                    value={procFilter}
                    onChange={(e) => setProcFilter(e.target.value)}
                  >
                    <option value="all">All processes</option>
                    {processes.map((p) => (
                      <option key={p} value={p}>
                        {PROCESS_LABEL?.[p] ?? p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-600">
                  Certification
                  <select
                    className={cn(selectCls, "max-w-[11rem]")}
                    value={certFilter}
                    onChange={(e) => setCertFilter(e.target.value)}
                    title="Verified, declared or in training; for discovered shops, self-reported"
                  >
                    <option value="all">Any</option>
                    {certTypes.map((t) => (
                      <option key={t} value={t}>
                        {certLabel(t)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="ml-auto flex items-center gap-3 text-sm tabular-nums text-zinc-500">
                  {filtersActive && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="inline-flex items-center gap-1 text-zinc-600 hover:text-zinc-900"
                    >
                      <X className="size-3.5" aria-hidden />
                      Clear
                    </button>
                  )}
                  <span data-testid="showing-count">
                    Showing {filtered.length} of {shops.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Phone: one card per shop. */}
            <ul className="divide-y divide-zinc-100 md:hidden" data-testid="shop-cards">
              {filtered.map((s) => {
                const href = `/shops/${encodeURIComponent(s.id)}`
                return (
                  <li key={s.id} data-shop-row={s.discovered ? "discovered" : "onboarded"}>
                    <Link
                      href={href}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3.5 hover:bg-zinc-50",
                        s.id === demo.demoShopId && "bg-rose-50/40"
                      )}
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="font-medium break-words text-zinc-900">{s.name}</div>
                        <ShopBadges s={s} demoShopId={demo.demoShopId} />
                        <div className="text-xs text-zinc-600">
                          {s.city} ·{" "}
                          {s.processes.map((p) => PROCESS_LABEL?.[p] ?? p).join(", ") || "Processes not stated"}
                        </div>
                        <CertChips s={s} />
                      </div>
                      <ChevronRight className="mt-1 size-4 shrink-0 text-zinc-300" aria-hidden />
                    </Link>
                  </li>
                )
              })}
              {filtered.length === 0 && (
                <li className="px-4 py-12 text-center text-sm text-zinc-500">No shops match these filters.</li>
              )}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1080px] text-sm" data-testid="shop-table">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                    <th className="px-5 py-3">Shop</th>
                    <th className="px-3 py-3">City</th>
                    <th className="px-3 py-3">Size</th>
                    <th className="px-3 py-3">Processes</th>
                    <th className="px-3 py-3">Key certifications</th>
                    <th className="px-3 py-3 text-right">Capacity</th>
                    <th className="w-8 px-3 py-3" aria-label="Open" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filtered.map((s) => {
                    const href = `/shops/${encodeURIComponent(s.id)}`
                    const shown = s.processes.slice(0, 3)
                    const more = s.processes.length - shown.length
                    return (
                      <tr
                        key={s.id}
                        data-shop-row={s.discovered ? "discovered" : "onboarded"}
                        onClick={() => router.push(href)}
                        className={cn(
                          "cursor-pointer align-middle transition-colors hover:bg-zinc-50",
                          s.id === demo.demoShopId && "bg-rose-50/40"
                        )}
                      >
                        <td className="px-5 py-3.5">
                          <Link
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="block font-medium text-zinc-900 hover:underline"
                          >
                            {s.name}
                          </Link>
                          <ShopBadges s={s} demoShopId={demo.demoShopId} />
                        </td>
                        <td className="px-3 py-3.5 text-zinc-700">{s.city}</td>
                        <td className="px-3 py-3.5">
                          {s.discovered ? (
                            <span className="text-zinc-600" title="Estimated from public data">
                              {s.is_sme ? "SME (est.)" : "Non-SME (est.)"}
                            </span>
                          ) : s.is_sme ? (
                            <span className="font-medium text-emerald-700">SME</span>
                          ) : (
                            <span className="text-zinc-500">Non-SME</span>
                          )}
                          <div className="text-xs text-zinc-600">{s.employee_band ?? "—"}</div>
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex max-w-[300px] flex-wrap gap-1.5">
                            {shown.map((p) => (
                              <span
                                key={p}
                                className="inline-flex h-6 items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 text-xs text-zinc-700"
                              >
                                {PROCESS_LABEL?.[p] ?? p}
                              </span>
                            ))}
                            {more > 0 && (
                              <span
                                className="inline-flex h-6 items-center px-1 text-xs text-zinc-500"
                                title={s.processes.slice(3).map((p) => PROCESS_LABEL?.[p] ?? p).join(", ")}
                              >
                                +{more}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <CertChips s={s} />
                        </td>
                        <td className="px-3 py-3.5 text-right tabular-nums">
                          {s.discovered || s.capacity_hours_week == null ? (
                            <span className="text-xs text-zinc-500" title="Shared when the shop claims its profile">
                              Not onboarded
                            </span>
                          ) : (
                            <>
                              <span className="font-medium text-zinc-900">{s.capacity_hours_week}</span>
                              <span className="text-zinc-500"> h/wk</span>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-zinc-300">
                          <ChevronRight className="size-4" aria-hidden />
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-sm text-zinc-500">
                        No shops match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-100 bg-zinc-50/60 px-4 py-3 text-xs text-zinc-500 sm:px-5">
              <span className="font-medium text-zinc-600">Certification colours:</span>
              {(["verified", "declared", "pending_training", "unknown"] as const).map((st) => {
                const m = certStatusMeta(st)
                return (
                  <span key={st} className="inline-flex items-center gap-1.5">
                    <span className={cn("size-2 rounded-full", m.dot)} aria-hidden />
                    {m.label}
                  </span>
                )
              })}
              {nDiscovered > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-5 rounded-full border border-dashed border-blue-300" aria-hidden />
                  Dashed on discovered shops: self-reported on the company website (unverified)
                </span>
              )}
            </footer>
          </section>
        </>
      )}
    </div>
  )
}
