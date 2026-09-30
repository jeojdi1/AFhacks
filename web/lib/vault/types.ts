// Supplier document vault: "paperwork once" (docs/api.md §6.2, additive v0.6).
// Matches GET /shops/{shop_id}/vault. Shieldworks records only that a document is on
// file (type and dates). No file is stored, and no banking details or personal names.

export type VaultStatus = "on_file" | "expiring_soon" | "expired" | "missing"
export type VaultKey = "insurance" | "quality" | "nda" | "ccv" | "vendor"

export interface VaultItem {
  key: VaultKey | string
  title: string
  /** One plain line: what it is and why a defence company asks for it. */
  why: string
  /** The award package document it fills in (null for the vendor form). */
  award_document: string | null
  has_expiry: boolean
  status: VaultStatus
  on_file: boolean
  /** on_file or expiring_soon: the next award reuses it. */
  reusable: boolean
  on_file_at: string | null
  expires_at: string | null
  days_left: number | null
  source: "synthetic" | "shop" | null
  note: string | null
  marked_at?: string | null
  /** Minutes one reuse saves (assumption, not measured). */
  minutes_saved: number
}

export interface TimeSaved {
  minutes: number
  /** "about 3.5 hours" */
  label: string
  flag: "assumption" | string
  basis: string
}

export interface Vault {
  shop_id: string
  shop_name?: string | null
  shop_source?: string | null
  as_of: string
  items: VaultItem[]
  on_file: number
  total: number
  expired: number
  expiring_soon: number
  time_saved_per_award: TimeSaved
  note: string
  flags?: string[]
}

/** Where the vault came from: the engine, or built on this device from demo data. */
export type VaultSource = "engine" | "local"

export interface VaultState {
  vault: Vault | null
  source: VaultSource
  loading: boolean
  error: string | null
  busy: boolean
  /** Mark one item on file (optionally with an expiry), or off file with onFile: false. */
  mark(key: string, opts?: { onFile?: boolean; expiresAt?: string | null }): Promise<void>
  refresh(): Promise<void>
}
