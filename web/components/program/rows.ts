import type { Assignment, BlockedJob, Job, Shop, TagSource } from "@/lib/api/types";

export type RowStatus = "assigned" | "blocked" | "unrouted";
export type JobFilter = "all" | "assigned" | "blocked" | "controlled";

export interface JobRow {
  id: string;
  partNo: string;
  description: string;
  processTags: string[];
  /** How the tagger produced the tags (null when rebuilt from routing results only). */
  tagSource: TagSource | null;
  tagWarning: string | null;
  controlled: boolean;
  valueCad: number;
  status: RowStatus;
  assignment: Assignment | null;
  blocked: BlockedJob | null;
}

/**
 * One row per job. Prefers the tagged jobs list; if the store only has routing
 * results (e.g. fixtures loaded straight into the routed state), rebuilds rows
 * from assignments + blocked so the table is never empty after routing.
 */
export function buildRows(
  jobs: Job[],
  assignments: Assignment[],
  blocked: BlockedJob[],
): JobRow[] {
  const byJobA = new Map(assignments.map((a) => [a.job_id, a]));
  const byJobB = new Map(blocked.map((b) => [b.job_id, b]));

  if (jobs.length > 0) {
    return jobs.map((j) => {
      const a = byJobA.get(j.id) ?? null;
      const b = a ? null : (byJobB.get(j.id) ?? null);
      const status: RowStatus = a ? "assigned" : b ? "blocked" : "unrouted";
      return {
        id: j.id,
        partNo: j.part_no,
        description: j.description,
        processTags: j.process_tags,
        tagSource: j.tag_source ?? null,
        tagWarning: j.tag_warning ?? null,
        controlled: j.controlled,
        valueCad: a?.value_cad ?? b?.value_cad ?? j.est_value_cad,
        status,
        assignment: a,
        blocked: b,
      };
    });
  }

  const rows: JobRow[] = [
    ...assignments.map<JobRow>((a) => ({
      id: a.job_id,
      partNo: a.part_no,
      description: a.description,
      processTags: [],
      tagSource: null,
      tagWarning: null,
      controlled: a.controlled,
      valueCad: a.value_cad,
      status: "assigned",
      assignment: a,
      blocked: null,
    })),
    ...blocked.map<JobRow>((b) => ({
      id: b.job_id,
      partNo: b.part_no,
      description: b.description,
      processTags: b.process_tags,
      tagSource: null,
      tagWarning: null,
      controlled: false,
      valueCad: b.value_cad,
      status: "blocked",
      assignment: null,
      blocked: b,
    })),
  ];
  return rows.sort((x, y) => x.id.localeCompare(y.id));
}

export function filterRows(rows: JobRow[], filter: JobFilter): JobRow[] {
  switch (filter) {
    case "assigned":
      return rows.filter((r) => r.status === "assigned");
    case "blocked":
      return rows.filter((r) => r.status === "blocked");
    case "controlled":
      return rows.filter((r) => r.controlled);
    default:
      return rows;
  }
}

// ---------- map model ----------

export interface MapShop {
  id: string;
  name: string;
  source: "public" | "synthetic";
  city: string;
  lat: number;
  lon: number;
  jobs: { jobId: string; partNo: string; controlled: boolean }[];
  controlledJobs: number;
  valueCad: number;
  hasCgp: boolean | null;
}

export interface MapLine {
  shopId: string;
  lat: number;
  lon: number;
  controlled: boolean;
  jobCount: number;
}

export function buildMapModel(
  shops: Shop[],
  assignments: Assignment[],
): { shops: MapShop[]; lines: MapLine[] } {
  const out = new Map<string, MapShop>();

  for (const s of shops) {
    if (typeof s.lat !== "number" || typeof s.lon !== "number") continue;
    const cgp = s.cert_summary?.find((c) => c.type === "CGP");
    out.set(s.id, {
      id: s.id,
      name: s.name,
      source: s.source,
      city: s.city,
      lat: s.lat,
      lon: s.lon,
      jobs: [],
      controlledJobs: 0,
      valueCad: 0,
      hasCgp: s.cert_summary
        ? !!cgp && ["verified", "declared", "pending_training"].includes(cgp.status)
        : null,
    });
  }

  for (const a of assignments) {
    let s = out.get(a.shop_id);
    if (!s) {
      s = {
        id: a.shop_id,
        name: a.shop_name,
        source: a.shop_source,
        city: a.shop_city,
        lat: a.shop_lat,
        lon: a.shop_lon,
        jobs: [],
        controlledJobs: 0,
        valueCad: 0,
        hasCgp: null,
      };
      out.set(a.shop_id, s);
    }
    s.jobs.push({ jobId: a.job_id, partNo: a.part_no, controlled: a.controlled });
    s.valueCad += a.value_cad;
    if (a.controlled) {
      s.controlledJobs += 1;
      // a controlled job can only be assigned to a CGP shop
      s.hasCgp = true;
    }
  }

  const list = [...out.values()];
  const lines: MapLine[] = [];
  for (const s of list) {
    const ctrl = s.controlledJobs;
    const other = s.jobs.length - ctrl;
    if (other > 0) {
      lines.push({ shopId: s.id, lat: s.lat, lon: s.lon, controlled: false, jobCount: other });
    }
    if (ctrl > 0) {
      lines.push({ shopId: s.id, lat: s.lat, lon: s.lon, controlled: true, jobCount: ctrl });
    }
  }
  return { shops: list, lines };
}
