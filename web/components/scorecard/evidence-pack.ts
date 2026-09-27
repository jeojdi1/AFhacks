// "Download evidence pack (CSV)" on /scorecard: the evidence behind each credit line, built in
// the browser from the store (live and fixtures). Pure: no React, no DOM, type-only imports, so
// Node can unit-test it (evidence-pack.test.ts).
//
// One row per ledger transaction: work rows (origin "assignment") joined with the assignment,
// the job and the shop; training rows (origin "training", funded packages) joined with the
// package. Line 1 is a comment saying this is a demo, not an official ITB report.
// The status column says where each job stands with its shop (accepted, awaiting a reply,
// declined but still counted in this demo, or re-offered to another shop); credit never changes.

import type { Assignment, CertStatus, CreditTxn, Job, ShopSource, TrainingPackage } from "@/lib/api/types";

export const EVIDENCE_PACK_FILENAME = "muster-evidence-pack-northgate.csv";
export const EVIDENCE_PACK_COMMENT = "# Shieldworks demo — simplified ITB rules — not an official ITB report";

export const EVIDENCE_COLUMNS = [
  "row_type",
  "job_id",
  "status",
  "part_no",
  "shop_name",
  "shop_label",
  "small_business",
  "value_cad",
  "canadian_content_pct",
  "multiplier",
  "credit_cad",
  "certificates_relied_on",
  "date",
  "evidence_checklist",
] as const;
export type EvidenceColumn = (typeof EVIDENCE_COLUMNS)[number];
export type EvidenceRow = Record<EvidenceColumn, string>;

export const WORK_CHECKLIST =
  "purchase order; invoices; proof of delivery; Canadian content calculation; small-business status (employee count)";
export const TRAINING_CHECKLIST =
  "enrolment records; completion records; invoices; citizenship/PR eligibility for personal certification (assumption)";
export const APPRENTICE_CHECKLIST = "enrolment/apprenticeship registration; completion records; invoices";
export const TEN_X_NOTE = "10x Indigenous credit needs Defence Investment Agency confirmation (assumption)";

/** Evidence checklist for a funded training package, by its category and multiplier. */
export function trainingChecklist(category: string | null | undefined, multiplier: number): string {
  const base = category === "apprentice_sponsorship" ? APPRENTICE_CHECKLIST : TRAINING_CHECKLIST;
  return multiplier === 10 ? `${base}; ${TEN_X_NOTE}` : base;
}

/** W47.1 wording rule: the engine's "Certify 4 welders to CWB W47.1 at …" → "Qualify 4 welders under CSA W47.1 at …". */
export function plainPackageTitle(title: string): string {
  return title.replace(/^Certify (\d+) welder(s?) to CWB W47\.1\b/, "Qualify $1 welder$2 under CSA W47.1");
}

/** A certificate as the shop record states it (status + where it comes from). */
export interface EvidenceCert {
  type: string;
  status: CertStatus | string;
  /** URL, "synthetic demo data", a directory name… */
  source: string;
}

/** What the pack knows about one shop. */
export interface EvidenceShop {
  name: string;
  /** "Synthetic", "Public data — unverified — not affiliated", … */
  label: string;
  is_sme: boolean | null;
  certs: EvidenceCert[];
}

/** A shop's answer to an offer, as the store holds it. */
export type EvidenceDecision = "accepted" | "declined" | "question" | "offered";

export interface EvidenceInput {
  transactions: CreditTxn[];
  assignments: Assignment[];
  jobs: Job[];
  /** Training packages (gaps.suggestions): titles for training rows. */
  packages: TrainingPackage[];
  /** shop_id → shop facts (name, label, certificates). */
  shops: Record<string, EvidenceShop>;
  /** ISO date the jobs were placed (routing). */
  routedAt: string | null;
  /** package_id → ISO date it was funded. */
  fundedAt: Record<string, string>;
  /** Fallback date (YYYY-MM-DD) when a row has none. */
  today: string;
  /** "shop_id|job_id" → that shop's latest answer (overrides the assignment status). */
  decisions?: Record<string, EvidenceDecision>;
  /** job_id → the shop Northgate re-offered the declined job to (demo; credit unchanged). */
  reoffers?: Record<string, { shop_id: string; shop_name: string | null }>;
}

export const decisionKeyOf = (shopId: string, jobId: string) => `${shopId}|${jobId}`;

/** Plain status for a work row: accepted / offered (awaiting reply) / declined — still counted (demo) / re-offered to <shop>. */
export function workStatus(
  shopId: string,
  jobId: string,
  assignmentStatus: string | null | undefined,
  input: Pick<EvidenceInput, "decisions" | "reoffers">,
): string {
  const moved = input.reoffers?.[jobId];
  if (moved && moved.shop_id !== shopId) return `re-offered to ${moved.shop_name || moved.shop_id}`;
  const st = input.decisions?.[decisionKeyOf(shopId, jobId)] ?? assignmentStatus ?? "offered";
  if (st === "accepted") return "accepted";
  if (st === "declined") return "declined — still counted (demo)";
  return "offered (awaiting reply)";
}

const SOURCE_LABEL: Record<ShopSource, string> = { synthetic: "Synthetic", public: "Public data (unverified)" };

/** "2026-09-27T08:49:30Z" → "2026-09-27". */
function day(iso: string | null | undefined, fallback: string): string {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : fallback;
}

/** Dollars with cents, no thousands separator (spreadsheet-friendly). */
function money(n: number | null | undefined): string {
  return Number.isFinite(n) ? (Math.round((n as number) * 100) / 100).toFixed(2) : "";
}

/** 0.62 → "62" (the column is a percentage). */
function pct(f: number | null | undefined): string {
  if (!Number.isFinite(f)) return "";
  const v = Math.round((f as number) * 1000) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** "type:status:source" for each certificate a job needs (plus CGP for a controlled job), joined with "; ". */
export function certsReliedOn(required: readonly string[], shop: EvidenceShop | undefined, controlled = false): string {
  const types = controlled ? [...required, "CGP"] : [...required];
  return types
    .filter((type, i, a) => a.indexOf(type) === i)
    .map((type) => {
      const cert = shop?.certs.find((x) => x.type === type);
      return `${type}:${cert?.status ?? "not on file"}:${cert?.source || "not stated"}`;
    })
    .join("; ");
}

/** One row per ledger transaction, work rows first (by job id), then training rows. */
export function buildEvidenceRows(input: EvidenceInput): EvidenceRow[] {
  const byJobA = new Map(input.assignments.map((a) => [a.job_id, a]));
  const byJob = new Map(input.jobs.map((j) => [j.id, j]));
  const byPkg = new Map(input.packages.map((p) => [p.id, p]));
  const work: EvidenceRow[] = [];
  const training: EvidenceRow[] = [];

  for (const t of input.transactions) {
    const shop = input.shops[t.shop_id];
    if (t.origin === "training") {
      const p = byPkg.get(t.ref_id);
      training.push({
        row_type: "training",
        job_id: t.ref_id,
        status: "funded",
        part_no: p?.title ? plainPackageTitle(p.title) : t.ref_id,
        shop_name: shop?.name ?? p?.shop_name ?? t.shop_id,
        shop_label: shop?.label ?? (p ? SOURCE_LABEL[p.shop_source] : ""),
        small_business: shop?.is_sme == null ? "" : shop.is_sme ? "yes" : "no",
        value_cad: money(t.value_cad),
        canadian_content_pct: pct(t.ccv_pct),
        multiplier: `${t.multiplier}x`,
        credit_cad: money(t.credit_cad),
        certificates_relied_on: "",
        date: day(input.fundedAt[t.ref_id], input.today),
        evidence_checklist: trainingChecklist(p?.category, t.multiplier),
      });
      continue;
    }
    const a = byJobA.get(t.ref_id);
    const j = byJob.get(t.ref_id);
    const isSme = a?.is_sme ?? shop?.is_sme ?? null;
    work.push({
      row_type: "work",
      job_id: t.ref_id,
      status: workStatus(t.shop_id, t.ref_id, a && a.shop_id === t.shop_id ? a.status : null, input),
      part_no: a?.part_no ?? j?.part_no ?? "",
      shop_name: shop?.name ?? a?.shop_name ?? t.shop_id,
      shop_label: shop?.label ?? (a ? SOURCE_LABEL[a.shop_source] : ""),
      small_business: isSme == null ? "" : isSme ? "yes" : "no",
      value_cad: money(t.value_cad),
      canadian_content_pct: pct(t.ccv_pct),
      multiplier: `${t.multiplier}x`,
      credit_cad: money(t.credit_cad),
      certificates_relied_on: certsReliedOn(j?.required_certs ?? [], shop, !!(j?.controlled ?? a?.controlled)),
      date: day(input.routedAt, input.today),
      evidence_checklist: WORK_CHECKLIST,
    });
  }
  work.sort((x, y) => x.job_id.localeCompare(y.job_id));
  training.sort((x, y) => x.job_id.localeCompare(y.job_id));
  return [...work, ...training];
}

/** RFC 4180: quote a field that holds a comma, a double quote, CR or LF; double inner quotes. */
export function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** The comment line, the header row, then one line per row (CRLF line ends, per RFC 4180). */
export function toEvidenceCsv(rows: readonly EvidenceRow[]): string {
  const lines = [
    EVIDENCE_PACK_COMMENT,
    EVIDENCE_COLUMNS.join(","),
    ...rows.map((r) => EVIDENCE_COLUMNS.map((c) => csvField(r[c] ?? "")).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function evidencePackCsv(input: EvidenceInput): string {
  return toEvidenceCsv(buildEvidenceRows(input));
}
