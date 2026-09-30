// The vault built on this device (demo data mode, or an engine without the §6.2 routes).
// Same catalogue, statuses and wording as engine/vault.py: seeds from
// data/processed/vault_synthetic.json (bundled at build time), then this device's own
// marks (localStorage "muster.vault.v1", synced across tabs via the storage event).

import seedFile from "../../../data/processed/vault_synthetic.json"
import { daysBetween, toISODate } from "@/lib/app/today"
import type { TimeSaved, Vault, VaultItem, VaultStatus } from "./types"

interface CatalogueItem {
  key: string
  title: string
  why: string
  award_document: string | null
  has_expiry: boolean
  minutes_saved: number
}

/** engine/vault.py VAULT_ITEMS, in display order. */
export const VAULT_CATALOGUE: readonly CatalogueItem[] = [
  {
    key: "insurance",
    title: "Certificate of insurance",
    why: "Proof of business liability insurance. Defence companies ask for it before a first order.",
    award_document: "insurance",
    has_expiry: true,
    minutes_saved: 30,
  },
  {
    key: "quality",
    title: "Quality certificates (copies)",
    why: "Copies of your quality certificates, such as ISO 9001 or AS9100, to attach to each award.",
    award_document: "quality",
    has_expiry: true,
    minutes_saved: 20,
  },
  {
    key: "nda",
    title: "Master mutual NDA with Northgate",
    why: "One two-way confidentiality agreement that covers every job with Northgate (fictional).",
    award_document: "nda",
    has_expiry: false,
    minutes_saved: 45,
  },
  {
    key: "ccv",
    title: "Canadian content (CCV) declaration template",
    why: "How much of your work is Canadian. Filled in with each job's numbers for Northgate's Canadian-content report.",
    award_document: "ccv",
    has_expiry: false,
    minutes_saved: 60,
  },
  {
    key: "vendor",
    title: "Vendor and banking set-up form",
    why: "How Northgate pays you. Set up once; Shieldworks stores no banking details.",
    award_document: null,
    has_expiry: false,
    minutes_saved: 40,
  },
]

export const VAULT_NOTE =
  "Shieldworks records only that a document is on file: its type and dates. No file is stored, and no banking details or personal names."
export const REUSED_LABEL = "Reused from your profile"
const EXPIRING_DAYS = 60 // assumption: the renewals.json reminder window
const SYNTHETIC_NOTE = "Synthetic shop: illustrative record (no file stored)"
const TIME_SAVED_BASIS = "Typical time to find, fill in and send each document again (assumption, not measured)."

interface Rec {
  on_file: boolean
  on_file_at: string | null
  expires_at: string | null
  source: "synthetic" | "shop"
  note: string | null
  at: string | null
}

type SeedFile = { shops?: Record<string, { key: string; on_file_at?: string | null; expires_at?: string | null; note?: string | null }[]> }

function seedsFor(shopId: string): Record<string, Rec> {
  const out: Record<string, Rec> = {}
  for (const r of (seedFile as unknown as SeedFile).shops?.[shopId] ?? []) {
    out[r.key] = {
      on_file: true,
      on_file_at: r.on_file_at ?? null,
      expires_at: r.expires_at ?? null,
      source: "synthetic",
      note: r.note ?? SYNTHETIC_NOTE,
      at: null,
    }
  }
  return out
}

/** "about 45 minutes" / "about 3.5 hours" (engine/vault.py time_saved). */
export function timeSaved(minutes: number): TimeSaved {
  const m = Math.max(0, Math.round(minutes))
  let label: string
  if (m <= 0) label = "no time saved yet"
  else if (m < 60) label = `about ${m} minutes`
  else {
    const half = Math.floor(m / 30 + 0.5) / 2
    label = `about ${half % 1 === 0 ? half.toFixed(0) : half.toFixed(1)} hour${half === 1 ? "" : "s"}`
  }
  return { minutes: m, label, flag: "assumption", basis: TIME_SAVED_BASIS }
}

function itemView(c: CatalogueItem, rec: Rec | undefined, today: Date): VaultItem {
  const onFile = !!rec?.on_file
  const days = onFile && rec?.expires_at ? daysBetween(today, rec.expires_at) : null
  const daysLeft = days === null || Number.isNaN(days) ? null : days
  let status: VaultStatus = "on_file"
  if (!onFile) status = "missing"
  else if (daysLeft !== null && daysLeft < 0) status = "expired"
  else if (daysLeft !== null && daysLeft <= EXPIRING_DAYS) status = "expiring_soon"
  return {
    ...c,
    status,
    on_file: onFile,
    reusable: status === "on_file" || status === "expiring_soon",
    on_file_at: onFile ? (rec?.on_file_at ?? null) : null,
    expires_at: onFile ? (rec?.expires_at ?? null) : null,
    days_left: daysLeft,
    source: onFile ? (rec?.source ?? null) : null,
    note: onFile ? (rec?.note ?? null) : null,
    marked_at: onFile ? (rec?.at ?? null) : null,
  }
}

// ---------------------------------------------------------------------------
// This device's marks

export const VAULT_KEY = "muster.vault.v1"
export const VAULT_EVENT = "muster:vault"
type Store = Record<string, Record<string, Rec>>

let memory = "" // fallback when storage is blocked
export function readVaultRaw(): string {
  try {
    return window.localStorage.getItem(VAULT_KEY) ?? memory
  } catch {
    return memory
  }
}
function parse(raw: string): Store {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as unknown
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Store) : {}
  } catch {
    return {}
  }
}
export function subscribeVault(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === VAULT_KEY) cb()
  }
  window.addEventListener("storage", onStorage)
  window.addEventListener(VAULT_EVENT, cb)
  return () => {
    window.removeEventListener("storage", onStorage)
    window.removeEventListener(VAULT_EVENT, cb)
  }
}

/** Record a mark on this device (demo data mode). */
export function markLocal(shopId: string, key: string, onFile = true, expiresAt: string | null = null): void {
  const s = parse(readVaultRaw())
  const now = new Date()
  s[shopId] = {
    ...(s[shopId] ?? {}),
    [key]: {
      on_file: onFile,
      on_file_at: onFile ? toISODate(now) : null,
      expires_at: onFile ? expiresAt : null,
      source: "shop",
      note: onFile ? "Marked on file by the shop (no file stored)" : null,
      at: now.toISOString(),
    },
  }
  const raw = JSON.stringify(s)
  memory = raw
  try {
    window.localStorage.setItem(VAULT_KEY, raw)
  } catch {
    /* private window: memory only */
  }
  window.dispatchEvent(new Event(VAULT_EVENT))
}

/** Clears this device's vault marks (demo reset). */
export function clearLocalVault(): void {
  if (typeof window === "undefined") return
  memory = ""
  try {
    window.localStorage.removeItem(VAULT_KEY)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(VAULT_EVENT))
}

/** The vault for one shop: seeds, then this device's marks (raw = readVaultRaw()). */
export function buildLocalVault(shopId: string, today: Date, raw: string, shopName?: string | null, shopSource?: string | null): Vault {
  const recs = { ...seedsFor(shopId), ...(parse(raw)[shopId] ?? {}) }
  const items = VAULT_CATALOGUE.map((c) => itemView(c, recs[c.key], today))
  const reusable = items.filter((i) => i.reusable)
  return {
    shop_id: shopId,
    shop_name: shopName ?? null,
    shop_source: shopSource ?? null,
    as_of: toISODate(today),
    items,
    on_file: reusable.length,
    total: items.length,
    expired: items.filter((i) => i.status === "expired").length,
    expiring_soon: items.filter((i) => i.status === "expiring_soon").length,
    time_saved_per_award: timeSaved(reusable.reduce((s, i) => s + i.minutes_saved, 0)),
    note: VAULT_NOTE,
    flags: ["assumption"],
  }
}
