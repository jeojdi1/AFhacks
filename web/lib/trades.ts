// Every trade, not just welders (docs/decisions.md #9, docs/api.md TrainingPackage notes).
//
// The trade catalog lives in data/rules/training_costs.json → trades, the same file the
// engine reads (engine/trades.py). A training package, a training entry or a readiness item
// carries no trade field: the trade is derived here from `cert_unlock` (CWB W47.1 → welding,
// IPC-A-610 → electronics assembly, …) or from the `capacity_unlock` / requirement process
// (cnc_milling → CNC machining, wire_harness → cable and harness assembly, …).
// Anything unmapped reads "qualified workers", never "welders".

import rulesFile from "../../data/rules/training_costs.json"

export interface Trade {
  key: string
  /** "CNC machining" */
  label: string
  /** "CNC machinist" */
  worker: string
  /** "CNC machinists" */
  workers: string
  processes: string[]
  certs: string[]
  /** "Ontario General Machinist (429A) apprenticeship, …" */
  credential?: string
}

export const WELDING = "welding"

/** Fallback nouns when no trade matches. */
export const GENERIC_TRADE: Trade = {
  key: "generic",
  label: "Skilled trades",
  worker: "qualified worker",
  workers: "qualified workers",
  processes: [],
  certs: [],
}

type RawTrade = Partial<Omit<Trade, "key">> & Record<string, unknown>

function loadCatalog(): Trade[] {
  const raw = ((rulesFile as unknown as { trades?: Record<string, RawTrade | string> }).trades ?? {}) as Record<
    string,
    RawTrade | string
  >
  const out: Trade[] = []
  for (const [key, v] of Object.entries(raw)) {
    if (key.startsWith("_") || !v || typeof v !== "object") continue
    out.push({
      key,
      label: typeof v.label === "string" ? v.label : key.replace(/_/g, " "),
      worker: typeof v.worker === "string" ? v.worker : GENERIC_TRADE.worker,
      workers: typeof v.workers === "string" ? v.workers : GENERIC_TRADE.workers,
      processes: Array.isArray(v.processes) ? (v.processes as string[]) : [],
      certs: Array.isArray(v.certs) ? (v.certs as string[]) : [],
      credential: typeof v.credential === "string" ? v.credential : undefined,
    })
  }
  if (!out.some((t) => t.key === WELDING)) {
    out.unshift({ key: WELDING, label: "Welding", worker: "welder", workers: "welders", processes: ["welding"], certs: ["CWB_W47.1"] })
  }
  return out
}

export const TRADES: readonly Trade[] = loadCatalog()

export function tradeForProcess(process: string | null | undefined): Trade | null {
  if (!process) return null
  return TRADES.find((t) => t.processes.includes(process)) ?? null
}

export function tradeForCert(cert: string | null | undefined): Trade | null {
  if (!cert) return null
  return TRADES.find((t) => t.certs.includes(cert)) ?? null
}

/** Trade for a requirement: a cert type or a process tag. */
export function tradeForRequirement(req: string | null | undefined): Trade | null {
  return tradeForCert(req) ?? tradeForProcess(req)
}

/** Trade of a TrainingPackage / ShopTraining / seat card: cert_unlock first, then the capacity process. */
export function tradeForPackage(
  pkg: { cert_unlock?: string | null; capacity_unlock?: Partial<Record<string, number>> | null } | null | undefined,
): Trade | null {
  if (!pkg) return null
  const proc = Object.keys(pkg.capacity_unlock ?? {})[0]
  if (pkg.cert_unlock) return tradeForCert(pkg.cert_unlock) ?? tradeForProcess(proc)
  return tradeForProcess(proc)
}

/** Trade for a package, or the generic "qualified workers" nouns. */
export function tradeOrGeneric(
  pkg: { cert_unlock?: string | null; capacity_unlock?: Partial<Record<string, number>> | null } | null | undefined,
): Trade {
  return tradeForPackage(pkg) ?? GENERIC_TRADE
}

export function isWeldingTrade(trade: Trade | null | undefined): boolean {
  return trade?.key === WELDING
}

/** "welders" / "CNC machinists"; with n: "1 welder" / "4 welders". */
export function workersText(trade: Trade | null | undefined, n?: number): string {
  const t = trade ?? GENERIC_TRADE
  if (n === undefined) return t.workers
  return n === 1 ? `1 ${t.worker}` : `${n} ${t.workers}`
}

/** "welder" / "CNC machinist" (singular noun, for "welder training seats"-style phrases). */
export function workerNoun(trade: Trade | null | undefined, n?: number): string {
  const t = trade ?? GENERIC_TRADE
  return n === undefined || n === 1 ? t.worker : t.workers
}

/** Trades a shop's processes cover, in catalog order (welding shop → [Welding]). */
export function tradesForProcesses(processes: readonly string[] | null | undefined): Trade[] {
  const set = new Set(processes ?? [])
  return TRADES.filter((t) => t.processes.some((p) => set.has(p)))
}

/** Labels of the trades in the catalog that map to a gap ("Welding", "CNC machining", …). */
export const TRADE_LABELS: readonly string[] = TRADES.filter((t) => t.processes.length || t.certs.length).map((t) => t.label)
