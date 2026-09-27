// Award package: the paperwork and kickoff call after a shop accepts an offer.
// Matches GET /shops/{shop_id}/offers/{job_id}/award (docs/api.md §6, additive).
// Demo only: no real e-signature, no file is stored, no invite is sent.

import type { CertType } from "@/lib/api/types"

export type AwardStatus = "not_started" | "in_progress" | "complete"
export type AwardDocKind = "sign" | "upload" | "auto"
export type AwardDocKey = "subcontract" | "nda" | "cgp" | "cpcsc" | "quality" | "fai" | "ccv" | "insurance"

export interface AwardDocument {
  key: AwardDocKey | string
  title: string
  kind: AwardDocKind
  /** One plain-language line: why Northgate needs it. */
  why: string
  status: "todo" | "done"
  done_at: string | null
  /** What the document says (sign) or what was attached (auto). */
  detail: string
}

export interface AwardCall {
  booked: boolean
  /** ISO timestamp of the booked slot. */
  slot: string | null
  /** Offered slots (ISO): next 5 business days at 10:00 and 14:00 local. */
  slots: string[]
  agenda: string[]
  with: string
  /** Engine extras (absent in the local build). */
  booked_at?: string | null
  timezone?: string
  duration_min?: number
}

export interface Award {
  shop_id: string
  job_id: string
  part_no: string
  description: string
  value_cad: number
  hours_week: number
  credit_cad: number
  controlled: boolean
  required_certs: (CertType | string)[]
  status: AwardStatus
  documents: AwardDocument[]
  call: AwardCall
  next_steps: string[]
  /** Engine extras (absent in the local build). */
  shop_name?: string
  accepted_at?: string | null
  done?: number
  total?: number
  demo_note?: string
  flags?: string[]
  /** Client-only: extra facts for the subcontract sheet (fixture build; absent from the engine). */
  qty?: number | null
  unit_price_cad?: number | null
  ccv_pct?: number | null
  /** Client-only: the offer's credit multiplier (2 = small business, counts double). */
  multiplier?: number | null
}

/** Where the award came from: the engine, or built on this device from demo data. */
export type AwardSource = "engine" | "local"

export interface AwardState {
  award: Award | null
  source: AwardSource
  loading: boolean
  /** "not_accepted" = the shop has not accepted this offer (engine 409 / local check); "not_found" = no such offer. */
  problem: "not_accepted" | "not_found" | "error" | null
  error: string | null
  busy: boolean
  signDocument(key: string): Promise<Award | null>
  bookCall(slot: string): Promise<Award | null>
  refresh(): Promise<void>
}
