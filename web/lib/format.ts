// Shared display formatting for Muster. Every page formats numbers through here
// so the video shows one consistent style.

function trimZero(s: string): string {
  return s.replace(/\.0$/, "");
}

/**
 * Money in CAD.
 * - compact: "$96K", "$480K", "$3.0M", "$7.6M", "$61.2M", "$500M", "$1.2B"
 * - full:    "$1,250,000" (cents only shown for amounts under $100 with a fraction)
 */
export function fmtMoney(n: number, opts?: { compact?: boolean }): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);

  if (opts?.compact) {
    if (a >= 1e9) return `${sign}$${trimZero((a / 1e9).toFixed(a >= 1e11 ? 0 : 1))}B`;
    if (a >= 1e6) {
      // 999.95M+ would print "1000M"; promote to B instead.
      if (a >= 999_950_000) return `${sign}$1B`;
      // Keep one decimal below $100M ("$3.0M" beside "$3.1M"); whole millions above.
      return `${sign}$${a >= 1e8 ? (a / 1e6).toFixed(0) : (a / 1e6).toFixed(1)}M`;
    }
    if (a >= 1e3) {
      if (a >= 999_500) return `${sign}$1.0M`;
      return `${sign}$${trimZero((a / 1e3).toFixed(a >= 1e4 ? 0 : 1))}K`;
    }
    return `${sign}$${Math.round(a)}`;
  }

  const hasCents = a < 100 && Math.round(a * 100) % 100 !== 0;
  return `${sign}$${a.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}

/** Fraction in [0, 1] → "12.2%". */
export function fmtPct(f: number, digits = 1): string {
  if (f === null || f === undefined || Number.isNaN(f)) return "—";
  return `${(f * 100).toFixed(digits)}%`;
}

/** Kilometres → "42 km". */
export function fmtKm(km: number): string {
  if (km === null || km === undefined || Number.isNaN(km)) return "—";
  return `${Math.round(km).toLocaleString("en-US")} km`;
}

export const PROCESS_LABEL: Record<string, string> = {
  cnc_milling: "CNC milling",
  five_axis_milling: "5-axis milling",
  cnc_turning: "CNC turning",
  sheet_metal: "Sheet metal",
  welding: "Welding",
  heat_treat: "Heat treat",
  anodizing: "Anodizing",
  plating: "Plating",
  painting: "Painting",
  wire_harness: "Wire harness",
  electronics_assembly: "Electronics assembly",
  fasteners: "Fasteners",
};

export const CERT_LABEL: Record<string, string> = {
  CGP: "Controlled Goods (CGP)",
  CPCSC_L1: "CPCSC Level 1",
  ISO9001: "ISO 9001",
  AS9100: "AS9100",
  "NADCAP:HEAT_TREAT": "Nadcap heat treat",
  "NADCAP:CHEM_PROCESSING": "Nadcap chemical processing",
  "NADCAP:COATINGS": "Nadcap coatings",
  "CWB_W47.1": "CWB W47.1",
};

export const CATEGORY_LABEL: Record<string, string> = {
  // credit categories
  regular: "Regular work (1x)",
  sme_direct: "SME direct work (2x)",
  training: "Skills and training (5x)",
  indigenous_training: "Indigenous workforce development (10x)",
  // training categories (ITB model terms §7.5.1)
  apprentice_sponsorship: "Apprentice sponsorship",
  personal_certification: "Personal certification",
  skills_program_contribution: "Skills program contribution",
  education_costs: "Education costs",
};

export const MATERIAL_LABEL: Record<string, string> = {
  steel: "Steel",
  armour_steel: "Armour steel",
  stainless: "Stainless steel",
  aluminum: "Aluminum",
  titanium: "Titanium",
  copper: "Copper",
  polymer: "Polymer",
};

export const CERT_STATUS_LABEL: Record<string, string> = {
  verified: "Verified",
  declared: "Declared",
  unknown: "Unknown",
  pending_training: "Pending training",
};

/** Label lookup that never renders a raw undefined. */
export function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key.replace(/_/g, " ");
}

/** Plain-language expansions for acronyms judges may not know. */
export const GLOSSARY: Record<string, string> = {
  ITB: "Industrial and Technological Benefits: primes must do business in Canada equal to the contract value",
  CWB: "Canadian Welding Bureau: certifies companies and welders to CSA W47.1",
  CPCSC: "Canadian Program for Cyber Security Certification",
  Nadcap: "Aerospace industry accreditation for special processes such as heat treat, coatings and chemical processing",
  CGP: "Controlled Goods Program: federal registration required to handle controlled defence parts",
  SME: "Small and medium-sized enterprise (under 250 employees)",
  SMB: "Small and medium-sized business",
  CCV: "Canadian content value: share of the job's value made in Canada",
}
