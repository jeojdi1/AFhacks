// Award package: the paperwork and kickoff call after a shop accepts an offer.
// Matches GET /shops/{shop_id}/offers/{job_id}/award (docs/api.md §6, additive).
// Demo only: no real e-signature, no file is stored, no invite is sent.

import type { CertType } from "@/lib/api/types"
import type { TimeSaved, VaultStatus } from "@/lib/vault/types"

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
  /** v0.6 paperwork once (absent from older engines): done because it is on file in the vault. */
  reused?: boolean
  /** "Reused from your profile" when reused. */
  reused_label?: string | null
  /** The vault item this document maps to (null for subcontract, cgp, cpcsc, fai). */
  vault_key?: string | null
  vault_status?: VaultStatus | null
  vault_expires_at?: string | null
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
  /** v0.6 paperwork once: documents done automatically (attached or reused from the vault). */
  done_automatically?: number
  /** Documents reused from the vault. */
  reused?: number
  /** "4 of 6 done automatically" */
  automatic_summary?: string
  /** Estimated time saved by reuse (assumption). */
  time_saved?: TimeSaved
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
  /** Mark a document done; saveToProfile also keeps it on file in the vault for the next award. */
  signDocument(key: string, opts?: { saveToProfile?: boolean }): Promise<Award | null>
  bookCall(slot: string): Promise<Award | null>
  refresh(): Promise<void>
}
