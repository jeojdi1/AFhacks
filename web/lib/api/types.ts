// Muster API types, generated from docs/api.md v0.1. Owner: Lane B.
// docs/api.md is the source of truth: when the contract changes, change it
// there first (a `CONTRACT:` commit) and then update this file to match.
// Enums are `as const` arrays, so both the value list (for runtime checks and
// UI pickers) and the string-literal union are exported.

// ---------------------------------------------------------------------------
// §1 Vocabularies

export const PROCESS_TAGS = [
  "cnc_milling",
  "five_axis_milling",
  "cnc_turning",
  "sheet_metal",
  "welding",
  "heat_treat",
  "anodizing",
  "plating",
  "painting",
  "wire_harness",
  "electronics_assembly",
  "fasteners",
] as const;
export type ProcessTag = (typeof PROCESS_TAGS)[number];

export const MATERIALS = ["steel", "armour_steel", "stainless", "aluminum", "titanium", "copper", "polymer"] as const;
export type Material = (typeof MATERIALS)[number];

/** Ordered: standard < precision < ultra. */
export const TOLERANCE_CLASSES = ["standard", "precision", "ultra"] as const;
export type ToleranceClass = (typeof TOLERANCE_CLASSES)[number];

export const CERT_TYPES = [
  "CGP",
  "CPCSC_L1",
  "ISO9001",
  "AS9100",
  "NADCAP:HEAT_TREAT",
  "NADCAP:CHEM_PROCESSING",
  "NADCAP:COATINGS",
  "CWB_W47.1",
] as const;
export type CertType = (typeof CERT_TYPES)[number];

/** A certification counts for the rules if its status is verified, declared or pending_training. */
export const CERT_STATUSES = ["verified", "declared", "unknown", "pending_training"] as const;
export type CertStatus = (typeof CERT_STATUSES)[number];
export const COUNTING_CERT_STATUSES: readonly CertStatus[] = ["verified", "declared", "pending_training"];

/** Rejection reason codes, in filter order. */
export const FILTER_CODES = ["process", "envelope", "certs", "controlled_cgp", "cpcsc", "capacity"] as const;
export type FilterCode = (typeof FILTER_CODES)[number];

/** regular 1x, sme_direct 2x, training 5x, indigenous_training 10x. */
export const CREDIT_CATEGORIES = ["regular", "sme_direct", "training", "indigenous_training"] as const;
export type CreditCategory = (typeof CREDIT_CATEGORIES)[number];
export type DirectCreditCategory = Extract<CreditCategory, "regular" | "sme_direct">;
export type IndirectCreditCategory = Extract<CreditCategory, "training" | "indigenous_training">;

export const MULTIPLIERS = [1, 2, 5, 10] as const;
export type Multiplier = (typeof MULTIPLIERS)[number];

export const TRAINING_CATEGORIES = [
  "apprentice_sponsorship",
  "personal_certification",
  "skills_program_contribution",
  "education_costs",
] as const;
export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number];

export const RECIPIENT_TYPES = ["college", "apprenticeship_sponsor", "nonprofit", "indigenous_institution"] as const;
export type RecipientType = (typeof RECIPIENT_TYPES)[number];

export const SHOP_SOURCES = ["public", "synthetic"] as const;
export type ShopSource = (typeof SHOP_SOURCES)[number];

export const SHOP_LABELS = ["Synthetic", "Public data — unverified — not affiliated"] as const;
export type ShopLabel = (typeof SHOP_LABELS)[number];

export const ASSIGNMENT_STATUSES = ["offered", "accepted", "declined"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const PACKAGE_STATUSES = ["suggested", "funded"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export const PROGRAM_STATES = ["empty", "uploaded", "routed", "funded"] as const;
export type ProgramState = (typeof PROGRAM_STATES)[number];

// Closed value sets defined inline in §2/§3 of the contract.
export const JOB_STATUSES = ["unrouted", "assigned", "blocked"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const TAG_SOURCES = ["llm", "cache", "rules"] as const;
export type TagSource = (typeof TAG_SOURCES)[number];

export const SOLVERS = ["ortools", "greedy"] as const;
export type Solver = (typeof SOLVERS)[number];

export const TXN_ORIGINS = ["assignment", "training"] as const;
export type TxnOrigin = (typeof TXN_ORIGINS)[number];

export const TXN_TYPES = ["direct", "indirect"] as const;
export type TxnType = (typeof TXN_TYPES)[number];

/** Kind of gap (TrainingPackage.gap) and of readiness item. */
export const GAP_KINDS = ["cert", "capacity", "process"] as const;
export type GapKind = (typeof GAP_KINDS)[number];

// ---------------------------------------------------------------------------
// §2 Shared objects

/** [x, y, z] in millimetres. A job fits if its sorted dims are each ≤ the shop's sorted dims. */
export type EnvelopeMm = [number, number, number];

export interface Provenance {
  field: string;
  source_url: string | null;
  /** e.g. "synthetic"; not a closed set in the contract. */
  confidence: string;
}

export interface CertSummary {
  type: CertType;
  status: CertStatus;
}

export interface Shop {
  id: string;
  name: string;
  source: ShopSource;
  label: ShopLabel;
  city: string;
  lat: number;
  lon: number;
  naics: string;
  employee_band: string;
  is_sme: boolean;
  processes: ProcessTag[];
  machines: string[];
  materials: Material[];
  max_envelope_mm: EnvelopeMm;
  tolerance_class: ToleranceClass;
  capacity_hours_week: number;
  lead_time_days: number;
  website: string | null;
  contact_role_email: string | null;
  provenance: Provenance[];
  /** Always present in list views (GET /shops); may be present elsewhere. */
  cert_summary?: CertSummary[];
}

/** A Shop as returned by GET /shops (cert_summary guaranteed). */
export type ShopListItem = Shop & { cert_summary: CertSummary[] };

export interface Certification {
  shop_id: string;
  type: CertType;
  status: CertStatus;
  source_url: string | null;
  verified_at: string | null;
  expires_at: string | null;
  note: string | null;
}

/** One per parts-list line. */
export interface Job {
  id: string;
  program_id: string;
  part_no: string;
  description: string;
  /** Fleet-lifetime quantity. */
  qty: number;
  unit_price_cad: number;
  /** qty × unit_price_cad */
  est_value_cad: number;
  ccv_pct: number;
  /** Weekly shop load during production; counts against capacity_hours_week. */
  hours_week: number;
  material: Material;
  process_tags: ProcessTag[];
  envelope_mm: EnvelopeMm;
  tolerance_class: ToleranceClass;
  required_certs: CertType[];
  controlled: boolean;
  tag_source: TagSource;
  /** Present only when the tagger fell back to a default process. */
  tag_warning?: string;
  status: JobStatus;
}

export interface ScoreBreakdown {
  fit: number;
  distance: number;
  lead_time: number;
  itb_value: number;
}

export interface Assignment {
  job_id: string;
  part_no: string;
  description: string;
  shop_id: string;
  shop_name: string;
  shop_source: ShopSource;
  shop_city: string;
  shop_lat: number;
  shop_lon: number;
  is_sme: boolean;
  controlled: boolean;
  hours_week: number;
  value_cad: number;
  ccv_pct: number;
  category: DirectCreditCategory;
  multiplier: Multiplier;
  credit_cad: number;
  distance_km: number;
  score: number;
  score_breakdown: ScoreBreakdown;
  /** Exactly 3 short strings (the top 3). */
  reasons: string[];
  status: AssignmentStatus;
}

export interface BlockedJob {
  job_id: string;
  part_no: string;
  description: string;
  process_tags: ProcessTag[];
  required_certs: CertType[];
  value_cad: number;
  hours_week: number;
  reason_code: FilterCode;
  reason: string;
  /** Shops passing every filter except capacity. */
  eligible_shop_count: number;
  /** Shops failing each filter (a shop can fail more than one). */
  failing_filters: Record<FilterCode, number>;
  /** Always ≥ 1 in GET /gaps. */
  suggestion_ids: string[];
}

export interface CreditTxn {
  id: string;
  program_id: string;
  origin: TxnOrigin;
  /** Job id (origin "assignment") or package id (origin "training"). */
  ref_id: string;
  shop_id: string;
  type: TxnType;
  category: CreditCategory;
  value_cad: number;
  ccv_pct: number;
  multiplier: Multiplier;
  /** value_cad × ccv_pct × multiplier */
  credit_cad: number;
  /** e.g. "simplified-demo", "assumption". */
  flags: string[];
}

export interface TrainingGap {
  kind: GapKind;
  /** A cert type (kind "cert") or a process tag (kind "capacity" / "process"). */
  requirement: CertType | ProcessTag;
  detail: string;
}

/** Extra weekly hours per process, e.g. { welding: 80 }. */
export type CapacityUnlock = Partial<Record<ProcessTag, number>>;

export interface TrainingPackage {
  id: string;
  program_id: string;
  title: string;
  blocked_job_ids: string[];
  shop_id: string;
  shop_name: string;
  shop_city: string;
  shop_source: ShopSource;
  gap: TrainingGap;
  /** Primary category. */
  category: TrainingCategory;
  /** All categories that apply. */
  categories: TrainingCategory[];
  recipient_type: RecipientType;
  recipient_example: string;
  trainees: number;
  est_cost_cad: number;
  cost_basis: string;
  multiplier: Multiplier;
  /** est_cost_cad × 1.0 × multiplier */
  est_credit_cad: number;
  cert_unlock: CertType | null;
  capacity_unlock: CapacityUnlock | null;
  unblocks_value_cad: number;
  eligibility_note: string;
  flags: string[];
  status: PackageStatus;
}

/** Program totals before/after a fund call. */
export interface Snapshot {
  assigned: number;
  blocked: number;
  credit_total_cad: number;
  obligation_met_pct: number;
  direct_credit_cad: number;
  indirect_credit_cad: number;
  smb_achieved_cad: number;
  smb_progress_pct: number;
}

/** GET /shops/{id} → offers[] */
export interface Offer {
  job_id: string;
  part_no: string;
  description: string;
  program_id: string;
  prime_name: string;
  value_cad: number;
  hours_week: number;
  multiplier: Multiplier;
  credit_cad: number;
  reasons: string[];
  status: AssignmentStatus;
}

/** GET /shops/{id} → readiness[]: jobs this shop fails on exactly one requirement. */
export interface ReadinessItem {
  kind: GapKind;
  requirement: CertType | ProcessTag;
  jobs_unlocked: string[];
  value_cad: number;
  message: string;
}

/** GET /shops/{id} → training[] */
export interface ShopTraining {
  package_id: string;
  status: PackageStatus;
  category: TrainingCategory;
  trainees: number;
  recipient_example: string;
  cert_unlock: CertType | null;
  capacity_unlock: CapacityUnlock | null;
  message: string;
}

export interface ProgramSite {
  city: string;
  lat: number;
  lon: number;
}

export interface Program {
  id: string;
  prime_name: string;
  prime_label: string;
  site: ProgramSite;
  contract_value_cad: number;
  obligation_cad: number;
  smb_target_pct: number;
  rules_version: string;
  rules_label: string;
}

export interface ProgramCounts {
  jobs: number;
  assigned: number;
  blocked: number;
  shops: number;
}

export interface RouteStats {
  jobs: number;
  assigned: number;
  blocked: number;
  assigned_value_cad: number;
  /** Assigned value going to SMEs ÷ assigned value. */
  sme_share_pct: number;
}

export interface SmbProgress {
  target_pct: number;
  target_cad: number;
  achieved_cad: number;
  progress_pct: number;
  basis: string;
}

export interface MultiplierBreakdownRow {
  category: CreditCategory;
  label: string;
  multiplier: Multiplier;
  count: number;
  value_cad: number;
  credit_cad: number;
}

export interface GapsSummary {
  blocked_jobs: number;
  blocked_value_cad: number;
  top_reason: string;
}

// ---------------------------------------------------------------------------
// §3 Endpoint responses

/** Error body for 400 / 404 / 409 / 501. */
export interface ErrorResponse {
  detail: string;
}

/** GET /health */
export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
}

/** POST /demo/reset */
export interface ResetResponse {
  ok: boolean;
  program_id: string;
  shops: number;
  jobs: number;
  message: string;
}

/** GET /programs/{id} */
export interface ProgramResponse {
  program: Program;
  counts: ProgramCounts;
  state: ProgramState;
}

/** POST /programs/{id}/parts */
export interface PartsUploadResponse {
  program_id: string;
  count: number;
  tagger: Record<TagSource, number>;
  jobs: Job[];
}

/** POST /programs/{id}/route */
export interface RouteResponse {
  program_id: string;
  solver: Solver;
  elapsed_ms: number;
  stats: RouteStats;
  assignments: Assignment[];
  blocked: BlockedJob[];
}

/** GET /programs/{id}/assignments */
export interface AssignmentsResponse {
  program_id: string;
  assignments: Assignment[];
}

/** GET /programs/{id}/jobs: every uploaded job with its current status ([] before any upload). */
export interface JobsResponse {
  program_id: string;
  jobs: Job[];
}

/** GET /programs/{id}/ledger */
export interface LedgerResponse {
  program_id: string;
  rules_version: string;
  rules_label: string;
  obligation_cad: number;
  /** = Σ transactions[].credit_cad = direct + indirect (±$0.01) */
  credit_total_cad: number;
  /** = credit_total_cad / obligation_cad */
  obligation_met_pct: number;
  direct_credit_cad: number;
  indirect_credit_cad: number;
  smb: SmbProgress;
  /** Always all 4 categories, even when zero. */
  multiplier_breakdown: MultiplierBreakdownRow[];
  transactions: CreditTxn[];
  flags: string[];
}

/** GET /programs/{id}/gaps */
export interface GapsResponse {
  program_id: string;
  summary: GapsSummary;
  blocked: BlockedJob[];
  suggestions: TrainingPackage[];
}

/** POST /programs/{id}/training/{package_id}/fund */
export interface FundResponse {
  program_id: string;
  package_id: string;
  /** status "funded" */
  package: TrainingPackage;
  before: Snapshot;
  after: Snapshot;
  /** Jobs that were blocked and are now assigned. */
  unblocked_jobs: Assignment[];
  still_blocked: string[];
  /** origin "training" */
  training_txn: CreditTxn;
  /** after.credit_total_cad − before.credit_total_cad = training_cad + jobs_cad */
  credit_added: number;
  credit_added_breakdown: { training_cad: number; jobs_cad: number };
  headline: string;
  /** Client only: rebuilt from engine state after a reload (never animated). */
  synthetic?: boolean;
}

/** GET /shops (optional ?source=public|synthetic) */
export interface ShopsResponse {
  shops: ShopListItem[];
}

/** GET /shops/{id} */
export interface ShopDetailResponse {
  shop: Shop;
  /** One per cert_type. */
  certifications: Certification[];
  /** [] before routing. */
  offers: Offer[];
  readiness: ReadinessItem[];
  training: ShopTraining[];
}

// ---------------------------------------------------------------------------
// §4 Fixtures manifest (data/fixtures/index.json)

export interface FixtureIndex {
  program_id: string;
  demo_shop_id: string;
  demo_package_id: string;
  /** "<METHOD> <path>" → file, routed state (both fund calls included). */
  endpoints: Record<string, string>;
  /** "<METHOD> <path>" → file, state after funding demo_package_id. */
  after_fund: Record<string, string>;
}

/** Response type for a (method, path) pair; paths use concrete ids, e.g. "/programs/northgate/ledger". */
export type ResponseFor<M extends string, P extends string> = M extends "GET"
  ? P extends "/health"
    ? HealthResponse
    : P extends "/shops"
      ? ShopsResponse
      : P extends `/shops/${string}`
        ? ShopDetailResponse
        : P extends `/programs/${string}/assignments`
          ? AssignmentsResponse
          : P extends `/programs/${string}/jobs`
            ? JobsResponse
            : P extends `/programs/${string}/ledger`
              ? LedgerResponse
              : P extends `/programs/${string}/gaps`
                ? GapsResponse
                : P extends `/programs/${string}`
                  ? ProgramResponse
                  : unknown
  : M extends "POST"
    ? P extends "/demo/reset"
      ? ResetResponse
      : P extends `/programs/${string}/parts`
        ? PartsUploadResponse
        : P extends `/programs/${string}/route`
          ? RouteResponse
          : P extends `/programs/${string}/training/${string}/fund`
            ? FundResponse
            : unknown
    : unknown;
