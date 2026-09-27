// Plain-language labels for the role portals (docs/ux-simplification.md §2).
// An acronym never appears on screen by itself: "Plain label (ACRONYM)", with
// the acronym in an <abbr title> so hover shows the meaning even without JS.
// Kept local so the portals do not depend on the shell lane's web/lib/ui/plain.ts.

import { cn } from "@/lib/utils"

interface PlainCert {
  /** Plain label without the acronym. */
  label: string
  /** The acronym shown in parentheses on first use (null: none). */
  abbr: string | null
  tip: string
}

const CERTS: Record<string, PlainCert> = {
  "CWB_W47.1": {
    label: "Welding certification",
    abbr: "CWB W47.1",
    tip: "Canadian Welding Bureau company certification for structural welding. The shop is certified, it needs a qualified supervisor and approved procedures, and each welder passes a test for their own ticket.",
  },
  ISO9001: { label: "Quality certificate", abbr: "ISO 9001", tip: "Baseline quality-management certificate." },
  AS9100: {
    label: "Aerospace quality certificate",
    abbr: "AS9100",
    tip: "Quality standard for aerospace and defence suppliers.",
  },
  CGP: {
    label: "Security-cleared",
    abbr: "Controlled Goods",
    tip: "Controlled Goods Program: federal registration a shop needs before it may handle controlled defence parts.",
  },
  CPCSC_L1: {
    label: "Cyber-security self-check",
    abbr: "CPCSC L1",
    tip: "Canadian Program for Cyber Security Certification, level 1: 13 controls, self-assessed, no public registry.",
  },
}

const NADCAP: PlainCert = {
  label: "Special-process accreditation",
  abbr: "Nadcap",
  tip: "Aerospace accreditation for processes such as heat treating and coatings.",
}

export function plainCert(type: string): PlainCert {
  if (CERTS[type]) return CERTS[type]
  if (type.startsWith("NADCAP")) {
    const proc = type.split(":")[1]?.toLowerCase().replace(/_/g, " ")
    return { ...NADCAP, label: proc ? `Special-process accreditation, ${proc}` : NADCAP.label }
  }
  return { label: type.replace(/_/g, " "), abbr: null, tip: "" }
}

/** Text-only form: "Welding certification (CWB W47.1)". */
export function plainCertText(type: string): string {
  const p = plainCert(type)
  return p.abbr ? `${p.label} (${p.abbr})` : p.label
}

/** "Welding certification (CWB W47.1)" with the acronym in an <abbr title>. */
export function CertName({ type, className }: { type: string; className?: string }) {
  const p = plainCert(type)
  return (
    <span className={className}>
      {p.label}
      {p.abbr ? (
        <>
          {" ("}
          <abbr title={p.tip} className="cursor-help no-underline">
            {p.abbr}
          </abbr>
          {")"}
        </>
      ) : null}
    </span>
  )
}

/** A plain label followed by "(ACRONYM)" with a title tooltip. */
export function Plain({
  label,
  abbr,
  tip,
  className,
}: {
  label: string
  abbr: string
  tip: string
  className?: string
}) {
  return (
    <span className={className}>
      {label} (
      <abbr title={tip} className={cn("cursor-help underline decoration-slate-400 decoration-dotted underline-offset-4")}>
        {abbr}
      </abbr>
      )
    </span>
  )
}

export const TIP = {
  ITB: "Industrial and Technological Benefits: a defence company that wins a big federal contract must do business in Canada equal to the contract's value. Simplified for this demo.",
  obligation:
    "The full contract value, $500M, that Northgate must match with Canadian business. It's a promise, not a bill.",
  SMB: "Small or medium-sized business. Demo rule: under 500 employees. Official ITB line: 250 full-time staff, or 500 with affiliates.",
} as const

export const CREDIT_EXPLAINER =
  "Credit isn't cash. It's how the government counts Northgate's Canadian business toward the $500M it owes. Small-business work counts double. Training counts 5×."
