// Which open defence tenders are worth showing a small shop on "Find work" (/shop/work).
//
// The engine picks CanadaBuys notices by category (engine/search.py TENDER_CATEGORY), so a
// "machining, welding, fabrication" notice can be DND buying a lathe or a milling machine:
// something a shop would buy, not make. Only notices for goods a manufacturer could make or
// supply are listed; equipment purchases and off-the-shelf hardware are set aside and shown
// only on request, tagged. The search box and process picker also narrow the list. Notices
// past their closing time are never listed as open (the sample was retrieved 2026-09-26).

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

/** Ontario delivery regions in the sample are sometimes a city, not the province. */
const ONTARIO =
  /\b(ontario|belleville|london|toronto|hamilton|barrie|kingston|petawawa|north bay|thunder bay|ottawa|kitchener|waterloo|woolwich)\b/i

export function inOntario(region: string | null | undefined): boolean {
  return ONTARIO.test(region ?? "")
}

function ontarioFirst(a: Tender, b: Tender): number {
  const on = (t: Tender) => (inOntario(t.region) ? 0 : 1)
  return on(a) - on(b) || (a.closing_date ?? "").localeCompare(b.closing_date ?? "")
}

/** Fewer open notices than this: also show the most recently closed ones. */
export const MIN_OPEN_TENDERS = 3

/**
 * A notice's closing moment in local time (the sample has no time zone). A date-only value is
 * open through 23:59 that day. null when missing or unreadable.
 */
export function tenderClosesAt(value: string | null | undefined): Date | null {
  if (!value) return null
  const v = value.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59)
  // No offset: local time (Date parses "YYYY-MM-DDTHH:MM:SS" as local).
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function tenderClosed(t: Pick<Tender, "closing_date">, now: Date): boolean {
  const at = tenderClosesAt(t.closing_date)
  return at !== null && at.getTime() < now.getTime()
}

/** "Closes today" / "Closes in 1 day" / "Closes in N days" (calendar days, local), or null. */
export function closesChip(t: Pick<Tender, "closing_date">, now: Date): string | null {
  const at = tenderClosesAt(t.closing_date)
  if (!at || at.getTime() < now.getTime()) return null
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const n = Math.round((day(at) - day(now)) / 86_400_000)
  if (n <= 0) return "Closes today"
  return `Closes in ${n} day${n === 1 ? "" : "s"}`
}

/**
 * Split the engine's tenders into the ones to list (open, for parts), the ones set aside
 * (open, equipment or off-the-shelf) and, when fewer than MIN_OPEN_TENDERS are open, the most
 * recently closed ones, after the search box. Past-closing notices are never listed as open,
 * whatever the engine (or the saved demo answer) says.
 */
export function fitTenders(
  tenders: Tender[],
  opts: { q: string; process: string; now?: Date }
): {
  fits: Tender[]
  setAside: (Tender & { kind: Exclude<TenderKind, "fits"> })[]
  closed: Tender[]
  total: number
} {
  const now = opts.now ?? new Date()
  const matched = tenders.filter((t) => inQuery(t, opts.q) && inProcess(t, opts.process))
  const fits: Tender[] = []
  const setAside: (Tender & { kind: Exclude<TenderKind, "fits"> })[] = []
  const closed: Tender[] = []
  for (const t of matched) {
    const k = tenderKind(t)
    if (tenderClosed(t, now)) {
      if (k === "fits") closed.push(t)
      continue
    }
    if (k === "fits") fits.push(t)
    else setAside.push({ ...t, kind: k })
  }
  fits.sort(ontarioFirst)
  closed.sort((a, b) => (b.closing_date ?? "").localeCompare(a.closing_date ?? ""))
  return {
    fits,
    setAside,
    closed: fits.length < MIN_OPEN_TENDERS ? closed.slice(0, MIN_OPEN_TENDERS - fits.length) : [],
    total: tenders.length,
  }
}
