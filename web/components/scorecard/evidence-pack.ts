// "Download evidence pack (CSV)" on /scorecard: the evidence behind each credit line, built in
// the browser from the store (live and fixtures). Pure: no React, no DOM, type-only imports, so
// Node can unit-test it (evidence-pack.test.ts).
//
// One row per ledger transaction: work rows (origin "assignment") joined with the assignment,
// the job and the shop; training rows (origin "training", funded packages) joined with the
// package. Line 1 is a comment saying this is a demo, not an official ITB report.

import type { Assignment, CertStatus, CreditTxn, Job, ShopSource, TrainingPackage } from "@/lib/api/types";

export const EVIDENCE_PACK_FILENAME = "muster-evidence-pack-northgate.csv";
export const EVIDENCE_PACK_COMMENT = "# Muster demo — simplified ITB rules — not an official ITB report";

export const EVIDENCE_COLUMNS = [
  "row_type",
  "job_id",
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

/** "type:status:source" for each certificate a job needs, joined with "; ". */
export function certsReliedOn(required: readonly string[], shop: EvidenceShop | undefined): string {
  return required
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
        part_no: p?.title ?? t.ref_id,
        shop_name: shop?.name ?? p?.shop_name ?? t.shop_id,
        shop_label: shop?.label ?? (p ? SOURCE_LABEL[p.shop_source] : ""),
        small_business: shop?.is_sme == null ? "" : shop.is_sme ? "yes" : "no",
        value_cad: money(t.value_cad),
        canadian_content_pct: pct(t.ccv_pct),
        multiplier: `${t.multiplier}x`,
        credit_cad: money(t.credit_cad),
        certificates_relied_on: "",
        date: day(input.fundedAt[t.ref_id], input.today),
        evidence_checklist: TRAINING_CHECKLIST,
      });
      continue;
    }
    const a = byJobA.get(t.ref_id);
    const j = byJob.get(t.ref_id);
    const isSme = a?.is_sme ?? shop?.is_sme ?? null;
    work.push({
      row_type: "work",
      job_id: t.ref_id,
      part_no: a?.part_no ?? j?.part_no ?? "",
      shop_name: shop?.name ?? a?.shop_name ?? t.shop_id,
      shop_label: shop?.label ?? (a ? SOURCE_LABEL[a.shop_source] : ""),
      small_business: isSme == null ? "" : isSme ? "yes" : "no",
      value_cad: money(t.value_cad),
      canadian_content_pct: pct(t.ccv_pct),
      multiplier: `${t.multiplier}x`,
      credit_cad: money(t.credit_cad),
      certificates_relied_on: certsReliedOn(j?.required_certs ?? [], shop),
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
