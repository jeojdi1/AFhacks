// Trade words for desktop copy ("every trade, not just welders"; docs/decisions.md #9).
//
// The Northgate demo is a welding story: when the trade is welding, callers keep the original
// welding keys word for word. Every other trade (CNC machining, electronics assembly, cable and
// harness, coatings and plating) gets a generic key filled from these helpers, and anything
// unmapped reads "qualified workers" or plain "jobs".

import {
  isWeldingTrade,
  tradeForPackage,
  tradeForProcess,
  type Trade,
} from "@/lib/trades"

type PackageLike = { cert_unlock?: string | null; capacity_unlock?: Partial<Record<string, number>> | null }

/** The one trade every package or training entry shares, or null (none, mixed or unmapped). */
export function commonPackageTrade(items: readonly PackageLike[] | null | undefined): Trade | null {
  const list = items ?? []
  if (list.length === 0) return null
  const first = tradeForPackage(list[0])
  if (!first) return null
  return list.every((p) => tradeForPackage(p)?.key === first.key) ? first : null
}

/** The one trade every job needs (by its first process), or null (none, mixed or unmapped). */
export function commonJobTrade(jobs: readonly { process_tags?: readonly string[] | null }[] | null | undefined): Trade | null {
  const list = jobs ?? []
  if (list.length === 0) return null
  const first = tradeForProcess(list[0].process_tags?.[0])
  if (!first) return null
  return list.every((j) => tradeForProcess(j.process_tags?.[0])?.key === first.key) ? first : null
}

/** True when the trade is welding (the demo's original wording applies). */
export function isWelding(trade: Trade | null | undefined): boolean {
  return isWeldingTrade(trade)
}

/** A trade as the adjective in "{n} … jobs": "welding", "CNC machining", "electronics assembly". */
export function tradeAdjective(trade: Trade): string {
  const l = trade.label
  return l.length > 1 && l[1] === l[1].toLowerCase() ? l.charAt(0).toLowerCase() + l.slice(1) : l
}

/** The noun after a count: "CNC machining jobs" (n = 1 → "CNC machining job"); no trade → "jobs". */
export function jobsNoun(n: number, trade: Trade | null | undefined): string {
  const adj = trade ? `${tradeAdjective(trade)} ` : ""
  return n === 1 ? `${adj}job` : `${adj}jobs`
}

export function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}
