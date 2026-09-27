"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, ChevronRight, Search, ShieldCheck, X } from "lucide-react"
import { useDemo } from "@/lib/data/store"
import { PROCESS_LABEL } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { CertChip, ShopLabelBadge, certStatusMeta } from "./badges"
import type { ListShop } from "./types"

const KEY_CERTS = ["CGP", "CWB_W47.1", "AS9100", "ISO9001"] as const
type SourceFilter = "all" | "public" | "synthetic"

function certStatus(shop: ListShop, type: string): string {
  return shop.cert_summary?.find((c) => c.type === type)?.status ?? "unknown"
}

function hasCgp(shop: ListShop): boolean {
  return certStatusMeta(certStatus(shop, "CGP")).counts
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

const selectCls =
  "h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus-visible:ring-3 focus-visible:ring-zinc-300"

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
  const [source, setSource] = useState<SourceFilter>("all")
  const [cgpOnly, setCgpOnly] = useState(false)

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

  const shops = useMemo(() => state?.shops ?? [], [state])
  const cities = useMemo(() => [...new Set(shops.map((s) => s.city))].sort(), [shops])
  const processes = useMemo(
    () =>
      [...new Set(shops.flatMap((s) => s.processes))].sort((a, b) =>
        (PROCESS_LABEL?.[a] ?? a).localeCompare(PROCESS_LABEL?.[b] ?? b)
      ),
    [shops]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return shops
      .filter((s) => city === "all" || s.city === city)
      .filter((s) => procFilter === "all" || (s.processes as string[]).includes(procFilter))
      .filter((s) => source === "all" || s.source === source)
      .filter((s) => !cgpOnly || hasCgp(s))
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.city.toLowerCase().includes(q) ||
          s.processes.some((p) => (PROCESS_LABEL?.[p] ?? p).toLowerCase().includes(q))
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [shops, query, city, procFilter, source, cgpOnly])

  const nSynthetic = shops.filter((s) => s.source === "synthetic").length
  const nPublic = shops.filter((s) => s.source === "public").length
  const nSme = shops.filter((s) => s.is_sme).length
  const nCgp = shops.filter(hasCgp).length
  const totalHours = shops.reduce((s, x) => s + (x.capacity_hours_week ?? 0), 0)
  const filtersActive = query !== "" || city !== "all" || procFilter !== "all" || source !== "all" || cgpOnly

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">Network</h1>
        <p className="max-w-3xl text-base text-zinc-600">
          {shops.length > 0 && nPublic === 0 ? (
            <>
              Illustrative network of {nSynthetic} synthetic shops modelled on southwestern Ontario manufacturers.
              Real ODBus-listed firms would appear with a “Public data — unverified” badge.
            </>
          ) : (
            <>
              Small and mid-sized manufacturers in southwestern Ontario that Muster can route work to. Public data
              is unverified; synthetic shops are labelled.
            </>
          )}
        </p>
        {shops.length > 0 && nPublic > 0 && (
          <p className="text-sm tabular-nums text-zinc-500">
            {nSynthetic} synthetic · {nPublic} public
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
            <Stat label="Shops in network" value={String(shops.length)} sub={`${cities.length} cities`} />
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

          <section className="rounded-xl border border-zinc-200 bg-white">
            <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-5 py-4">
              <label className="relative">
                <span className="sr-only">Search shops</span>
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
                  aria-hidden
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, city, process"
                  className={cn(selectCls, "w-60 pl-9")}
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
                <select className={selectCls} value={procFilter} onChange={(e) => setProcFilter(e.target.value)}>
                  <option value="all">All processes</option>
                  {processes.map((p) => (
                    <option key={p} value={p}>
                      {PROCESS_LABEL?.[p] ?? p}
                    </option>
                  ))}
                </select>
              </label>
              {nPublic > 0 && nSynthetic > 0 && (
              <div className="flex h-9 items-center rounded-lg border border-zinc-200 p-0.5" role="group" aria-label="Source">
                {(["all", "synthetic", "public"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSource(s)}
                    aria-pressed={source === s}
                    className={cn(
                      "h-full rounded-md px-3 text-sm font-medium capitalize transition-colors",
                      source === s ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
                    )}
                  >
                    {s === "all" ? "All sources" : s}
                  </button>
                ))}
              </div>
              )}
              <button
                type="button"
                onClick={() => setCgpOnly((v) => !v)}
                aria-pressed={cgpOnly}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
                  cgpOnly
                    ? "border-violet-300 bg-violet-50 text-violet-800"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                )}
              >
                <ShieldCheck className="size-4" aria-hidden />
                CGP only
              </button>
              <div className="ml-auto flex items-center gap-3 text-sm tabular-nums text-zinc-500">
                {filtersActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("")
                      setCity("all")
                      setProcFilter("all")
                      setSource("all")
                      setCgpOnly(false)
                    }}
                    className="inline-flex items-center gap-1 text-zinc-600 hover:text-zinc-900"
                  >
                    <X className="size-3.5" aria-hidden />
                    Clear
                  </button>
                )}
                Showing {filtered.length} of {shops.length}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
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
                          <div className="mt-1 flex items-center gap-2">
                            <ShopLabelBadge source={s.source} label={s.label} className="h-5 px-2 text-[11px]" />
                            {s.id === demo.demoShopId && (
                              <span className="text-[11px] font-medium text-[#B42318]">Demo shop</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-zinc-700">{s.city}</td>
                        <td className="px-3 py-3.5">
                          {s.is_sme ? (
                            <span className="font-medium text-emerald-700">SME</span>
                          ) : (
                            <span className="text-zinc-500">Non-SME</span>
                          )}
                          <div className="text-xs text-zinc-400">{s.employee_band}</div>
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
                          <div className="flex flex-wrap gap-1.5">
                            {KEY_CERTS.map((t) => (
                              <CertChip key={t} type={t} status={certStatus(s, t)} />
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-right tabular-nums">
                          <span className="font-medium text-zinc-900">{s.capacity_hours_week}</span>
                          <span className="text-zinc-500"> h/wk</span>
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
            <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3 text-xs text-zinc-500">
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
            </footer>
          </section>
        </>
      )}
    </div>
  )
}
