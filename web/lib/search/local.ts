// Demo-data (fixtures mode) answers for the search + graph pages.
//
// The saved answers in data/fixtures/search/ cover a few queries. Everything else is
// computed here from the same fixture files the rest of the demo uses, mirroring
// engine/search.py (filters, score, order), so demo mode never calls the engine:
//   - shops: data/fixtures/shops.json (synthetic) + shops_public.json (public), with the
//     funded training packages' certificates applied (pending_training) like the engine;
//   - jobs:  data/fixtures/search/jobs_syn-012.json adjusted to the demo's stage,
//     assignments and offer decisions;
//   - graph: the saved summary and syn-012 neighbourhood, plus Northgate's program from
//     parts_upload.json (the file the engine builds Job nodes from). Partial by design.

import shopsFx from "@fixtures/shops.json"
import publicFx from "@fixtures/shops_public.json"
import programFx from "@fixtures/program.json"
import partsFx from "@fixtures/parts_upload.json"
import gapsFx from "@fixtures/gaps.json"
import shopsCnc from "@fixtures/search/shops_cnc_london.json"
import shopsCwb from "@fixtures/search/shops_cwb.json"
import jobsDemo from "@fixtures/search/jobs_syn-012.json"
import graphSummaryFx from "@fixtures/search/graph_summary.json"
import egoDemo from "@fixtures/search/graph_ego_syn-012.json"
import type { Assignment, TrainingPackage } from "@/lib/api/types"
import type { Stage } from "@/lib/data/store"
import { CERT_KEYS, COUNTING_STATUSES, DEFAULT_RADIUS_KM, PROCESS_KEYS, processPlain } from "./labels"
import type {
  DndHistory,
  EligibleJob,
  GraphEdge,
  GraphEgo,
  GraphNode,
  GraphSummary,
  JobSearchResponse,
  NearMissJob,
  SearchCert,
  ShopResult,
  ShopSearchParams,
  ShopSearchResponse,
} from "./types"

const PUBLIC_LABEL = "Public data — unverified — not affiliated"
const PROCESS_ORDER = new Map<string, number>(PROCESS_KEYS.map((p, i) => [p, i]))
const CERT_ORDER = new Map<string, number>(CERT_KEYS.map((c, i) => [c, i]))
const COUNTING = new Set<string>(COUNTING_STATUSES)
const EARTH_KM = 6371.0

const CERT_LABEL_ENGINE: Record<string, string> = {
  CGP: "CGP registration",
  CPCSC_L1: "CPCSC Level 1",
  ISO9001: "ISO 9001",
  AS9100: "AS9100",
  "NADCAP:HEAT_TREAT": "Nadcap heat treating",
  "NADCAP:CHEM_PROCESSING": "Nadcap chemical processing",
  "NADCAP:COATINGS": "Nadcap coatings",
  "CWB_W47.1": "CWB W47.1",
}

interface FxShop {
  id: string
  name: string
  source?: string
  city: string | null
  lat: number | null
  lon: number | null
  is_sme?: boolean
  processes?: string[]
  cert_summary?: { type: string; status: string; source_url?: string | null }[]
}

interface ShopRecord {
  shop_id: string
  name: string
  source: "synthetic" | "public"
  city: string | null
  lat: number | null
  lon: number | null
  is_sme: boolean
  processes: string[]
  certs: Map<string, { status: string; source_url: string | null }>
}

const SYNTHETIC = (shopsFx as { shops: FxShop[] }).shops
const PUBLIC = (publicFx as { shops: FxShop[] }).shops
const SITE = (programFx as { program: { site?: { city: string; lat: number; lon: number } } }).program.site ?? {
  city: "London",
  lat: 42.9849,
  lon: -81.2453,
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180
  const dLat = (lat2 - lat1) * r
  const dLon = (lon2 - lon1) * r
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a))
}

function round(n: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

// ---------------------------------------------------------------------------- cities

interface City {
  name: string
  lat: number
  lon: number
}

/** lower-case city → centre: the mean of every shop in that city, then the program site (engine._city_table). */
function buildCities(): Map<string, City> {
  const acc = new Map<string, { lat: number; lon: number; n: number; name: string }>()
  for (const s of [...SYNTHETIC, ...PUBLIC]) {
    if (s.lat == null || s.lon == null || !s.city) continue
    const k = s.city.trim().toLowerCase()
    const a = acc.get(k) ?? { lat: 0, lon: 0, n: 0, name: s.city.trim() }
    a.lat += s.lat
    a.lon += s.lon
    a.n += 1
    acc.set(k, a)
  }
  const out = new Map<string, City>()
  for (const [k, a] of [...acc.entries()].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
    out.set(k, { name: a.name, lat: round(a.lat / a.n, 5), lon: round(a.lon / a.n, 5) })
  out.set(SITE.city.trim().toLowerCase(), { name: SITE.city, lat: SITE.lat, lon: SITE.lon })
  return out
}

const CITIES = buildCities()

/** City names for the "near" picker, alphabetical. */
export const CITY_NAMES: string[] = [...CITIES.values()].map((c) => c.name).sort((a, b) => a.localeCompare(b))

// ---------------------------------------------------------------------------- shop search

/** Certificates unlocked by funded training packages: shop_id → cert types (status pending_training). */
export function fundedUnlocks(fundedIds: string[], packages: TrainingPackage[] | null | undefined): Map<string, string[]> {
  const all = new Map<string, TrainingPackage>()
  for (const p of (gapsFx as { suggestions: TrainingPackage[] }).suggestions ?? []) all.set(p.id, p)
  for (const p of packages ?? []) all.set(p.id, p)
  const out = new Map<string, string[]>()
  for (const id of fundedIds) {
    const pkg = all.get(id)
    if (!pkg?.cert_unlock) continue
    out.set(pkg.shop_id, [...(out.get(pkg.shop_id) ?? []), pkg.cert_unlock])
  }
  return out
}

function records(unlocks: Map<string, string[]>): ShopRecord[] {
  const toRecord = (s: FxShop, source: "synthetic" | "public"): ShopRecord => {
    const certs = new Map<string, { status: string; source_url: string | null }>()
    for (const c of s.cert_summary ?? []) {
      if (c.type && !certs.has(c.type)) certs.set(c.type, { status: c.status || "unknown", source_url: c.source_url ?? null })
    }
    for (const t of unlocks.get(s.id) ?? []) {
      const cur = certs.get(t)
      if (!cur || !COUNTING.has(cur.status)) certs.set(t, { status: "pending_training", source_url: null })
    }
    return {
      shop_id: s.id,
      name: s.name,
      source,
      city: s.city,
      lat: s.lat,
      lon: s.lon,
      is_sme: !!s.is_sme,
      processes: [...(s.processes ?? [])],
      certs,
    }
  }
  const seen = new Set(SYNTHETIC.map((s) => s.id))
  return [
    ...SYNTHETIC.map((s) => toRecord(s, "synthetic")),
    ...PUBLIC.filter((s) => !seen.has(s.id)).map((s) => toRecord(s, "public")),
  ]
}

function ordered(values: string[], order: Map<string, number>): string[] {
  return [...new Set(values)].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999))
}

export class SearchInputError extends Error {}

/**
 * /search/shops in demo mode. `dnd` is the per-shop DND history built on the server
 * from data/processed/national/entity_links.json (same rule as engine._dnd_history).
 */
export function localSearchShops(
  params: ShopSearchParams,
  opts: { unlocks: Map<string, string[]>; dnd: Record<string, DndHistory> }
): ShopSearchResponse {
  const q = params.q?.trim() || null
  const processes = [...new Set(params.process)]
  const certs = [...new Set(params.cert)]
  const sources = params.source === "all" ? ["synthetic", "public"] : [params.source]
  const limit = params.limit ?? 25
  let center: City | null = null
  let radius: number | null = null
  if (params.near) {
    center = CITIES.get(params.near.trim().toLowerCase()) ?? null
    if (!center) throw new SearchInputError(`Unknown city '${params.near}'`)
    radius = params.radius_km ?? DEFAULT_RADIUS_KM
  }
  const need = processes.length + certs.length
  const ql = q?.toLowerCase() ?? null

  const rows: ShopResult[] = []
  for (const r of records(opts.unlocks)) {
    if (!sources.includes(r.source)) continue
    if (ql && !(r.name ?? "").toLowerCase().includes(ql) && !(r.city ?? "").toLowerCase().includes(ql)) continue
    let dist: number | null = null
    if (center && radius != null) {
      if (r.lat == null || r.lon == null) continue
      dist = haversine(center.lat, center.lon, r.lat, r.lon)
      if (dist > radius) continue
    }
    const hasDnd = !!opts.dnd[r.shop_id]
    if (params.dnd_history != null && hasDnd !== params.dnd_history) continue
    const procs = new Set(r.processes)
    const matched: string[] = []
    const missing: string[] = []
    for (const p of processes) (procs.has(p) ? matched : missing).push(processPlain(p))
    for (const c of certs) {
      const v = r.certs.get(c)
      if (v && COUNTING.has(v.status)) matched.push(`${CERT_LABEL_ENGINE[c] ?? c} (${v.status.replace(/_/g, " ")})`)
      else missing.push(CERT_LABEL_ENGINE[c] ?? c)
    }
    if (matched.length !== need) continue
    const certList: SearchCert[] = ordered(
      [...r.certs.entries()].filter(([, v]) => v.status !== "unknown").map(([t]) => t),
      CERT_ORDER
    ).map((t) => ({ type: t, status: r.certs.get(t)!.status, source_url: r.certs.get(t)!.source_url }))
    const prox = dist != null && radius ? Math.max(0, 1 - dist / radius) : 0
    const fit = need ? matched.length / need : 1
    const isPublic = r.source === "public"
    rows.push({
      shop_id: r.shop_id,
      name: r.name,
      source: r.source,
      label: isPublic ? PUBLIC_LABEL : "Synthetic",
      onboarding: isPublic ? "discovered" : "onboarded",
      routable: !isPublic,
      city: r.city,
      lat: r.lat,
      lon: r.lon,
      distance_km: dist != null ? round(dist, 1) : null,
      is_sme: r.is_sme,
      processes: ordered(r.processes, PROCESS_ORDER),
      certs: certList,
      dnd_history: opts.dnd[r.shop_id] ?? null,
      match: { matched, missing },
      score: round(0.7 * fit + 0.2 * prox + (isPublic ? 0 : 0.1), 4),
    })
  }
  rows.sort(
    (a, b) =>
      b.score - a.score ||
      (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity) ||
      (a.source === "synthetic" ? 0 : 1) - (b.source === "synthetic" ? 0 : 1) ||
      (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase()) ||
      a.shop_id.localeCompare(b.shop_id)
  )
  return {
    engine: "memory",
    query: {
      q,
      process: processes,
      cert: certs,
      near: center?.name ?? null,
      near_lat: center?.lat ?? null,
      near_lon: center?.lon ?? null,
      radius_km: radius,
      source: params.source,
      dnd_history: params.dnd_history ?? null,
      match: "all",
      limit,
    },
    counts: {
      total: rows.length,
      synthetic: rows.filter((r) => r.source === "synthetic").length,
      public: rows.filter((r) => r.source === "public").length,
    },
    results: rows.slice(0, limit),
  }
}

/** The saved answers, for the parity check (web/lib/search is compared against them in the browser). */
export const SAVED_SHOP_ANSWERS = {
  cncLondon: shopsCnc as unknown as ShopSearchResponse,
  cwb: shopsCwb as unknown as ShopSearchResponse,
}

// ---------------------------------------------------------------------------- job search

const JOBS = jobsDemo as unknown as JobSearchResponse
export const DEMO_JOBS_SHOP_ID = JOBS.shop_id

function jobMatches(
  job: { job_id: string; part_no: string; description: string; process_tags?: string[] },
  q: string | null,
  processes: string[],
  material: string | undefined
): boolean {
  if (q) {
    const ql = q.toLowerCase()
    const hay = [job.job_id, job.part_no, job.description, material ?? ""].join(" ").toLowerCase()
    if (!hay.includes(ql)) return false
  }
  if (processes.length && !processes.some((p) => (job.process_tags ?? []).includes(p))) return false
  return true
}

interface PartJob {
  id: string
  process_tags: string[]
  material?: string
  controlled?: boolean
  ccv_pct?: number
}
const PARTS = new Map<string, PartJob>((partsFx as { jobs: PartJob[] }).jobs.map((j) => [j.id, j]))

/**
 * /search/jobs?shop_id=syn-012 in demo mode: the saved routed answer, moved to the demo's
 * current stage. Funded certificates move near misses to eligible (as the engine does);
 * statuses and offer decisions follow the store's assignments.
 */
export function localSearchJobs(opts: {
  shopId: string
  stage: Stage
  assignments: Assignment[]
  offerStatus: Record<string, string>
  unlocks: Map<string, string[]>
  q?: string | null
  process?: string[]
}): JobSearchResponse | null {
  if (opts.shopId !== JOBS.shop_id) return null
  const base: JobSearchResponse = JSON.parse(JSON.stringify(JOBS))
  const q = opts.q?.trim() || null
  const processes = opts.process ?? []
  const byJob = new Map(opts.assignments.map((a) => [a.job_id, a]))
  const unlocked = new Set(opts.unlocks.get(opts.shopId) ?? [])
  const routed = opts.stage === "routed" || opts.stage === "funded"

  let eligible: EligibleJob[] = []
  let near: NearMissJob[] = []
  if (opts.stage !== "empty") {
    eligible = base.eligible
    for (const n of base.near_miss) {
      const left = n.missing.filter((m) => !(m.kind === "cert" && unlocked.has(m.requirement)))
      if (!left.length) {
        const part = PARTS.get(n.job_id)
        eligible.push({
          job_id: n.job_id,
          part_no: n.part_no,
          description: n.description,
          value_cad: n.value_cad,
          hours_week: n.hours_week,
          process_tags: part?.process_tags ?? [],
          controlled: !!part?.controlled,
          credit_cad: n.value_cad * (part?.ccv_pct ?? 0) * 2,
          multiplier: 2,
          reasons: [],
          status: "open",
          offer_status: null,
        })
      } else near.push({ ...n, missing: left })
    }
    eligible = eligible.map((e) => {
      const a = routed ? byJob.get(e.job_id) : undefined
      const status: EligibleJob["status"] = !a ? "open" : a.shop_id === opts.shopId ? "offered_to_you" : "assigned_elsewhere"
      const mine = status === "offered_to_you" && a
      const decided = opts.offerStatus[`${opts.shopId}:${e.job_id}`]
      return {
        ...e,
        status,
        credit_cad: mine ? a.credit_cad : e.credit_cad,
        multiplier: mine ? a.multiplier : e.multiplier,
        reasons: mine ? a.reasons : e.reasons,
        offer_status: mine ? decided ?? (a.status || "offered") : null,
      }
    })
    near = near.map((n) => {
      const a = routed ? byJob.get(n.job_id) : undefined
      return { ...n, status: !a ? "open" : a.shop_id === opts.shopId ? "offered_to_you" : "assigned_elsewhere" }
    })
  }
  const rank = { offered_to_you: 0, open: 1, assigned_elsewhere: 2 } as const
  eligible = eligible
    .filter((e) => jobMatches(e, q, processes, PARTS.get(e.job_id)?.material))
    .sort((a, b) => rank[a.status] - rank[b.status] || a.job_id.localeCompare(b.job_id))
  near = near
    .filter((n) => jobMatches({ ...n, process_tags: PARTS.get(n.job_id)?.process_tags }, q, processes, PARTS.get(n.job_id)?.material))
    .sort((a, b) => a.missing.length - b.missing.length || b.value_cad - a.value_cad)

  return {
    ...base,
    query: { q, process: processes, include_near_miss: true },
    stage: opts.stage,
    counts: {
      eligible: eligible.length,
      offered_to_you: eligible.filter((e) => e.status === "offered_to_you").length,
      open: eligible.filter((e) => e.status === "open").length,
      assigned_elsewhere: eligible.filter((e) => e.status === "assigned_elsewhere").length,
      near_miss: near.length,
    },
    eligible,
    near_miss: near,
  }
}

// ---------------------------------------------------------------------------- graph

export function localGraphSummary(): GraphSummary {
  return JSON.parse(JSON.stringify(graphSummaryFx)) as GraphSummary
}

const EGO = egoDemo as unknown as GraphEgo
const KIND_ORDER = ["Prime", "Program", "Job", "Shop", "Process", "Cert", "Region", "Occupation", "DNDVendor", "Manufacturer"]

interface PartFull {
  id: string
  part_no: string
  description: string
  est_value_cad: number
  hours_week: number
  controlled: boolean
  ccv_pct: number
  material: string
  qty: number
}

/** Every node and edge the demo data knows: the saved syn-012 neighbourhood plus Northgate's program. */
function demoGraph(): { nodes: Map<string, GraphNode>; edges: GraphEdge[] } {
  const nodes = new Map<string, GraphNode>(EGO.nodes.map((n) => [n.id, n]))
  const edges = [...EGO.edges]
  const prog = (programFx as { program: Record<string, unknown> }).program
  nodes.set("prime:northgate", {
    id: "prime:northgate",
    type: "Prime",
    label: "Northgate Land Systems",
    props: { fictional: true, label_text: "Fictional prime", name: "Northgate Land Systems" },
  })
  nodes.set("program:northgate", {
    id: "program:northgate",
    type: "Program",
    label: "Northgate demo program",
    props: {
      fictional: true,
      name: "Northgate demo program",
      program_id: "northgate",
      site_city: SITE.city,
      contract_value_cad: prog.contract_value_cad,
      obligation_cad: prog.obligation_cad,
      rules_label: "Simplified ITB rules for demo",
    },
  })
  edges.push({ source: "prime:northgate", target: "program:northgate", type: "HAS_PROGRAM", props: {} })
  for (const j of (partsFx as { jobs: PartFull[] }).jobs) {
    const id = `job:${j.id}`
    if (!nodes.has(id))
      nodes.set(id, {
        id,
        type: "Job",
        label: `${j.id} · ${j.description}`,
        props: {
          job_id: j.id,
          part_no: j.part_no,
          description: j.description,
          value_cad: j.est_value_cad,
          hours_week: j.hours_week,
          controlled: j.controlled,
          ccv_pct: j.ccv_pct,
          material: j.material,
          qty: j.qty,
        },
      })
    edges.push({ source: "program:northgate", target: id, type: "HAS_JOB", props: {} })
  }
  // The welding certificate (a /graph start option): jobs that need it and synthetic shops that
  // declare it. The saved ego only carries the certs Tallowfield touches.
  const cwb = "cert:CWB_W47.1"
  if (!nodes.has(cwb))
    nodes.set(cwb, { id: cwb, type: "Cert", label: "CWB W47.1", props: { label: "CWB W47.1", type: "CWB_W47.1" } })
  const partsWithCerts = (partsFx as { jobs: (PartFull & { required_certs?: string[] })[] }).jobs
  for (const j of partsWithCerts)
    if (j.required_certs?.includes("CWB_W47.1"))
      edges.push({ source: `job:${j.id}`, target: cwb, type: "NEEDS_CERT", props: { via: "required_certs" } })
  for (const sh of SYNTHETIC) {
    const c = sh.cert_summary?.find((x) => x.type === "CWB_W47.1" && x.status !== "unknown")
    if (!c) continue
    const sid = `shop:${sh.id}`
    if (!nodes.has(sid))
      nodes.set(sid, {
        id: sid,
        type: "Shop",
        label: sh.name,
        props: { shop_id: sh.id, name: sh.name, city: sh.city, lat: sh.lat, lon: sh.lon, is_sme: sh.is_sme ?? null, source: "synthetic", label_text: "Synthetic" },
      })
    edges.push({ source: sid, target: cwb, type: "HOLDS_CERT", props: { status: c.status } })
  }
  return { nodes, edges }
}

let GRAPH: ReturnType<typeof demoGraph> | null = null

/** Resolve a bare id ("syn-012", "NG-034", "welding") to a namespaced one, like engine.graphdb.resolve_id. */
function resolve(nodes: Map<string, GraphNode>, id: string): string | null {
  if (nodes.has(id)) return id
  for (const prefix of ["shop:", "job:", "process:", "cert:", "region:", "prime:", "program:", "occupation:", "dnd:", "mfr:"])
    if (nodes.has(prefix + id)) return prefix + id
  return null
}

/** /graph/ego in demo mode (depth 1). `partial` unless it is the saved syn-012 root. */
export function localGraphEgo(id: string, limit = 150): GraphEgo | null {
  GRAPH ??= demoGraph()
  const root = resolve(GRAPH.nodes, id)
  if (!root) return null
  const nbr = new Set<string>()
  const kept: GraphEdge[] = []
  for (const e of GRAPH.edges) {
    if (e.source === root) nbr.add(e.target)
    else if (e.target === root) nbr.add(e.source)
  }
  const kind = (n: string) => KIND_ORDER.indexOf(GRAPH!.nodes.get(n)?.type ?? "")
  const ordered = [...nbr].filter((n) => GRAPH!.nodes.has(n)).sort((a, b) => kind(a) - kind(b) || (a < b ? -1 : a > b ? 1 : 0))
  const keep = new Set([root, ...ordered.slice(0, Math.max(0, limit - 1))])
  const seen = new Set<string>()
  for (const e of GRAPH.edges) {
    if ((e.source === root || e.target === root) && keep.has(e.source) && keep.has(e.target)) {
      const k = `${e.source}|${e.type}|${e.target}`
      if (!seen.has(k)) {
        seen.add(k)
        kept.push(e)
      }
    }
  }
  return {
    engine: "memory",
    root,
    depth: 1,
    limit,
    truncated: ordered.length + 1 > limit,
    nodes: [...keep].map((n) => GRAPH!.nodes.get(n)!),
    edges: kept,
    partial: root !== EGO.root,
  }
}

/** Name and city of a fixture shop (synthetic or public), for page headings. */
export function fixtureShop(id: string): { name: string; city: string | null; source: string } | null {
  const s = SYNTHETIC.find((x) => x.id === id) ?? PUBLIC.find((x) => x.id === id)
  return s ? { name: s.name, city: s.city, source: s.source ?? "synthetic" } : null
}
