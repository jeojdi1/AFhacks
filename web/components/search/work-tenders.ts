// Which open defence tenders are worth showing a small shop on "Find work" (/shop/work).
//
// The engine picks CanadaBuys notices by category (engine/search.py TENDER_CATEGORY), so a
// "machining, welding, fabrication" notice can be DND buying a lathe or a milling machine:
// something a shop would buy, not make. Only notices for goods a manufacturer could make or
// supply are listed; equipment purchases and off-the-shelf hardware are set aside and shown
// only on request, tagged. The search box and process picker also narrow the list.

import type { Tender } from "@/lib/search/types"

export type TenderKind = "fits" | "equipment" | "stock"

/** A notice for parts ("spare parts for…", "repair parts", "spares") is goods to supply. */
const PARTS = /\b(spare parts?|repair parts?|spares?|components?|assembl(y|ies)|weldments?|fabricat\w*|brackets?|enclosures?|frames?|harness(es)?|cables?)\b/i

/** Titles that name a machine or piece of equipment being bought. */
const EQUIPMENT =
  /\b(lathes?|milling machines?|engravers?|machines?|machinery|equipment|drones?|quadcopters?|trucks?|cranes?|trailers?|pump units?|treatment cent(er|re)s?|power supply|ups)\b/i

/** Off-the-shelf hardware a fabrication shop doesn't make (washers, O-rings, gaskets, tires). */
const STOCK = /\b(washers?|o-rings?|gaskets?|tires?|tyres?|batter(y|ies))\b/i

export function tenderKind(t: Pick<Tender, "title">): TenderKind {
  const title = t.title ?? ""
  if (EQUIPMENT.test(title) && !PARTS.test(title)) return "equipment"
  if (STOCK.test(title) && !/\b(weldments?|fabricat\w*|brackets?|frames?)\b/i.test(title)) return "stock"
  return "fits"
}

export const TENDER_KIND_LABEL: Record<Exclude<TenderKind, "fits">, string> = {
  equipment: "Buying equipment",
  stock: "Off-the-shelf parts",
}

// Same process → CanadaBuys category map as the engine (engine/search.py TENDER_CATEGORY).
const TENDER_CATEGORY: Record<string, string[]> = {
  electrical_harness: ["wire_harness", "electronics_assembly"],
  machining_welding_fabrication: [
    "cnc_milling",
    "five_axis_milling",
    "cnc_turning",
    "sheet_metal",
    "welding",
    "heat_treat",
    "anodizing",
    "plating",
    "painting",
    "fasteners",
  ],
}

function inProcess(t: Tender, process: string): boolean {
  if (!process) return true
  const cat = t.category ?? ""
  return (TENDER_CATEGORY[cat] ?? []).includes(process)
}

function inQuery(t: Tender, q: string): boolean {
  const ql = q.trim().toLowerCase()
  if (!ql) return true
  return [t.title, t.buyer, t.reference, t.solicitation_number, t.region]
    .filter(Boolean)
    .some((x) => String(x).toLowerCase().includes(ql))
}

function ontarioFirst(a: Tender, b: Tender): number {
  const on = (t: Tender) => (/ontario/i.test(t.region ?? "") ? 0 : 1)
  return on(a) - on(b) || (a.closing_date ?? "").localeCompare(b.closing_date ?? "")
}

/** Split the engine's tenders into the ones to list and the ones set aside, after the search box. */
export function fitTenders(
  tenders: Tender[],
  opts: { q: string; process: string }
): { fits: Tender[]; setAside: (Tender & { kind: Exclude<TenderKind, "fits"> })[]; total: number } {
  const matched = tenders.filter((t) => inQuery(t, opts.q) && inProcess(t, opts.process))
  const fits: Tender[] = []
  const setAside: (Tender & { kind: Exclude<TenderKind, "fits"> })[] = []
  for (const t of matched) {
    const k = tenderKind(t)
    if (k === "fits") fits.push(t)
    else setAside.push({ ...t, kind: k })
  }
  fits.sort(ontarioFirst)
  return { fits, setAside, total: tenders.length }
}
