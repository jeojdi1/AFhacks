// Server-only: per-shop National Defence contract history for demo mode, built at build
// time from data/processed/national/entity_links.json with the engine's rule
// (engine/search.py _dnd_history: the best-confidence match(es) summed, `links` = all).
// Only the small per-shop summary reaches the browser, as a prop.
// Import this from server components (app/**/page.tsx) only.

import links from "../../../data/processed/national/entity_links.json"
import type { DndHistory } from "./types"

const DND_SOURCE =
  "DND contracts over $10K (proactive disclosure, Open Government Licence); name match, unverified"
const RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

interface VendorLink {
  confidence?: string
  contracts?: number
  total_value?: number
  last_date?: string
}

interface LinkedShop {
  shop_id?: string
  dnd_vendor?: VendorLink[]
}

export function dndHistoryByShop(): Record<string, DndHistory> {
  const out: Record<string, DndHistory> = {}
  for (const s of ((links as { shops?: LinkedShop[] }).shops ?? []) as LinkedShop[]) {
    const vs = s.dnd_vendor ?? []
    if (!s.shop_id || !vs.length) continue
    const best = Math.min(...vs.map((v) => RANK[v.confidence ?? ""] ?? 9))
    const top = vs.filter((v) => (RANK[v.confidence ?? ""] ?? 9) === best)
    out[s.shop_id] = {
      contracts: top.reduce((n, v) => n + Number(v.contracts ?? 0), 0),
      value_cad: Math.round(top.reduce((n, v) => n + Number(v.total_value ?? 0), 0) * 100) / 100,
      last_date: top.map((v) => v.last_date ?? "").sort().pop() || null,
      confidence: top[0]?.confidence ?? null,
      links: vs.length,
      source: DND_SOURCE,
    }
  }
  return out
}
