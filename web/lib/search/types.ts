// Response shapes for the search + graph endpoints (docs/api.md §7, additive v0.3).
// Read-only views: nothing here writes the engine State.

export type SearchEngine = "neo4j" | "memory"

export interface SearchCert {
  type: string
  status: string
  source_url: string | null
}

export interface DndHistory {
  contracts: number
  value_cad: number
  last_date: string | null
  confidence: string | null
  links: number
  source: string
}

export interface ShopResult {
  shop_id: string
  name: string
  source: "synthetic" | "public"
  label: string
  onboarding: "onboarded" | "discovered"
  routable: boolean
  city: string | null
  lat: number | null
  lon: number | null
  distance_km: number | null
  is_sme: boolean
  processes: string[]
  certs: SearchCert[]
  dnd_history: DndHistory | null
  match: { matched: string[]; missing: string[] }
  score: number
}

export interface ShopSearchQueryEcho {
  q: string | null
  process: string[]
  cert: string[]
  near: string | null
  near_lat: number | null
  near_lon: number | null
  radius_km: number | null
  source: "all" | "synthetic" | "public"
  dnd_history: boolean | null
  match: "all" | "any"
  limit: number
}

export interface ShopSearchResponse {
  engine: SearchEngine
  query: ShopSearchQueryEcho
  counts: { total: number; synthetic: number; public: number }
  results: ShopResult[]
  notes?: string[]
}

/** What the UI asks for (a subset of the /search/shops params). */
export interface ShopSearchParams {
  q?: string | null
  process: string[]
  cert: string[]
  near?: string | null
  radius_km?: number | null
  source: "all" | "synthetic" | "public"
  dnd_history?: boolean | null
  limit?: number
}

export type JobStatus = "offered_to_you" | "assigned_elsewhere" | "open"

export interface EligibleJob {
  job_id: string
  part_no: string
  description: string
  value_cad: number
  hours_week: number
  process_tags: string[]
  controlled: boolean
  credit_cad: number
  multiplier: number
  reasons: string[]
  status: JobStatus
  offer_status: string | null
}

export interface MissingReq {
  kind: "cert" | "process"
  requirement: string
  message: string
}

export interface NearMissJob {
  job_id: string
  part_no: string
  description: string
  value_cad: number
  hours_week: number
  status: JobStatus
  missing: MissingReq[]
}

export interface Tender {
  title: string
  reference: string
  solicitation_number: string | null
  closing_date: string | null
  buyer: string | null
  category: string | null
  notice_type: string | null
  region: string | null
  url: string | null
}

export interface JobSearchResponse {
  engine: SearchEngine
  shop_id: string
  query: { q: string | null; process: string[]; include_near_miss: boolean }
  routable: boolean
  stage: string
  counts: { eligible: number; offered_to_you: number; open: number; assigned_elsewhere: number; near_miss: number }
  eligible: EligibleJob[]
  near_miss: NearMissJob[]
  tenders: Tender[]
  tenders_source?: string
  notice?: string
}

export interface GraphSummary {
  engine: SearchEngine
  nodes: Record<string, number>
  edges: Record<string, number>
  totals: { nodes: number; edges: number }
}

export interface GraphNode {
  id: string
  type: string
  label: string
  props: Record<string, unknown>
}

export interface GraphEdge {
  source: string
  target: string
  type: string
  props: Record<string, unknown>
}

export interface GraphEgo {
  engine: SearchEngine
  root: string
  depth: number
  limit: number
  truncated: boolean
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Demo data only: the neighbourhood was rebuilt from saved answers and may be incomplete. */
  partial?: boolean
}

/** Where an answer came from: the running engine, or the saved demo answers. */
export type DataOrigin = "live" | "demo" | "demo-fallback"

export interface Loaded<T> {
  data: T | null
  loading: boolean
  error: string | null
  origin: DataOrigin
}
