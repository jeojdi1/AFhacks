"use client"

// /graph: "Supplier map", on Northgate's side (soft-gated like the other desks). One
// node's neighbourhood (GET /graph/ego, depth 1) drawn as SVG with a deterministic ring
// layout, then counts by node / edge type (GET /graph/summary). Click a dot to move it to
// the middle. docs/api.md §7.

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, ExternalLink, FlaskConical, Globe, LoaderCircle, MousePointerClick } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtMoney } from "@/lib/format"
import { useWithParams } from "@/lib/ui/use-with-params"
import { useGraphEgo, useGraphSummary, useIsLive } from "@/lib/search/client"
import type { GraphNode } from "@/lib/search/types"
import { EngineBadge } from "@/components/search/engine-badge"
import { TermText } from "@/components/search/term-text"
import { PortalPage } from "@/components/portal/portal-page"
import { EgoSvg } from "./ego-svg"
import { KIND, KIND_ORDER, displayLabel, edgePlain, kindStyle, shapePath } from "./graph-kinds"

const NEO4J_BROWSER = "http://localhost:7474"
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"]
const noSubscribe = () => () => {}

interface Stop {
  id: string
  label: string
}

const STARTS: Stop[] = [
  { id: "shop:syn-012", label: "A shop: Tallowfield (synthetic)" },
  { id: "program:northgate", label: "Your jobs (Northgate, fictional)" },
  { id: "process:welding", label: "A skill: welding" },
  { id: "cert:CWB_W47.1", label: "A certificate: welding certification (CWB W47.1)" },
]

function Swatch({ type, size = 14 }: { type: string; size?: number }) {
  const s = kindStyle(type)
  const r = size / 2 - 1.5
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden className="shrink-0">
      <path
        d={shapePath(s.shape, r)}
        fill={s.shape === "ring" ? "#ffffff" : s.color}
        stroke={s.shape === "ring" ? s.color : "none"}
        strokeWidth={s.shape === "ring" ? 2.5 : 0}
      />
    </svg>
  )
}

/** Honest label for a node: fictional prime, synthetic shop, or real company from public data. */
function NodeLabelBadge({ node }: { node: GraphNode }) {
  const p = node.props
  if (p.fictional) return <span className="text-xs font-medium text-slate-600">Fictional</span>
  if (node.type === "Shop" && p.source === "synthetic")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
        <FlaskConical className="size-3.5" aria-hidden />
        Synthetic
      </span>
    )
  if (node.type === "Shop" || node.type === "Manufacturer" || node.type === "DNDVendor" || node.type === "Prime")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-public">
        <Globe className="size-3.5" aria-hidden />
        Public data — unverified — not affiliated
      </span>
    )
  return null
}

/** A few readable facts for the selected node. */
function nodeFacts(node: GraphNode): string[] {
  const p = node.props as Record<string, string | number | boolean | null | undefined>
  const out: string[] = []
  if (p.city) out.push(`${p.city}${p.province ? `, ${p.province}` : ""}`)
  if (node.type === "Job") {
    if (typeof p.value_cad === "number") out.push(`${fmtMoney(p.value_cad, { compact: true })} of work`)
    if (p.hours_week) out.push(`${p.hours_week} hours a week`)
    if (p.controlled) out.push("Controlled part: security-cleared shops only")
  }
  if (node.type === "DNDVendor" && typeof p.value_cad === "number")
    out.push(`${p.contracts ?? 0} National Defence contract(s) · ${fmtMoney(p.value_cad, { compact: true })} (public record)`)
  if (node.type === "Region" && typeof p.welder_vacancies_latest === "number")
    out.push(`${p.welder_vacancies_latest} welder job vacancies (Statistics Canada, ${String(p.welder_vacancies_quarter ?? "").slice(0, 7)})`)
  if (node.type === "Program" && typeof p.obligation_cad === "number")
    out.push(`Owes Canada ${fmtMoney(p.obligation_cad, { compact: true })} of business · Simplified ITB rules for demo`)
  if (node.type === "Shop" && p.onboarding === "discovered") out.push("Not onboarded: not sent work until the shop claims its profile")
  return out
}

export function GraphView() {
  const wp = useWithParams()
  const live = useIsLive()
  // The Neo4j Browser link only makes sense when Neo4j actually answered and the viewer is on
  // the machine running it (a phone or another laptop can't open localhost:7474).
  const onLocalhost = React.useSyncExternalStore(
    noSubscribe,
    () => LOCAL_HOSTS.includes(window.location.hostname),
    () => false
  )
  const summary = useGraphSummary()
  const [trail, setTrail] = React.useState<Stop[]>([STARTS[0]])
  const rootId = trail[trail.length - 1].id
  const ego = useGraphEgo(rootId)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  const data = ego.data
  const labelOf = (id: string) => {
    const n = data?.nodes.find((x) => x.id === id)
    return n ? (n.type === "Job" ? n.label.split(" · ")[0] : displayLabel(n)) : id.split(":").slice(1).join(":")
  }
  const recentre = (id: string) => {
    setSelectedId(null)
    const label = labelOf(id)
    setTrail((t) => (t[t.length - 1].id === id ? t : [...t.slice(-7), { id, label }]))
  }
  // Linked-dots list: preview a dot in the card only on keyboard focus. Hover or a mouse press
  // must not change the card, or the list below it moves and the click lands on another dot.
  const previewOnKeyboardFocus = (e: React.FocusEvent<HTMLButtonElement>, id: string) => {
    let keyboard = true
    try {
      keyboard = e.currentTarget.matches(":focus-visible")
    } catch {
      /* old browser: keep the keyboard preview */
    }
    if (keyboard) setSelectedId(id)
  }
  const start = (st: Stop) => {
    setSelectedId(null)
    setTrail([st])
  }

  const shownRoot = data?.root ?? rootId
  const rootNode = data?.nodes.find((n) => n.id === shownRoot) ?? null
  const selected = data?.nodes.find((n) => n.id === (selectedId ?? shownRoot)) ?? rootNode

  const groups = React.useMemo(() => {
    const m = new Map<string, GraphNode[]>()
    for (const n of data?.nodes ?? []) {
      if (n.id === shownRoot) continue
      m.set(n.type, [...(m.get(n.type) ?? []), n])
    }
    return (KIND_ORDER as readonly string[])
      .filter((k) => m.has(k))
      .map((k) => ({ type: k, nodes: m.get(k)!.sort((a, b) => displayLabel(a).localeCompare(displayLabel(b))) }))
  }, [data, shownRoot])

  const s = summary.data
  const nodeKinds = s ? (KIND_ORDER as readonly string[]).filter((k) => s.nodes[k] != null) : []
  const rootName = rootNode ? (rootNode.type === "Job" ? rootNode.label.split(" · ")[0] : displayLabel(rootNode)) : "…"

  return (
    <PortalPage
      role="prime"
      desk="Northgate's supplier map"
      testId="graph-page"
      eyebrow="Northgate Land Systems (fictional defence company) · supplier development"
      title="Supplier map"
      lede="See who can make your parts: pick a starting point, then click any dot."
    >
      <Link
        href={wp("/prime/suppliers")}
        className="-mt-4 inline-flex w-fit items-center gap-1 text-sm font-medium text-slate-700 underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Find suppliers
      </Link>

      <section aria-labelledby="ego-title" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <h2 id="ego-title" className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
            <MousePointerClick className="size-5 text-muted-foreground" aria-hidden />
            What&apos;s linked to {rootName}
            {ego.loading ? <LoaderCircle className="size-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Loading" /> : null}
          </h2>
          <p className="text-sm text-muted-foreground">
            The middle dot is what you picked; every dot around it is a linked skill, certificate, place, shop or
            past contract. Click one to move it to the middle.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-label="Start with">
          <span className="text-sm font-medium text-slate-700">Start with:</span>
          {STARTS.map((st) => (
            <button
              key={st.id}
              type="button"
              aria-pressed={trail.length === 1 && rootId === st.id}
              onClick={() => start(st)}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3 py-1 text-left text-sm font-medium focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
                trail.length === 1 && rootId === st.id
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-background hover:bg-muted"
              )}
            >
              {st.label}
            </button>
          ))}
        </div>
        {trail.length > 1 ? (
          <nav aria-label="Path so far" className="flex flex-wrap items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => setTrail((t) => t.slice(0, -1))}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 font-medium hover:bg-muted"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </button>
            <span className="text-muted-foreground">{trail.map((t) => t.label).join(" → ")}</span>
          </nav>
        ) : null}

        {ego.error ? (
          <p role="alert" className="rounded-lg border border-blocked/30 bg-blocked-soft px-3 py-2 text-sm">
            {ego.error}
          </p>
        ) : null}
        {!ego.loading && !data && !ego.error ? (
          <p className="text-sm text-muted-foreground">This part of the map isn&apos;t in the demo data. Switch to Live to explore it.</p>
        ) : null}

        {data ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className={cn("min-w-0 rounded-lg border border-border bg-white", ego.loading && "opacity-60")}>
              <EgoSvg
                nodes={data.nodes}
                edges={data.edges}
                rootId={data.root}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onRecentre={recentre}
                title={`Map around ${rootNode ? displayLabel(rootNode) : data.root}: ${data.nodes.length - 1} linked dots`}
              />
              {data.truncated || data.partial ? (
                <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                  {data.truncated ? `Showing the first ${data.nodes.length - 1} links. ` : ""}
                  {data.partial ? "Demo data holds only part of this map; Live shows all of it." : ""}
                </p>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              {selected ? (
                <div className="min-h-[10.5rem] rounded-lg border border-border bg-muted/40 p-3" data-selected-node={selected.id}>
                  <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <Swatch type={selected.type} />
                    {kindStyle(selected.type).singular}
                    {selected.id === shownRoot ? " · in the middle" : ""}
                  </p>
                  <p className="mt-1 font-semibold break-words">
                    <TermText text={displayLabel(selected)} />
                  </p>
                  <NodeLabelBadge node={selected} />
                  <ul className="mt-1 text-sm text-slate-700">
                    {nodeFacts(selected).map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  {selected.id !== shownRoot ? (
                    <button
                      type="button"
                      onClick={() => recentre(selected.id)}
                      className="mt-2 inline-flex h-8 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/90"
                    >
                      Move to the middle
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1" aria-label="Linked dots">
                {groups.map((g) => (
                  <div key={g.type}>
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      <Swatch type={g.type} />
                      {kindStyle(g.type).plural} ({g.nodes.length})
                    </p>
                    <ul className="mt-1 flex flex-col">
                      {g.nodes.map((n) => (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => recentre(n.id)}
                            onFocus={(e) => previewOnKeyboardFocus(e, n.id)}
                            className="w-full truncate rounded px-1.5 py-1 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            title={displayLabel(n)}
                          >
                            {displayLabel(n)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <p className="text-sm text-muted-foreground" data-graph-disclaimer>
          Northgate Land Systems is fictional. Demo shops are synthetic. Real companies: Public data — unverified —
          not affiliated. National Defence matches are by company name, not confirmed by the companies.
        </p>

        <div aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3 text-sm text-slate-700" data-graph-legend>
          {(["Shop", "Process", "Cert", "Region", "Job", "DNDVendor", "Occupation", "Manufacturer", "Prime", "Program"] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <Swatch type={k} />
              {KIND[k].singular}
            </span>
          ))}
        </div>
      </section>

      <section aria-labelledby="graph-counts" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <h2 id="graph-counts" className="text-lg font-semibold tracking-tight">
            Everything on the map
          </h2>
          {s ? (
            <p className="text-sm text-muted-foreground" data-graph-totals>
              {s.totals.nodes.toLocaleString("en-CA")} shops, skills, certificates, places and public records, with{" "}
              {s.totals.edges.toLocaleString("en-CA")} links between them.
            </p>
          ) : null}
        </div>
        {summary.error ? <p className="text-sm text-blocked">{summary.error}</p> : null}
        {s ? (
          <>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-graph-nodes>
              {nodeKinds.map((k) => (
                <li key={k} className="flex min-w-0 flex-col rounded-lg bg-muted/60 px-3 py-2">
                  <span className="text-xl font-semibold tabular-nums">{s.nodes[k].toLocaleString("en-CA")}</span>
                  <span className="flex items-center gap-1.5 text-sm text-slate-700">
                    <Swatch type={k} />
                    <span className="min-w-0">{kindStyle(k).plural}</span>
                  </span>
                </li>
              ))}
            </ul>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-slate-700">Links by type</summary>
              <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {Object.entries(s.edges)
                  .sort((a, b) => b[1] - a[1])
                  .map(([t, n]) => (
                    <li key={t} className="flex justify-between gap-3 border-b border-border/60 py-1">
                      <span>{edgePlain(t)}</span>
                      <span className="tabular-nums text-slate-700">{n.toLocaleString("en-CA")}</span>
                    </li>
                  ))}
              </ul>
            </details>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground" data-graph-engine>
              <span>Answered by:</span>
              <EngineBadge engine={s.engine} origin={summary.origin} />
              {live && onLocalhost && s.engine === "neo4j" ? (
                <a
                  href={NEO4J_BROWSER}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-neo4j-browser
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-muted"
                >
                  Open in Neo4j Browser
                  <ExternalLink className="size-3.5" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : null}
              <span>Sources: Statistics Canada, Job Bank and National Defence open data (Open Government Licence – Canada), plus company websites.</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </section>
    </PortalPage>
  )
}
