// National Defence contract history for discovered (public) shops, from the entity-linking
// output (data/processed/national/entity_links.json, scripts/link_entities.py).
//
// SERVER ONLY: import this from server components (app/shops/[id]/page.tsx,
// app/network/page.tsx) and pass the small result down as a prop, so the 250 KB file never
// ships to the browser. Only high- or medium-confidence name matches count, and they are
// summed over the best tier present (the same rule as GET /search/shops `dnd_history`).

import links from "../../../data/processed/national/entity_links.json"
import type { DndHistory } from "./types"

interface DndMatch {
  confidence?: string
  contracts?: number
  total_value?: number
  first_date?: string | null
  last_date?: string | null
}

interface LinkedShop {
  shop_id: string
  dnd_vendor?: DndMatch[]
}

function summarize(matches: DndMatch[] | undefined): DndHistory | null {
  const ok = (matches ?? []).filter((m) => m.confidence === "high" || m.confidence === "medium")
  if (!ok.length) return null
  const tier: "high" | "medium" = ok.some((m) => m.confidence === "high") ? "high" : "medium"
  const best = ok.filter((m) => m.confidence === tier)
  const dates = (k: "first_date" | "last_date") =>
    best
      .map((m) => m[k])
      .filter((d): d is string => !!d)
      .sort()
  const firsts = dates("first_date")
  const lasts = dates("last_date")
  return {
    contracts: best.reduce((s, m) => s + (m.contracts ?? 0), 0),
    value_cad: best.reduce((s, m) => s + (m.total_value ?? 0), 0),
    first_date: firsts[0] ?? null,
    last_date: lasts[lasts.length - 1] ?? null,
    confidence: tier,
    links: ok.length,
  }
}

const MAP: Record<string, DndHistory> = (() => {
  const out: Record<string, DndHistory> = {}
  for (const s of ((links as { shops?: LinkedShop[] }).shops ?? []) as LinkedShop[]) {
    const h = summarize(s.dnd_vendor)
    if (h) out[s.shop_id] = h
  }
  return out
})()

/** DND history for one shop id, or null when there is no high/medium match. */
export function dndHistoryFor(id: string): DndHistory | null {
  return MAP[id] ?? null
}

/** Every shop with a DND match (a handful of entries). */
export function dndHistoryMap(): Record<string, DndHistory> {
  return { ...MAP }
}
