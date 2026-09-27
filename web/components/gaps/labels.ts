import { CERT_LABEL, PROCESS_LABEL, label } from "@/lib/format";
import type { TrainingPackage } from "@/lib/api/types";

/** Rejection filter codes → short column labels for the mini-breakdown. */
export const FILTER_LABEL: Record<string, string> = {
  process: "Process",
  envelope: "Part size",
  certs: "Certs",
  controlled_cgp: "CGP",
  cpcsc: "CPCSC",
  capacity: "Capacity",
};

export const FILTER_ORDER = ["process", "envelope", "certs", "controlled_cgp", "cpcsc", "capacity"] as const;

export const BRAND_BUTTON = "bg-brand text-brand-foreground hover:bg-brand/90";

/** Readable name for a cert or process requirement. */
export function requirementLabel(req: string): string {
  return CERT_LABEL[req] ?? PROCESS_LABEL[req] ?? label({}, req);
}

/** "Missing CWB W47.1" / "Out of capacity: Welding". */
export function gapTitle(gap: TrainingPackage["gap"]): string {
  const req = requirementLabel(gap.requirement);
  if (gap.kind === "cert") return `Missing ${req}`;
  if (gap.kind === "capacity") return `Out of capacity: ${req}`;
  return `Gap: ${req}`;
}

/** { welding: 80 } → "+80 h/week welding". */
export function capacityUnlockText(cu: Record<string, number> | null | undefined): string | null {
  if (!cu) return null;
  const parts = Object.entries(cu)
    .filter(([, h]) => h > 0)
    .map(([p, h]) => `+${h} h/week ${label(PROCESS_LABEL, p).toLowerCase()}`);
  return parts.length ? parts.join(", ") : null;
}

export function multiplierLabel(multiplier: number): string {
  return multiplier >= 10 ? "Indigenous workforce development" : "Skills and training";
}
