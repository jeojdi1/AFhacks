// Shared types for the phone app (/m) and the shop-side endpoints.
// Source: docs/app-spec.md §2.2–§2.8 (engine shapes in §2.3–§2.7). Owner: Agent S.
// Engine shapes mirror docs/api.md §6 (v0.2, additive). When Agent E lands the
// contract, docs/api.md wins; change this file to match.
//
// Every value list is an `as const` array so pickers and runtime checks can
// share it with the string-literal union.

import type {
  Assignment,
  AssignmentStatus,
  CertStatus,
  CertType,
  Certification,
  Job,
  Offer,
  ProcessTag,
  Shop,
  ShopDetailResponse,
} from "@/lib/api/types"

export type { Assignment, CertType, Certification, Job, Offer, ProcessTag, Shop, ShopDetailResponse }

/** The one demo program. */
export const APP_PROGRAM_ID = "northgate"

// ---------------------------------------------------------------------------
// §2.3 Offer decisions

export const DECISION_KINDS = ["accepted", "declined", "question", "undo"] as const
export type DecisionKind = (typeof DECISION_KINDS)[number]
/** Decisions that are stored (undo deletes the stored decision). */
export type StoredDecisionKind = Exclude<DecisionKind, "undo">

export const REASON_CODES = ["capacity", "price", "tooling", "schedule", "not_our_process", "other"] as const
export type ReasonCode = (typeof REASON_CODES)[number]

export const QUESTION_CODES = ["lead_time", "material_supply", "first_article", "quantity_split"] as const
export type QuestionCode = (typeof QUESTION_CODES)[number]

export const DECISION_NOTE_MAX = 280

/** What the UI passes to decideOffer(). */
export interface DecisionInput {
  decision: DecisionKind
  /** Required when decision is "declined". */
  reason_code?: ReasonCode | null
  /** Required when decision is "question". */
  question_code?: QuestionCode | null
  /** ≤ 280 characters. */
  note?: string | null
}

/** POST /shops/{shop_id}/offers/{job_id}/decision body. */
export interface DecisionRequest {
  decision: DecisionKind
  reason_code: ReasonCode | null
  question_code: QuestionCode | null
  note: string | null
  idempotency_key: string
}

/**
 * OfferDecision. Stored decisions are accepted/declined/question; the record
 * returned for an undo carries decision "undo" and is never stored.
 */
export interface OfferDecisionRec {
  shop_id: string
  job_id: string
  decision: DecisionKind
  reason_code: ReasonCode | null
  question_code: QuestionCode | null
  note: string | null
  /** ISO timestamp (UTC). */
  at: string
  idempotency_key: string
  /**
   * Northgate's reply to a question decision (POST /shops/{id}/offers/{job}/reply).
   * Absent until the prime replies; a new decision by the shop drops it.
   */
  reply?: OfferReply | null
  /** Client only: queued in the outbox, not yet confirmed by the engine ("Will send"). */
  pending?: boolean
}

/** decision.reply: the prime's canned answer to a shop question (docs/api.md). */
export interface OfferReply {
  code: string
  text: string
  /** ISO timestamp (UTC). */
  at: string
}

/** 200 from POST /shops/{shop_id}/offers/{job_id}/decision. */
export interface DecisionResponse {
  decision: OfferDecisionRec
  assignment_status: AssignmentStatus
  /** null when the same decision is sent again under a new key (nothing new for the prime). */
  event: AppEvent | null
}

// ---------------------------------------------------------------------------
// §2.3 Events

export const EVENT_KINDS = [
  "routed",
  "offer_accepted",
  "offer_declined",
  "offer_question",
  "offer_undo",
  "funding_requested",
  "package_funded",
  "capacity_confirmed",
  "cert_declared",
  "offer_reply",
  "reoffered",
] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export interface AppEvent {
  /** Starts at 1 per program. Fixture mode numbers events locally. */
  seq: number
  /** ISO timestamp (UTC). */
  ts: string
  kind: EventKind
  shop_id: string | null
  shop_name: string | null
  job_id: string | null
  package_id: string | null
  value_cad: number | null
  credit_cad: number | null
  message: string
  payload: Record<string, unknown>
  /** Written by the demo simulator (POST /demo/simulate/tick). Optional, additive. */
  simulated?: boolean
}

/** GET /programs/{program_id}/events?since=&limit= */
export interface EventsResponse {
  program_id: string
  last_seq: number
  /** More events after this page: call again at once with since = the last seq received. */
  has_more: boolean
  events: AppEvent[]
}

// ---------------------------------------------------------------------------
// §2.5 Funding requests

export const FUNDING_REQUEST_STATUSES = ["requested", "funded"] as const
export type FundingRequestStatus = (typeof FUNDING_REQUEST_STATUSES)[number]

export interface FundingRequestRec {
  package_id: string
  shop_id: string
  /** Cert type or process tag (TrainingPackage.gap.requirement). */
  requirement: string
  /** "funded" is derived from the package status. */
  status: FundingRequestStatus
  at: string
  /** Engine records carry it; "sim:<step>" marks a simulated request. */
  idempotency_key?: string
  /** Client only: queued in the outbox. */
  pending?: boolean
}

/** POST /shops/{shop_id}/funding-requests body. */
export interface FundingRequestBody {
  requirement: string
  idempotency_key: string
}

export interface FundingRequestResponse {
  request: FundingRequestRec
  /** null for a repeat request under a new key (the existing request is returned). */
  event: AppEvent | null
}

// ---------------------------------------------------------------------------
// §2.7 Capacity check-in

export const HORIZON_WEEKS = [4, 8, 12] as const
export type HorizonWeeks = (typeof HORIZON_WEEKS)[number]

/** Chip values for the capacity sheet; 120 means "120+". */
export const CAPACITY_CHIPS = [0, 20, 40, 80, 120] as const
export const CAPACITY_MAX_HOURS = 2000

export type HoursByProcess = Partial<Record<ProcessTag, number>>

/** What the UI passes to confirmCapacity(). Give hours_week, by_process, or both. */
export interface CapacityInput {
  hours_week?: number | null
  by_process?: HoursByProcess | null
  horizon_weeks: HorizonWeeks
}

/** POST /shops/{shop_id}/capacity body. */
export interface CapacityRequest {
  hours_week: number | null
  by_process: HoursByProcess | null
  horizon_weeks: HorizonWeeks
  idempotency_key: string
}

export interface CapacityCheckin {
  shop_id: string
  hours_week: number
  by_process: HoursByProcess | null
  horizon_weeks: HorizonWeeks
  confirmed_at: string
  /** Always false tonight: routing still uses the profile capacity. */
  used_in_routing: boolean
  /** Client only: queued in the outbox. */
  pending?: boolean
}

export interface CapacityResult {
  capacity: CapacityCheckin
  accepted_load_hours: number
  offered_load_hours: number
  over_by_hours: number
  event: AppEvent | null
}

// ---------------------------------------------------------------------------
// §2.4 Certificate declarations

export const CERT_NUMBER_MAX = 40

export interface CertDeclaration {
  shop_id: string
  type: CertType
  /** YYYY-MM-DD */
  expires_at: string
  cert_number: string | null
  status: "declared"
  declared_at: string
  /** "Shop-declared; not used for routing until reviewed" */
  note: string
  /** Client only: queued in the outbox. */
  pending?: boolean
}

/** POST /shops/{shop_id}/certifications/{cert_type} body. */
export interface CertDeclareRequest {
  expires_at: string
  cert_number: string | null
  idempotency_key: string
}

export interface CertDeclareResponse {
  declaration: CertDeclaration
  event: AppEvent
}

// ---------------------------------------------------------------------------
// §2.3 Actions reads

/** GET /shops/{shop_id}/actions */
export interface ShopActionsResponse {
  shop_id: string
  routed_at: string | null
  decisions: OfferDecisionRec[]
  funding_requests: FundingRequestRec[]
  capacity: CapacityCheckin | null
  declared_certs: CertDeclaration[]
}

/** GET /programs/{program_id}/actions (all shops; capacity is a list). */
export interface ProgramActionsResponse {
  program_id?: string
  routed_at: string | null
  decisions: OfferDecisionRec[]
  funding_requests: FundingRequestRec[]
  capacity: CapacityCheckin[]
  declared_certs: CertDeclaration[]
}

// ---------------------------------------------------------------------------
// Certificates with dates (shop bundle) and renewals (§2.4)

/** Where a certification's dates come from. */
export const DATE_BASES = ["illustrative", "shop-declared", "registry"] as const
export type DateBasis = (typeof DATE_BASES)[number]

/**
 * A certification with its best-known dates. Live: GET /shops/{id}. Fixtures:
 * the fixture detail plus dates from data/processed/shops_synthetic.json. A
 * shop-declared expiry (CertDeclaration) overrides expires_at and sets
 * date_basis "shop-declared"; the status is never upgraded to "verified".
 */
export interface CertWithDates extends Certification {
  date_basis: DateBasis
  /** The shop's own declaration for this type, if any. */
  declaration: CertDeclaration | null
}

export const RENEWAL_STAGES = ["ok", "window_open", "urgent", "lapsed", "unknown"] as const
export type RenewalStage = (typeof RENEWAL_STAGES)[number]

/** Output of renewalFor() in web/lib/app/renewals.ts (Agent C). */
export interface Renewal {
  cert_type: string
  status: CertStatus
  expires_at: string | null
  act_by: string | null
  days_left: number | null
  stage: RenewalStage
  action: string
  consequence: string | null
  source_url: string
  registry_url: string | null
  flag: "verified" | "assumption"
  jobs_at_risk: string[]
  value_at_risk_cad: number
  credit_at_risk_cad: number
  date_basis: DateBasis
}

export interface RenewalContext {
  today: Date
  shopId: string
  jobsById: Record<string, Job>
  assignments: Assignment[]
}

/** One row of data/rules/renewals.json (Agent C). */
export interface RenewalRule {
  cert_type: string
  act_by_days: number | null
  remind_days: number | null
  text: string
  source_url: string
  registry_url?: string | null
  flag: "verified" | "assumption"
}

/** One step of data/rules/readiness_steps.json (Agent R). */
export interface ReadinessStep {
  label: string
  detail: string
  source_url: string | null
  time_stated: string | null
  cost_stated: string | null
  flag: "verified" | "inferred" | "assumption"
}

// ---------------------------------------------------------------------------
// §2.2 Today

export const ATTENTION_KINDS = ["offers", "reply", "renewal", "capacity", "readiness", "training"] as const
export type AttentionKind = (typeof ATTENTION_KINDS)[number]
export type AttentionTone = "action" | "warn" | "danger" | "info"

export interface AttentionItem {
  kind: AttentionKind
  ref_id: string | null
  title: string
  detail: string
  due_at: string | null
  value_cad: number | null
  href: string
  tone: AttentionTone
}

// ---------------------------------------------------------------------------
// Client-side slices

/** useAppActions() narrowed to one shop (see actions-store.tsx). */
export interface ShopActions {
  shopId: string
  /** key job_id */
  decisions: Record<string, OfferDecisionRec>
  /** key package_id, only this shop's packages */
  fundingRequests: Record<string, FundingRequestRec>
  capacity: CapacityCheckin | null
  /** key cert type */
  declaredCerts: Record<string, CertDeclaration>
  /** This shop's events, newest last. */
  events: AppEvent[]
  routedAt: string | null
  decide(jobId: string, input: DecisionInput): Promise<OfferDecisionRec | null>
  requestFunding(requirement: string): Promise<FundingRequestRec | null>
  confirmCapacity(input: CapacityInput): Promise<CapacityResult | null>
  declareCertExpiry(certType: string, expiresAt: string, certNumber?: string): Promise<CertDeclaration | null>
}

/** Return value of useShopBundle(shopId) in shop-bundle.ts. */
export interface ShopBundle {
  detail: ShopDetailResponse | null
  shop: Shop | null
  /** detail.offers with this shop's stored decisions applied to status. */
  offers: Offer[]
  /** Every job in the program, key job id. */
  jobsById: Record<string, Job>
  /** Every assignment in the program, key job id (filter by shop_id when needed). */
  assignmentsById: Record<string, Assignment>
  /** This shop's assignments. */
  assignments: Assignment[]
  certs: CertWithDates[]
  actions: ShopActions
  loading: boolean
  error: string | null
  /** ISO time of the last successful load. */
  updatedAt: string | null
  refresh(): Promise<void>
}
