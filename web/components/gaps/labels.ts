import { CERT_LABEL, PROCESS_LABEL, label } from "@/lib/format";
import type { BlockedJob, TrainingPackage } from "@/lib/api/types";
import { certPlain } from "@/lib/ui/plain";
import { cd } from "@/lib/ui/copy-d";

/** Rejection filter codes, in the order the "Why no shop can take it" line lists them. */
export const FILTER_ORDER = ["process", "envelope", "certs", "controlled_cgp", "cpcsc", "capacity"] as const;

/** Filter code → copy key for "{n} don't do this welding process" etc. (§8.5 gaps.why.items). */
const WHY_KEY: Partial<Record<(typeof FILTER_ORDER)[number], string>> = {
  process: "gaps.why.process",
  envelope: "gaps.why.size",
  certs: "gaps.why.certs",
  controlled_cgp: "gaps.why.controlled",
  capacity: "gaps.why.capacity",
};

export const BRAND_BUTTON = "bg-brand text-brand-foreground hover:bg-brand/90";

/** "26 don't do this welding process · 9 can't fit the part size · …" (zero counts omitted). */
export function whyNoShop(filters: BlockedJob["failing_filters"]): string {
  const f = filters as unknown as Record<string, number>;
  return FILTER_ORDER.flatMap((k) => {
    const n = f[k] ?? 0;
    const key = WHY_KEY[k];
    return n > 0 && key ? [cd(key, { n })] : [];
  }).join(" · ");
}

/** "Hull side stowage bin weldment, armour steel plate, …" → "Hull side stowage bin weldment". */
export function shortDescription(text: string | null | undefined): string {
  if (!text) return "";
  return text.split(",")[0].trim();
}

/**
 * The engine's blocked reason in plain words, without bare acronyms:
 * "Both CWB W47.1 welding shops are at capacity (18 and 16 h/week free vs 40 needed); …"
 *   → "both certified welding shops are full (18 and 16 hrs/wk free, 40 needed)".
 */
export function plainReason(b: BlockedJob): string {
  const r = b.reason ?? "";
  const both = /(\d+)\s+and\s+(\d+)\s+h\/week free vs\s+(\d+)\s+needed/i.exec(r);
  if (both) return cd("gaps.reason.both", { a: both[1], b: both[2], need: both[3] });
  const only = /(\d+)\s+h\/week free vs\s+(\d+)\s+needed/i.exec(r);
  if (only) return cd("gaps.reason.only", { a: only[1], need: only[2] });
  if (b.reason_code === "capacity") return cd("gaps.reason.capacity");
  if (b.reason_code === "certs") return cd("gaps.reason.certs");
  return cd("gaps.reason.other");
}

/** Plain label for a cert or process requirement ("welding certification", "Welding"). */
export function requirementLabel(req: string): string {
  if (CERT_LABEL[req]) return certPlain(req).label;
  return PROCESS_LABEL[req] ?? label({}, req);
}

/**
 * Engine free text (gap details, eligibility notes) with acronyms glossed on first use:
 * "no CWB W47.1 certification" → "no welding certification (CWB W47.1)", "h/week" → "hrs/wk".
 */
export function plainEngineText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\bno CWB W47\.1 certification\b|\bCWB W47\.1 certified\b|\bCWB W47\.1\b/g, (m) =>
      m.startsWith("no ")
        ? "no welding certification (CWB W47.1)"
        : m.endsWith("certified")
          ? "certified for welding (CWB W47.1)"
          : "welding certification (CWB W47.1)",
    )
    .replace(/\bper the ITB overview\b/g, "under Canada's defence-contract rule (ITB)")
    .replace(/\bh\/week\b/g, "hrs/wk");
}

/** { welding: 80 } → "+80 hrs/wk welding". */
export function capacityUnlockText(cu: Record<string, number> | null | undefined): string | null {
  if (!cu) return null;
  const parts = Object.entries(cu)
    .filter(([, h]) => h > 0)
    .map(([p, h]) => `+${h} hrs/wk ${label(PROCESS_LABEL, p).toLowerCase()}`);
  return parts.length ? parts.join(", ") : null;
}

export function multiplierLabel(multiplier: number): string {
  return multiplier >= 10 ? "Indigenous workforce development" : "Skills and training";
}

/** True for the W47.1 welder-qualification package (the hero card's wording applies). */
export function isWelderPackage(pkg: TrainingPackage): boolean {
  return pkg.cert_unlock === "CWB_W47.1" || pkg.gap?.requirement === "CWB_W47.1";
}
