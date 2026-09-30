// "Why shops said no" for the prime (docs/api.md §9): decline reasons, counter-offer terms,
// and placed offers below the shop's own minimum, each with a plain suggestion. The same
// rules and words as the engine's GET /programs/{id}/decline-insights (engine/rightsize.py),
// computed here from the actions store so it also works on demo data. Pure functions.

import type { Assignment } from "@/lib/api/types"
import { fmtMoney } from "@/lib/format"
import { offerSize, type ShopPrefs } from "./sizing"
import { extendStrings, t } from "./strings"
import { REASON_CODES, type OfferDecisionRec, type ReasonCode } from "./types"

extendStrings("en", {
  "why.suggest.too_small": "Bundle small jobs into one package, so each shop sees one bigger, steadier order.",
  "why.suggest.min_quantity": "Order at least the shop's minimum run, or combine deliveries into fewer, larger lots.",
  "why.suggest.paperwork": "Cut the paperwork: one standard subcontract, and reuse the certificates the shop already has on file.",
  "why.suggest.price": "Check the unit price against the market: short runs cost more per part.",
  "why.suggest.capacity": "Give more lead time, or split the work between two shops.",
  "why.suggest.schedule": "Move the start date or stagger the deliveries.",
  "why.suggest.tooling": "Offer to pay for the tooling, or send the job to a shop that already has it.",
  "why.suggest.not_our_process": "Check the job's process: it may have been matched to the wrong kind of shop.",
  "why.suggest.other": "Ask the shop what would change its answer.",
  "why.suggest.setup_charge": "Budget a one-time setup fee for small runs; it is often cheaper than finding another shop.",
  "why.suggest.below": "Bundle these into bigger packages: each is below what the shop says is worth its time.",
  "why.counter.setup_charge": "Asked for a setup charge",
  "why.counter.min_quantity": "Asked for a minimum run",
})

export interface InsightRow {
  kind: "decline" | "counter" | "below_minimum"
  code: string
  label: string
  count: number
  jobIds: string[]
  shopIds: string[]
  value: number
  suggestion: string
  /** Counter setup charges asked, CAD (setup_charge rows). */
  setupTotal?: number
}

export interface DeclineInsights {
  declines: InsightRow[]
  counters: InsightRow[]
  belowMinimum: InsightRow | null
  total: number
}

/**
 * decisions: the program's current decisions (one per shop and job); assignments: placed
 * jobs; prefsOf: a shop's work preferences (for "below the shop's minimum").
 */
export function declineInsights(
  decisions: OfferDecisionRec[],
  assignments: Assignment[],
  prefsOf: (shopId: string) => ShopPrefs
): DeclineInsights {
  const valueOf = new Map(assignments.map((a) => [a.job_id, a.value_cad || 0]))
  const declines = new Map<string, InsightRow>()
  const counters = new Map<string, InsightRow>()
  const add = (m: Map<string, InsightRow>, kind: InsightRow["kind"], code: string, label: string, suggestion: string, d: OfferDecisionRec) => {
    const row = m.get(code) ?? { kind, code, label, count: 0, jobIds: [], shopIds: [], value: 0, suggestion }
    row.count += 1
    row.jobIds.push(d.job_id)
    if (!row.shopIds.includes(d.shop_id)) row.shopIds.push(d.shop_id)
    row.value += valueOf.get(d.job_id) ?? 0
    m.set(code, row)
    return row
  }
  for (const d of decisions) {
    if (d.pending) continue
    if (d.decision === "declined") {
      const code: ReasonCode = d.reason_code && REASON_CODES.includes(d.reason_code) ? d.reason_code : "other"
      add(declines, "decline", code, t(`reason.${code}`), t(`why.suggest.${code}`), d)
    }
    const c = d.counter
    if (c) {
      if (c.setup_charge_cad != null) {
        const row = add(counters, "counter", "setup_charge", t("why.counter.setup_charge"), t("why.suggest.setup_charge"), d)
        row.setupTotal = (row.setupTotal ?? 0) + c.setup_charge_cad
      }
      if (c.min_quantity != null) add(counters, "counter", "min_quantity", t("why.counter.min_quantity"), t("why.suggest.min_quantity"), d)
    }
  }
  const order = (code: string) => {
    const i = (REASON_CODES as readonly string[]).indexOf(code)
    return i < 0 ? 99 : i
  }
  const sortRows = (rows: InsightRow[]) =>
    rows
      .map((r) => ({ ...r, jobIds: [...r.jobIds].sort() }))
      .sort((a, b) => b.count - a.count || order(a.code) - order(b.code) || a.code.localeCompare(b.code))

  const below = assignments.filter((a) => offerSize(a, prefsOf(a.shop_id)).meets === false)
  const belowMinimum: InsightRow | null = below.length
    ? {
        kind: "below_minimum",
        code: "below_minimum",
        label: "",
        count: below.length,
        jobIds: below.map((a) => a.job_id).sort(),
        shopIds: [...new Set(below.map((a) => a.shop_id))],
        value: below.reduce((s, a) => s + (a.value_cad || 0), 0),
        suggestion: t("why.suggest.below"),
      }
    : null
  const d = sortRows([...declines.values()])
  const c = sortRows([...counters.values()])
  return { declines: d, counters: c, belowMinimum, total: d.reduce((s, r) => s + r.count, 0) }
}

/** "$212K" */
export const insightMoney = (n: number) => fmtMoney(n, { compact: true })
