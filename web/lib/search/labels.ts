// Plain labels, quick chips and the plain-language query reader for the search pages.
// Acronyms follow docs/ux-simplification.md §2: never on screen by themselves.

import { PROCESS_LABEL, fmtMoney } from "@/lib/format"
import { certPlain } from "@/lib/ui/plain"
import type { ShopSearchParams } from "./types"

/** Process order (matches engine.rules.PROCESS_LABEL). */
export const PROCESS_KEYS = [
  "cnc_milling",
  "five_axis_milling",
  "cnc_turning",
  "sheet_metal",
  "welding",
  "heat_treat",
  "anodizing",
  "plating",
  "painting",
  "wire_harness",
  "electronics_assembly",
  "fasteners",
] as const

/** Certificate order (matches engine.rules.CERT_LABEL). */
export const CERT_KEYS = [
  "CGP",
  "CPCSC_L1",
  "ISO9001",
  "AS9100",
  "NADCAP:HEAT_TREAT",
  "NADCAP:CHEM_PROCESSING",
  "NADCAP:COATINGS",
  "CWB_W47.1",
] as const

export const COUNTING_STATUSES = ["verified", "declared", "pending_training"] as const

export function processPlain(p: string): string {
  return PROCESS_LABEL[p] ?? p.replace(/_/g, " ")
}

/** "Welding certification (CWB W47.1)" style: safe to show on its own. */
export function certFirst(type: string): string {
  return certPlain(type).first
}

export function certTip(type: string): string {
  return certPlain(type).tip
}

/** What a certificate status means for this kind of shop. */
export function certStatusPlain(status: string, source: "synthetic" | "public"): string {
  switch (status) {
    case "verified":
      return "verified"
    case "pending_training":
      return "in training, paid by Northgate"
    case "declared":
      return source === "public" ? "stated on its website (unverified)" : "held (demo data)"
    case "expired":
      return "lapsed (needs renewal)"
    default:
      return "not held"
  }
}

export interface QuickChip {
  key: string
  label: string
  process: string[]
  cert: string[]
}

export const QUICK_CHIPS: QuickChip[] = [
  { key: "five-axis", label: "5-axis machining", process: ["five_axis_milling"], cert: [] },
  { key: "cwb-welding", label: "Certified welding (CWB)", process: ["welding"], cert: ["CWB_W47.1"] },
  { key: "harness", label: "Wire harness", process: ["wire_harness"], cert: [] },
  { key: "heat-treat", label: "Heat treat", process: ["heat_treat"], cert: [] },
  { key: "cgp", label: "Security-cleared (CGP)", process: [], cert: ["CGP"] },
]

export const RADIUS_OPTIONS = [25, 50, 100, 200] as const

/** "near <city>" without a distance means this many km (engine.search.DEFAULT_RADIUS_KM, docs/api.md §7). */
export const DEFAULT_RADIUS_KM = 100

/** The result of reading a plain-language request ("CWB welding near London"). */
export interface ParsedQuery {
  process: string[]
  cert: string[]
  near: string | null
  radius_km: number | null
  dnd_history: boolean | null
  includePublic: boolean | null
  /** Left-over text used as a name / city search when nothing else was recognised. */
  q: string | null
  recognised: string[]
  /** Place names the demo data can't search ("near Ottawa"): shown so they aren't silently dropped. */
  ignored: string[]
  /** True when the text names a listed shop: `q` is then a name search and nothing else is read. */
  nameMatch: boolean
  /** Shown under "Understood as" (e.g. no listed shop has that name). */
  notice: string | null
  /** Filters were read from the text, but it also looked like a name: shops whose names share its words go first. */
  rankHint: string | null
}

/** Where the demo's shops are; used when a place in the request can't be searched. */
export const COVERAGE_NOTE = "demo data covers Southwestern Ontario only; showing all locations"

// "near X" / "in X": up to three words, stopping at a joining word, a number or punctuation.
const PLACE_PHRASE =
  /\b(near|around|close\s+to|in)\s+((?:(?!(?:within|with|that|who|which|for|and|or|having|has|km|shops?|suppliers?)\b)\p{L}[\p{L}.'-]*\s*){1,3})/giu
// Regions the demo already sits inside: nothing to filter, nothing to warn about.
const COVERED_PLACES = new Set(["canada", "ontario", "southern ontario", "southwestern ontario", "southwest ontario", "sw ontario"])
// "in <word>" is usually a material or a phrase ("in aluminum", "in house"); treat it as a place
// only when it is written with a capital or is a well-known Canadian place.
const KNOWN_PLACES = new Set([
  "toronto", "ottawa", "montreal", "montréal", "quebec", "québec", "quebec city", "vancouver", "calgary", "edmonton",
  "winnipeg", "halifax", "windsor", "sudbury", "kingston", "oshawa", "barrie", "guelph", "niagara", "niagara falls",
  "st. catharines", "st catharines", "burlington", "mississauga", "brampton", "markham", "sarnia", "thunder bay",
  "peterborough", "belleville", "brantford", "saskatoon", "regina", "victoria", "moncton", "fredericton", "gatineau",
  "laval", "longueuil", "sherbrooke", "st. john's", "charlottetown", "north bay", "sault ste. marie", "timmins",
  "british columbia", "alberta", "saskatchewan", "manitoba", "nova scotia", "new brunswick", "newfoundland", "pei",
  "northern ontario", "eastern ontario", "gta",
])
const PLACE_BLOCK = /\b(me|here|us|house|stock|aluminum|aluminium|steel|stainless|titanium|brass|copper|plastic|volume|bulk|canada)\b/i

/** Place phrases in the request that are not a searchable city (e.g. "Ottawa"). */
function unknownPlaces(raw: string, cities: string[], near: string | null): string[] {
  const known = new Set(cities.map((c) => c.toLowerCase()))
  const out: string[] = []
  for (const m of raw.matchAll(PLACE_PHRASE)) {
    const word = m[1].toLowerCase().replace(/\s+/g, " ")
    const phrase = m[2].trim().replace(/[.'-]+$/, "")
    const lower = phrase.toLowerCase()
    if (!phrase || COVERED_PLACES.has(lower)) continue
    // A searchable city, or one that starts the phrase ("London Ontario").
    if (known.has(lower) || [...known].some((c) => lower === c || lower.startsWith(`${c} `))) continue
    if (near && lower.includes(near.toLowerCase())) continue
    // Process or certificate words ("in 5-axis", "near cnc") are not places.
    const t = ` ${lower} `
    if (PROCESS_WORDS.some(([re]) => re.test(t)) || CERT_WORDS.some(([re]) => re.test(t)) || MILLING.test(t)) continue
    if (PLACE_BLOCK.test(lower)) continue
    const capitalised = /^\p{Lu}/u.test(phrase)
    const knownPlace = KNOWN_PLACES.has(lower) || KNOWN_PLACES.has(lower.split(" ")[0])
    if (word === "in" && !capitalised && !knownPlace) continue
    // Keep only the place itself: known multi-word names whole, otherwise the capitalised words.
    const name = knownPlace || !capitalised ? phrase : phrase.split(/\s+/).filter((w) => /^\p{Lu}/u.test(w)).join(" ") || phrase
    const pretty = name
      .replace(/\s+(ontario|on)$/i, "")
      .replace(/(^|\s)(\p{Ll})/gu, (_, sp: string, ch: string) => sp + ch.toUpperCase())
    if (!out.includes(pretty)) out.push(pretty)
  }
  return out
}

const PROCESS_WORDS: [RegExp, string][] = [
  [/\b(5|five)[\s-]?axis\b/, "five_axis_milling"],
  [/\b(cnc\s+)?turn(ing|ed)?\b|\blathes?\b/, "cnc_turning"],
  [/\bsheet[\s-]?metal\b|\blaser[\s-]?cut|\bpress[\s-]?brake|\bform(ed|ing)\b/, "sheet_metal"],
  [/\bweld/, "welding"],
  [/\bheat[\s-]?treat/, "heat_treat"],
  [/\banodi[sz]/, "anodizing"],
  [/\bplat(ing|ed)\b/, "plating"],
  [/\bpaint|\bpowder[\s-]?coat|\bcoating/, "painting"],
  [/\bharness|\bcable\s+assembl/, "wire_harness"],
  [/\belectronic|\bpcb\b|\bcircuit/, "electronics_assembly"],
  [/\bfasteners?\b|\bbolts?\b/, "fasteners"],
]
const MILLING = /\bcnc\b|\bmill(ing|ed)?\b|\bmachin(ing|ed|e shop)\b/

const CERT_WORDS: [RegExp, string][] = [
  [/\bcwb\b|\bw47(\.1)?\b|\bcertified weld/, "CWB_W47.1"],
  [/\bcgp\b|\bcontrolled[\s-]goods\b|\bsecurity[\s-]?clear|\bcleared\b/, "CGP"],
  [/\bcpcsc\b|\bcyber/, "CPCSC_L1"],
  [/\biso(\s?9001)?\b/, "ISO9001"],
  [/\bas\s?9100\b|\baerospace\b/, "AS9100"],
]

// ---------------------------------------------------------------------------- shop names

/** Company endings left out when comparing names ("F.C. Welding" = "F.C. Welding Inc."). */
const NAME_SUFFIX = /\s+(inc|incorporated|ltd|limited|corp|corporation|co|company|llc|ltee|ltée)$/

/** Lower case, punctuation as spaces, company ending dropped: "f c welding". */
export function normalizeName(s: string): string {
  let n = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  while (NAME_SUFFIX.test(n)) n = n.replace(NAME_SUFFIX, "")
  return n
}

const compact = (s: string) => s.replace(/\s+/g, "")

/**
 * Listed shops whose name the text spells out: the whole name, or (two words or more) the
 * start of it. Case and punctuation don't matter ("fc welding" finds "F.C. Welding Inc.").
 */
export function matchShopNames(raw: string, names: readonly string[]): string[] {
  const n = normalizeName(raw)
  if (n.length < 3) return []
  const words = n.split(" ").length
  const c = compact(n)
  const out: string[] = []
  for (const name of names) {
    const m = normalizeName(name)
    if (!m) continue
    const full = m === n || compact(m) === c
    const prefix = words >= 2 && n.length >= 6 && (m.startsWith(`${n} `) || compact(m).startsWith(c))
    if ((full || prefix) && !out.includes(name)) out.push(name)
  }
  return out
}

/**
 * The name search to send for matched shops. The engine matches names by plain substring, so
 * this is the text as typed when every match contains it, else the matched names' common start.
 */
function nameSearch(raw: string, matches: string[]): string {
  const typed = raw.trim().toLowerCase()
  if (matches.every((m) => m.toLowerCase().includes(typed))) return raw.trim()
  if (matches.length === 1) return matches[0]
  let prefix = matches[0]
  for (const m of matches.slice(1)) {
    let i = 0
    while (i < prefix.length && i < m.length && prefix[i].toLowerCase() === m[i].toLowerCase()) i++
    prefix = prefix.slice(0, i)
  }
  return prefix.trim() || matches[0]
}

// Words that don't make a request a company name.
const NAME_STOP = new Set([
  "a", "an", "the", "and", "or", "of", "for", "with", "within", "near", "around", "in", "to", "that", "who", "has",
  "having", "shop", "shops", "supplier", "suppliers", "company", "companies", "real", "public", "certified", "past",
  "defence", "defense", "contract", "contracts", "national", "km",
])
const ORG_ENDING = /\b(inc|ltd|limited|corp|corporation|llc|industries|manufacturing|technologies|systems|group|aerospace|enterprises)\.?$/i

/** Words in the text that are not a process, certificate, city or joining word (for a name). */
function nameWords(raw: string, cities: string[]): string[] {
  const cityWords = new Set(cities.flatMap((c) => c.toLowerCase().split(/\s+/)))
  return raw
    .split(/[^\p{L}\p{N}.&'-]+/u)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter((w) => w.length >= 2)
    .filter((w) => {
      const l = w.toLowerCase()
      const t = ` ${l} `
      if (NAME_STOP.has(l) || cityWords.has(l) || KNOWN_PLACES.has(l)) return false
      if (PROCESS_WORDS.some(([re]) => re.test(t)) || CERT_WORDS.some(([re]) => re.test(t)) || MILLING.test(t)) return false
      if (/\bnadcap\b/.test(t) || /^\d+$/.test(l)) return false
      return true
    })
}

/** "Magellan Aerospace": capitalised like a company, with a word that is not a filter. */
function looksLikeOrgName(raw: string, cities: string[]): boolean {
  const words = raw.trim().split(/\s+/)
  if (words.length < 2 || /\b(near|within|with|around|in)\b/i.test(raw)) return false
  const leftovers = nameWords(raw, cities)
  if (!leftovers.length) return false
  const titled = words.every((w) => /^[\p{Lu}\p{N}]/u.test(w) || /^(of|and|&|de|la|du)$/i.test(w))
  return titled || ORG_ENDING.test(raw.trim())
}

/** How many of the hint's name words a shop name has (0 when fewer than two). */
export function nameHintScore(hint: string | null, name: string | null | undefined): number {
  if (!hint || !name) return 0
  const words = new Set(normalizeName(name).split(" "))
  const hits = normalizeName(hint)
    .split(" ")
    .filter((w, i, a) => w.length >= 3 && a.indexOf(w) === i && !NAME_STOP.has(w))
    .filter((w) => words.has(w)).length
  return hits >= 2 ? hits : 0
}

/**
 * Read a plain-language request into search filters. Deterministic and forgiving:
 * process and certificate words, "near <city>", "within N km", "defence contract",
 * "real shops". Anything unrecognised becomes a name / city search.
 */
export function parseQuery(text: string, cities: string[], shopNames: readonly string[] = []): ParsedQuery {
  const raw = text.trim()
  const t = ` ${raw.toLowerCase()} `
  const out: ParsedQuery = {
    process: [],
    cert: [],
    near: null,
    radius_km: null,
    dnd_history: null,
    includePublic: null,
    q: null,
    recognised: [],
    ignored: [],
    nameMatch: false,
    notice: null,
    rankHint: null,
  }
  if (!raw) return out
  // A listed shop's name ("Hamilton Specialized Welding") is a name search, not "welding near Hamilton".
  const named = matchShopNames(raw, shopNames)
  if (named.length) {
    out.q = nameSearch(raw, named)
    out.nameMatch = true
    out.recognised.push(`Shop name: ${out.q}`)
    return out
  }
  for (const [re, p] of PROCESS_WORDS) if (re.test(t) && !out.process.includes(p)) out.process.push(p)
  if (MILLING.test(t) && !out.process.includes("five_axis_milling") && !out.process.includes("cnc_turning"))
    out.process.unshift("cnc_milling")
  for (const [re, c] of CERT_WORDS) if (re.test(t) && !out.cert.includes(c)) out.cert.push(c)
  if (/\bnadcap\b/.test(t)) {
    if (out.process.includes("heat_treat")) out.cert.push("NADCAP:HEAT_TREAT")
    else if (out.process.includes("anodizing") || out.process.includes("plating")) out.cert.push("NADCAP:CHEM_PROCESSING")
    else if (out.process.includes("painting")) out.cert.push("NADCAP:COATINGS")
  }
  // Longest city names first so "Stoney Creek" wins over a shorter overlap.
  const byLength = [...cities].sort((a, b) => b.length - a.length)
  for (const city of byLength) {
    const re = new RegExp(`\\b${city.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)
    if (re.test(t)) {
      out.near = city
      break
    }
  }
  const km = t.match(/\b(?:within\s+)?(\d{1,4})\s?km\b/)
  if (km && out.near) out.radius_km = Math.min(5000, Math.max(1, Number(km[1])))
  if (/\bdefen[cs]e\s+contract|\bdnd\b|\bnational\s+defen[cs]e\b|\bpast\s+defen[cs]e/.test(t)) out.dnd_history = true
  if (/\breal\s+shops?\b|\bpublic\b/.test(t)) out.includePublic = true

  for (const p of out.process) out.recognised.push(processPlain(p))
  for (const c of out.cert) out.recognised.push(certFirst(c))
  if (out.near) out.recognised.push(`near ${out.near} (${out.radius_km ?? DEFAULT_RADIUS_KM} km)`)
  if (out.dnd_history) out.recognised.push("has National Defence contract history")
  out.ignored = unknownPlaces(raw, cities, out.near)
  // A bare place name ("Toronto") gets the same coverage note as "near Toronto".
  if (!out.ignored.length && !out.recognised.length) out.ignored = barePlace(raw, cities)
  // A place we can't search is not a shop name: leave it out rather than match nothing.
  if (!out.recognised.length && !out.ignored.length) out.q = raw
  if (out.recognised.length && looksLikeOrgName(raw, cities)) {
    out.notice = `No listed shop named “${raw}”; showing ${out.recognised.join(" · ")} shops instead`
    out.rankHint = raw
  } else if (out.recognised.length && nameWords(raw, cities).length >= 2) {
    out.rankHint = raw
  }
  return out
}

/** "Toronto" alone: a well-known place outside the demo data (or not a searchable city). */
function barePlace(raw: string, cities: string[]): string[] {
  const lower = raw.toLowerCase().replace(/[.,!?]+$/, "").replace(/\s+/g, " ").trim()
  const place = lower.replace(/\s+(ontario|on)$/, "")
  if (COVERED_PLACES.has(lower) || cities.some((c) => c.toLowerCase() === place)) return []
  if (!KNOWN_PLACES.has(place)) return []
  return [place.replace(/(^|\s)(\p{Ll})/gu, (_, sp: string, ch: string) => sp + ch.toUpperCase())]
}

/** A short human summary of the active filters, for the results heading. */
export function describeFilters(p: ShopSearchParams): string {
  const bits: string[] = []
  for (const x of p.process) bits.push(processPlain(x))
  for (const c of p.cert) bits.push(certFirst(c))
  if (p.q) bits.push(`name or city contains "${p.q}"`)
  if (p.near) bits.push(`within ${p.radius_km ?? DEFAULT_RADIUS_KM} km of ${p.near}`)
  if (p.dnd_history) bits.push("with National Defence contract history")
  return bits.join(" · ")
}

export function fmtDnd(value: number, contracts: number): string {
  return `${contracts} contract${contracts === 1 ? "" : "s"} · ${fmtMoney(value, { compact: true })}`
}

/** CanadaBuys search for one notice reference (their public tender search). */
export function canadaBuysSearchUrl(reference: string): string {
  return `https://canadabuys.canada.ca/en/tender-opportunities?search_filter=${encodeURIComponent(reference)}`
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })
}
