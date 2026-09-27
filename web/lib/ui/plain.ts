// Plain-language labels for every acronym and term of art (docs/ux-simplification.md §2).
//
// Rule: an acronym never appears on screen by itself. On a screen's first use show
// PLAIN[k].first ("plain label (ACRONYM)") wrapped in <Term k first />; afterwards
// PLAIN[k].label is enough. `tip` is the exact tooltip text (and the `title` fallback).
//
// GLOSSARY in web/lib/format.ts stays for back-compat (the phone app reads it).

import { CERT_LABEL } from "@/lib/format"

export type PlainKey =
  | "ITB"
  | "obligation"
  | "ITB_CREDIT"
  | "OBLIGATION_MET"
  | "SMB"
  | "SMB_TARGET"
  | "SME_SHARE"
  | "CCV"
  | "CGP"
  | "CONTROLLED"
  | "CWB_W47.1"
  | "CPCSC_L1"
  | "AS9100"
  | "ISO9001"
  | "NADCAP"
  | "PRIME"
  | "MATCH"
  | "STUCK"
  | "TAGGED"
  | "SCORE"
  | "DIRECT"
  | "INDIRECT"
  | "SYNTHETIC"
  | "DISCOVERED"
  | "MULTIPLIER"
  | "NAICS"
  | "FIXTURES"
  | "HOURS_WEEK"

export interface Plain {
  /** Visible label on a screen's first use, e.g. "Security-cleared (Controlled Goods)". */
  first: string
  /** Visible label after the first use, e.g. "security-cleared". */
  label: string
  /** Exact tooltip (and native title fallback). Empty string = no tooltip. */
  tip: string
}

export const PLAIN: Record<PlainKey, Plain> = {
  ITB: {
    first: "Canada's defence-contract rule (ITB)",
    label: "the ITB rule",
    tip: "Industrial and Technological Benefits: a defence company that wins a big federal contract must do business in Canada equal to the contract's value. Simplified for this demo.",
  },
  obligation: {
    first: "What Northgate owes Canada",
    label: "owes Canada",
    tip: "The full contract value, $500M, that Northgate must match with Canadian business. It's a promise, not a bill.",
  },
  ITB_CREDIT: {
    first: "Canada work credit (ITB)",
    label: "credit",
    tip: "How the government counts Northgate's Canadian business toward the $500M. Not cash.",
  },
  OBLIGATION_MET: {
    first: "% of what Northgate owes",
    label: "% of what's owed",
    tip: "Credit earned so far ÷ $500M.",
  },
  SMB: {
    first: "small business (SMB)",
    label: "small business",
    tip: "Small or medium-sized business. Demo rule: under 500 employees. Official ITB line: 250 full-time staff, or 500 with affiliates.",
  },
  SMB_TARGET: {
    first: "Small-business target",
    label: "small-business target",
    tip: "15% of what's owed ($75M) must involve small businesses.",
  },
  SME_SHARE: {
    first: "Went to small businesses",
    label: "to small businesses",
    tip: "Share of matched work value that went to small businesses.",
  },
  CCV: {
    first: "Canadian content",
    label: "Canadian content",
    tip: "The share of a job's value made in Canada. Only that share earns credit.",
  },
  CGP: {
    first: "Security-cleared (Controlled Goods)",
    label: "security-cleared",
    tip: "Controlled Goods Program: federal registration a shop needs before it may handle controlled defence parts.",
  },
  CONTROLLED: {
    first: "Controlled part",
    label: "controlled",
    tip: "A controlled defence part. Only security-cleared shops may make it. Shieldworks never stores drawings; it matches on basic job details only.",
  },
  "CWB_W47.1": {
    first: "Welding certification (CWB W47.1)",
    label: "welding certification",
    tip: "Canadian Welding Bureau company certification for structural welding. The shop is certified, it needs a qualified supervisor and approved procedures, and each welder passes a test for their own ticket.",
  },
  CPCSC_L1: {
    first: "Cyber-security self-check (CPCSC L1)",
    label: "cyber self-check",
    tip: "Canadian Program for Cyber Security Certification, level 1: 13 controls, self-assessed, no public registry.",
  },
  AS9100: {
    first: "Aerospace quality certificate (AS9100)",
    label: "AS9100",
    tip: "Quality standard for aerospace and defence suppliers.",
  },
  ISO9001: {
    first: "Quality certificate (ISO 9001)",
    label: "ISO 9001",
    tip: "Baseline quality-management certificate.",
  },
  NADCAP: {
    first: "Special-process accreditation (Nadcap)",
    label: "Nadcap",
    tip: "Aerospace accreditation for processes such as heat treating and coatings.",
  },
  PRIME: {
    first: 'defence company (the "prime")',
    label: "defence company",
    tip: "The company that won the government contract. Here: Northgate Land Systems, which is fictional.",
  },
  MATCH: {
    first: "match",
    label: "matched",
    tip: "Shieldworks offers each job to one qualified shop. There is no bidding.",
  },
  STUCK: {
    first: "stuck",
    label: "stuck",
    tip: "No qualified shop has free capacity for this job yet.",
  },
  TAGGED: {
    first: "read by Claude",
    label: "read by Claude",
    tip: "Claude read each parts-list line to find its process, material and the certificates it needs.",
  },
  SCORE: {
    first: "Match",
    label: "match",
    tip: "How well the shop fits: right machines, distance, how soon it can start, and credit earned.",
  },
  DIRECT: {
    first: "Work on this contract",
    label: "Work on this contract",
    tip: "Direct = making parts for this contract. Indirect = other eligible activity, such as training.",
  },
  INDIRECT: {
    first: "Other eligible activity",
    label: "Other eligible activity",
    tip: "Direct = making parts for this contract. Indirect = other eligible activity, such as training.",
  },
  SYNTHETIC: {
    first: "Synthetic demo shop",
    label: "Synthetic",
    tip: "Made up for this demo. Only synthetic shops receive demo offers.",
  },
  DISCOVERED: {
    first: "Real shop · public data",
    label: "real shop",
    tip: "Found in public data (Statistics Canada ODBus, company websites). Public data — unverified — not affiliated. Never sent work.",
  },
  MULTIPLIER: {
    first: "counts extra",
    label: "counts extra",
    tip: "Some work counts extra toward what's owed: small-business work on the contract 2×, the company's cash for eligible training 5×, Indigenous workforce development 10×.",
  },
  NAICS: {
    first: "Industry code",
    label: "Industry code",
    tip: "North American Industry Classification System code.",
  },
  FIXTURES: {
    first: "Demo data",
    label: "Demo data",
    tip: "Demo data replays saved engine answers. Live calls the running engine.",
  },
  HOURS_WEEK: {
    first: "hours a week",
    label: "hrs/wk",
    tip: "",
  },
}

/** Multiplier → plain label ("counts double (2×)"). */
export const MULTIPLIER_LABEL: Record<number, string> = {
  1: "counts 1×",
  2: "counts double (2×)",
  5: "counts 5×",
  10: "counts 10×",
}

export function multiplierPlain(m: number): string {
  return MULTIPLIER_LABEL[m] ?? `counts ${m}×`
}

/** Legacy / alternative spellings → PlainKey (so <Term k="SME" /> and <Term abbr="CWB" /> keep working). */
const ALIASES: Record<string, PlainKey> = {
  SME: "SMB",
  CWB: "CWB_W47.1",
  "CWB W47.1": "CWB_W47.1",
  CPCSC: "CPCSC_L1",
  Nadcap: "NADCAP",
  ISO: "ISO9001",
  "ISO 9001": "ISO9001",
  credit: "ITB_CREDIT",
  obligation_met_pct: "OBLIGATION_MET",
  score: "SCORE",
  synthetic: "SYNTHETIC",
  public: "DISCOVERED",
  discovered: "DISCOVERED",
  controlled: "CONTROLLED",
  prime: "PRIME",
  blocked: "STUCK",
  tagged: "TAGGED",
  routed: "MATCH",
  assigned: "MATCH",
  direct: "DIRECT",
  indirect: "INDIRECT",
  fixtures: "FIXTURES",
}

/** Resolve a key (PlainKey or alias) to its Plain entry, or null. */
export function plainFor(key: string): Plain | null {
  if (key in PLAIN) return PLAIN[key as PlainKey]
  const alias = ALIASES[key]
  if (alias) return PLAIN[alias]
  if (key.startsWith("NADCAP")) return PLAIN.NADCAP
  return null
}

/**
 * Plain label for a certification type (CGP, CWB_W47.1, NADCAP:HEAT_TREAT, …).
 * Falls back to CERT_LABEL (then the raw type) with no tooltip.
 */
export function certPlain(type: string): Plain {
  const p = plainFor(type)
  if (p) {
    if (type.startsWith("NADCAP:")) {
      const sub = (CERT_LABEL[type] ?? type).replace(/^Nadcap\s*/i, "")
      return { first: `Special-process accreditation (Nadcap ${sub})`, label: `Nadcap ${sub}`, tip: p.tip }
    }
    return p
  }
  const fallback = CERT_LABEL[type] ?? type.replace(/_/g, " ")
  return { first: fallback, label: fallback, tip: "" }
}
