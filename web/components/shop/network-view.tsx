"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertTriangle, Check, ChevronRight, Clock, Globe, Info, Search, X } from "lucide-react"
import { useDemo } from "@/lib/data/store"
import { isDiscovered, type PublicShopExtras } from "@/lib/data/fixture-source"
import { PROCESS_LABEL } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { StoryBanner } from "@/components/muster/story-banner"
import { AutoNextStep } from "@/components/muster/next-step"
import { StatCard } from "@/components/muster/stat-card"
import { StatusBadge } from "@/components/muster/status-badge"
import { Rich, c } from "@/lib/ui/copy"
import { ce } from "@/lib/ui/copy-e"
import { certPlain } from "@/lib/ui/plain"
import { useStoryMode } from "@/lib/ui/story-mode"
import { useWithParams } from "@/lib/ui/use-with-params"
import { CertAbbr, DndBadge, certStatusMeta } from "./badges"
import type { DndHistory, ListShop } from "./types"

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

function certStatus(shop: ListShop, type: string): string {
  return shop.cert_summary?.find((x) => x.type === type)?.status ?? "unknown"
}

function hasCert(shop: ListShop, type: string): boolean {
  return certStatusMeta(certStatus(shop, type)).counts
}

const chip =
  "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-xs font-medium"

/**
 * Held (demo shops) or stated (real shops) certificates only (§5.6): never a grey "not held"
 * pill on a real company. Green = held (demo data), amber = in training, blue dashed = stated
 * on the company's website (unverified). Colour + icon + text.
 */
function CertPills({ s }: { s: Row }) {
  if (s.discovered) {
    const stated = CERT_ORDER.filter((t) => certStatus(s, t) !== "unknown")
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {stated.map((t) => (
          <span key={t} className={cn(chip, "border-dashed border-sky-300 bg-sky-50 text-sky-900")}>
            <Globe className="size-3" aria-hidden />
            <CertAbbr type={t} />
          </span>
        ))}
        <span className="text-xs text-muted-foreground">
          {stated.length === 0 ? `${ce("net.noCerts.pub")} · ` : ""}
          {c("net.othersNotListed")}
        </span>
      </div>
    )
  }
  const held = KEY_CERTS.filter((t) => hasCert(s, t))
  if (held.length === 0) return <span className="text-xs text-muted-foreground">{ce("net.noCerts")}</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {held.map((t) => {
        const training = certStatus(s, t) === "pending_training"
        return (
          <span
            key={t}
            className={cn(
              chip,
              training ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
            )}
          >
            {training ? <Clock className="size-3" aria-hidden /> : <Check className="size-3" aria-hidden />}
            <CertAbbr type={t} />
            {training && <span className="font-normal">· {ce("net.inTraining")}</span>}
          </span>
        )
      })}
    </div>
  )
}

function ShopBadges({ s, demoShopId, dnd }: { s: Row; demoShopId: string | null | undefined; dnd?: DndHistory }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      {s.discovered ? (
        <StatusBadge
          kind="public"
          label={s.label || c("pub.badge")}
          className="h-5 px-2 text-[11px]"
          title={`${s.label || c("pub.badge")}. Not onboarded: not offered work.`}
        />
      ) : (
        <StatusBadge kind="synthetic" label={s.label || "Synthetic"} className="h-5 px-2 text-[11px]" />
      )}
      {dnd && <DndBadge history={dnd} compact />}
      {s.id === demoShopId && <span className="text-[11px] font-semibold text-teal-800">{ce("net.demoShop")}</span>}
    </div>
  )
}

function SizeCell({ s }: { s: Row }) {
  const label = s.is_sme ? ce("net.size.smb") : ce("net.size.large")
  return (
    <>
      <span className={cn(s.is_sme && !s.discovered ? "font-medium text-emerald-700" : "text-slate-700")}>
        {label}
        {s.discovered && <span className="text-muted-foreground"> {ce("net.size.est")}</span>}
      </span>
      <div className="text-xs text-muted-foreground">{s.employee_band ?? "—"}</div>
    </>
  )
}

const selectCls =
  "h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"

/**
 * The Shops directory (docs/ux-simplification.md §5.6): "Canada's hidden supply base".
 * `dnd` (from the server page) marks real shops with a National Defence contract match.
 */
export function NetworkView({ dnd = {} }: { dnd?: Record<string, DndHistory> }) {
  const demo = useDemo()
  const router = useRouter()
  const { story } = useStoryMode()
  const wp = useWithParams()
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
    const present = new Set(
      shops.flatMap((s) => (s.cert_summary ?? []).filter((x) => certStatusMeta(x.status).counts).map((x) => x.type as string))
    )
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
  const filtersActive =
    query !== "" || city !== "all" || procFilter !== "all" || certFilter !== "all" || source !== "all"
  const sourceOptions: { key: SourceFilter; label: string }[] = [
    { key: "all", label: ce("net.filter.all", { total: shops.length }) },
    { key: "synthetic", label: c("net.filter.syn", { syn: nOnboarded }) },
    { key: "public", label: c("net.filter.pub", { pub: nDiscovered }) },
  ]
  const clearFilters = () => {
    setQuery("")
    setCity("all")
    setProcFilter("all")
    setCertFilter("all")
    setSource("all")
  }

  return (
    <div className="space-y-6">
      <StoryBanner
        step={null}
        tone="extra"
        summary={
          state?.shops ? (
            <Rich text={c("net.b", { total: shops.length, syn: nOnboarded, pub: nDiscovered })} />
          ) : (
            <Skeleton className="h-12 w-full max-w-2xl" />
          )
        }
        lookAt={c("net.b.look")}
        next={<AutoNextStep />}
      />

      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{c("net.h1")}</h1>

      {state?.error && !state.shops ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-5 text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden />
            {ce("net.error")}
          </div>
          <p className="mt-1 text-sm">{state.error}</p>
        </div>
      ) : !state ? (
        <div className="space-y-4" aria-busy>
          <Skeleton className="h-12" />
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-[480px]" />
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card" data-directory>
            <div className="space-y-3 border-b border-border px-4 py-4 sm:px-5">
              <label className="relative block w-full">
                <span className="sr-only">{c("net.search")}</span>
                <Search
                  className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={c("net.search")}
                  className={cn(selectCls, "h-12 w-full pl-11 text-base")}
                />
              </label>
              {nDiscovered > 0 && nOnboarded > 0 && (
                <div
                  className="flex flex-wrap gap-1 rounded-lg border border-border p-0.5 sm:inline-flex"
                  role="group"
                  aria-label="Which shops"
                >
                  {sourceOptions.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setSource(o.key)}
                      aria-pressed={source === o.key}
                      className={cn(
                        "min-h-9 rounded-md px-3 py-1 text-left text-sm font-medium tabular-nums transition-colors",
                        source === o.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-muted"
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  {ce("net.city")}
                  <select className={selectCls} value={city} onChange={(e) => setCity(e.target.value)}>
                    <option value="all">{ce("net.city.all")}</option>
                    {cities.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  {ce("net.process")}
                  <select
                    className={cn(selectCls, "max-w-[11rem]")}
                    value={procFilter}
                    onChange={(e) => setProcFilter(e.target.value)}
                  >
                    <option value="all">{ce("net.process.all")}</option>
                    {processes.map((p) => (
                      <option key={p} value={p}>
                        {PROCESS_LABEL?.[p] ?? p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  {ce("net.cert")}
                  <select
                    className={cn(selectCls, "max-w-[14rem]")}
                    value={certFilter}
                    onChange={(e) => setCertFilter(e.target.value)}
                    title="Held, or in training; for real shops, stated on the company website"
                  >
                    <option value="all">{ce("net.cert.any")}</option>
                    {certTypes.map((t) => (
                      <option key={t} value={t}>
                        {certPlain(t).first}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground tabular-nums">
                  {filtersActive && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="inline-flex min-h-8 items-center gap-1 text-slate-600 hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden />
                      {ce("net.clear")}
                    </button>
                  )}
                  <span data-testid="showing-count">{ce("net.showing", { n: filtered.length, total: shops.length })}</span>
                </div>
              </div>
            </div>

            {/* The stats describe the demo network only: hide them when the list shows real shops only. */}
            {source !== "public" && (
            <div className="grid gap-3 border-b border-border px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-3" data-directory-stats>
              <StatCard
                label={c("net.stat.sme")}
                value={String(nSme)}
                sub={ce("net.stat.sme.sub", { syn: nOnboarded })}
                tone="success"
              />
              <StatCard
                label={c("net.stat.cgp")}
                value={String(nCgp)}
                sub={ce("net.stat.cgp.sub", { syn: nOnboarded })}
                tone="controlled"
              />
              {!story && (
                <StatCard
                  label={c("net.stat.capacity")}
                  value={`${totalHours.toLocaleString("en-CA")} h`}
                  sub={ce("net.stat.capacity.sub", { syn: nOnboarded })}
                />
              )}
            </div>
            )}

            {nDiscovered > 0 && (
              <div
                role="note"
                data-testid="discovered-banner"
                className="flex gap-3 border-b border-border bg-sky-50/70 px-4 py-3 text-sm text-sky-950 sm:px-5"
              >
                <Info className="mt-0.5 size-4 shrink-0 text-sky-700" aria-hidden />
                <p>{ce("net.discovered")}</p>
              </div>
            )}

            <p
              className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2.5 text-xs text-muted-foreground sm:px-5"
              data-cert-legend
            >
              {c("net.legend")
                .split(" · ")
                .map((part, i) => (
                  <span key={part} className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-block h-3 w-5 rounded-full border",
                        i === 0 ? "border-emerald-200 bg-emerald-50" : "border-dashed border-sky-300 bg-sky-50"
                      )}
                      aria-hidden
                    />
                    {part}
                  </span>
                ))}
            </p>

            {/* Phone: one card per shop. */}
            <ul className="divide-y divide-border md:hidden" data-testid="shop-cards">
              {filtered.map((s) => {
                const href = wp(`/shops/${encodeURIComponent(s.id)}`)
                return (
                  <li key={s.id} data-shop-row={s.discovered ? "discovered" : "onboarded"}>
                    <Link
                      href={href}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3.5 hover:bg-muted/60",
                        s.id === demo.demoShopId && "bg-teal-50/60"
                      )}
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="font-medium break-words text-foreground">{s.name}</div>
                        <ShopBadges s={s} demoShopId={demo.demoShopId} dnd={dnd[s.id]} />
                        <div className="text-xs text-muted-foreground">
                          {s.city} ·{" "}
                          {s.processes.slice(0, 3).map((p) => PROCESS_LABEL?.[p] ?? p).join(", ") || ce("net.processesNone")}
                          {s.processes.length > 3 ? ` +${s.processes.length - 3}` : ""}
                        </div>
                        <CertPills s={s} />
                      </div>
                      <ChevronRight className="mt-1 size-4 shrink-0 text-slate-300" aria-hidden />
                    </Link>
                  </li>
                )
              })}
              {filtered.length === 0 && (
                <li className="px-4 py-12 text-center text-sm text-muted-foreground">{ce("net.empty")}</li>
              )}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[960px] text-sm" data-testid="shop-table">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <th className="px-5 py-3">{ce("net.col.shop")}</th>
                    <th className="px-3 py-3">{ce("net.col.city")}</th>
                    <th className="px-3 py-3">{ce("net.col.size")}</th>
                    <th className="px-3 py-3">{ce("net.col.processes")}</th>
                    <th className="px-3 py-3">{ce("net.col.certs")}</th>
                    <th className="px-3 py-3 text-right">{ce("net.col.capacity")}</th>
                    <th className="w-8 px-3 py-3" aria-label="Open" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((s) => {
                    const href = wp(`/shops/${encodeURIComponent(s.id)}`)
                    const shown = s.processes.slice(0, 3)
                    const more = s.processes.length - shown.length
                    return (
                      <tr
                        key={s.id}
                        data-shop-row={s.discovered ? "discovered" : "onboarded"}
                        onClick={() => router.push(href)}
                        className={cn(
                          "cursor-pointer align-middle transition-colors hover:bg-muted/60",
                          s.id === demo.demoShopId && "bg-teal-50/60"
                        )}
                      >
                        <td className="px-5 py-3.5">
                          <Link
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="block font-medium text-foreground hover:underline"
                          >
                            {s.name}
                          </Link>
                          <ShopBadges s={s} demoShopId={demo.demoShopId} dnd={dnd[s.id]} />
                        </td>
                        <td className="px-3 py-3.5 text-slate-700">{s.city}</td>
                        <td className="px-3 py-3.5">
                          <SizeCell s={s} />
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex max-w-[280px] flex-wrap gap-1.5">
                            {shown.map((p) => (
                              <span
                                key={p}
                                className="inline-flex h-6 items-center rounded-md border border-border bg-muted px-2 text-xs text-slate-700"
                              >
                                {PROCESS_LABEL?.[p] ?? p}
                              </span>
                            ))}
                            {more > 0 && (
                              <span
                                className="inline-flex h-6 items-center px-1 text-xs text-muted-foreground"
                                title={s.processes.slice(3).map((p) => PROCESS_LABEL?.[p] ?? p).join(", ")}
                              >
                                +{more}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <CertPills s={s} />
                        </td>
                        <td className="px-3 py-3.5 text-right tabular-nums">
                          {s.discovered || s.capacity_hours_week == null ? (
                            <span className="text-xs text-muted-foreground" title="Shared when the shop claims its profile">
                              {ce("net.notOnboarded")}
                            </span>
                          ) : (
                            <>
                              <span className="font-medium text-foreground">{s.capacity_hours_week}</span>
                              <span className="text-muted-foreground"> hrs/wk</span>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-slate-300">
                          <ChevronRight className="size-4" aria-hidden />
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">
                        {ce("net.empty")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex justify-end border-t border-border pt-6">
            <AutoNextStep />
          </div>
        </>
      )}
    </div>
  )
}
