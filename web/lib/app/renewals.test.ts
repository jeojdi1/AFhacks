// Unit tests for renewalFor() (docs/app-spec.md §2.4). Owner: Agent C.
//
// Run from web/:   node --no-warnings --test lib/app/renewals.test.ts
// (Node ≥ 22.18 strips TypeScript types natively; no tsx needed.)
//
// The loader hooks below let Node load renewals.ts the way the Next bundler
// does: extensionless relative imports resolve to .ts, and JSON is imported
// without an import attribute.

import { register } from "node:module"
import { test } from "node:test"
import assert from "node:assert/strict"
import type { Assignment, CertWithDates, Job } from "./types"

const HOOKS = `
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\\.[a-z]+$/i.test(specifier)) {
    const url = new URL(specifier + ".ts", context.parentURL);
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.startsWith("file:") && url.endsWith(".json")) {
    const text = await readFile(fileURLToPath(url), "utf8");
    return { format: "module", source: "export default " + text + ";", shortCircuit: true };
  }
  return next(url, context);
}
`
register("data:text/javascript," + encodeURIComponent(HOOKS), import.meta.url)

const modPath = "./renewals.ts"
const R = (await import(modPath)) as typeof import("./renewals")
const { renewalFor, ruleFor, renewalsFor, renewalSummary, fmtCredit, needsAttention } = R

// ---------------------------------------------------------------------------
// Fixtures

const d = (iso: string) => {
  const [y, m, day] = iso.split("-").map(Number)
  return new Date(y, m - 1, day, 21, 30)
}

function cert(type: string, expires: string | null, over: Partial<CertWithDates> = {}): CertWithDates {
  return {
    shop_id: "syn-001",
    type: type as CertWithDates["type"],
    status: "declared",
    source_url: null,
    verified_at: null,
    expires_at: expires,
    note: null,
    date_basis: "illustrative",
    declaration: null,
    ...over,
  }
}

function job(id: string, required: string[], controlled = false): Job {
  return {
    id,
    program_id: "northgate",
    part_no: `P-${id}`,
    description: id,
    qty: 1,
    unit_price_cad: 1,
    est_value_cad: 1,
    ccv_pct: 0.9,
    hours_week: 10,
    material: "steel",
    process_tags: ["cnc_milling"],
    envelope_mm: [1, 1, 1],
    tolerance_class: "standard",
    required_certs: required as Job["required_certs"],
    controlled,
    tag_source: "rules",
    status: "assigned",
  }
}

function asg(jobId: string, shopId: string, value: number, credit: number, controlled: boolean, status: Assignment["status"] = "offered"): Assignment {
  return {
    job_id: jobId,
    part_no: `P-${jobId}`,
    description: jobId,
    shop_id: shopId,
    shop_name: shopId,
    shop_source: "synthetic",
    shop_city: "Kitchener",
    shop_lat: 0,
    shop_lon: 0,
    is_sme: true,
    controlled,
    hours_week: 10,
    value_cad: value,
    ccv_pct: 0.9,
    category: "sme_direct",
    multiplier: 2,
    credit_cad: credit,
    distance_km: 10,
    score: 0.9,
    score_breakdown: { fit: 1, distance: 1, lead_time: 1, itb_value: 1 },
    reasons: ["a", "b", "c"],
    status,
  }
}

// The real demo data (data/fixtures/route.json, jobs.json).
const jobsById: Record<string, Job> = {
  "NG-004": job("NG-004", ["AS9100"], true),
  "NG-009": job("NG-009", ["AS9100"], false),
  "NG-021": job("NG-021", [], false),
  "NG-022": job("NG-022", ["CPCSC_L1"], false),
}
const assignments: Assignment[] = [
  asg("NG-004", "syn-001", 2812000, 5061600, true),
  asg("NG-009", "syn-001", 1976000, 3517280, false),
  asg("NG-021", "syn-012", 921600, 1677312, false),
  asg("NG-022", "syn-012", 777600, 1415232, false),
]
const ctx = (today: string, shopId = "syn-001") => ({ today: d(today), shopId, jobsById, assignments })

// ---------------------------------------------------------------------------
// Demo acceptance (spec §2.4)

test("syn-001 CGP (2027-01-15) is urgent on 2026-09-26: act by Oct 17, 21 days, NG-004 at risk", () => {
  const r = renewalFor(cert("CGP", "2027-01-15"), ctx("2026-09-26"))
  assert.equal(r.act_by, "2026-10-17")
  assert.equal(r.stage, "urgent")
  assert.equal(r.days_left, 21)
  assert.deepEqual(r.jobs_at_risk, ["NG-004"])
  assert.equal(r.value_at_risk_cad, 2812000)
  assert.equal(r.credit_at_risk_cad, 5061600)
  assert.equal(r.flag, "verified")
  assert.match(r.source_url, /^https:\/\/www\.canada\.ca\/.+renew-or-terminate-registration\.html$/)
  assert.match(r.registry_url ?? "", /find-individuals-organizations-registered-program/)
  assert.equal(r.date_basis, "illustrative")
  assert.equal(
    renewalSummary(r, d("2026-09-26")),
    "CGP · file renewal by Oct 17 · NG-004 · $2.8M work · $5.06M Northgate credit at risk"
  )
})

test("syn-012 CPCSC L1 (2027-09-06) is ok, act-by = expiry", () => {
  const r = renewalFor(cert("CPCSC_L1", "2027-09-06", { shop_id: "syn-012" }), ctx("2026-09-26", "syn-012"))
  assert.equal(r.stage, "ok")
  assert.equal(r.act_by, "2027-09-06")
  assert.equal(r.registry_url, null)
  assert.deepEqual(r.jobs_at_risk, ["NG-022"])
})

test("status unknown with no declaration shows no stage (Not held) and nothing at risk", () => {
  const r = renewalFor(cert("CGP", null, { status: "unknown", shop_id: "syn-012" }), ctx("2026-09-26", "syn-012"))
  assert.equal(r.stage, "unknown")
  assert.equal(r.act_by, null)
  assert.equal(r.days_left, null)
  assert.deepEqual(r.jobs_at_risk, [])
  assert.equal(r.consequence, null)
})

test("status unknown with an illustrative date still shows Not held", () => {
  const r = renewalFor(cert("AS9100", "2026-10-01", { status: "unknown" }), ctx("2026-09-26"))
  assert.equal(r.stage, "unknown")
  assert.equal(r.expires_at, null)
})

test("a shop-declared date on a not-held cert gets no stage and stays shop-declared", () => {
  const declaration = {
    shop_id: "syn-012",
    type: "CGP" as const,
    expires_at: "2027-04-30",
    cert_number: null,
    status: "declared" as const,
    declared_at: "2026-09-26T21:50:00Z",
    note: "Shop-declared; not used for routing until reviewed",
  }
  const r = renewalFor(
    cert("CGP", "2027-04-30", { status: "unknown", shop_id: "syn-012", date_basis: "shop-declared", declaration }),
    ctx("2026-09-26", "syn-012")
  )
  // "Not held" never shows a stage: a self-declared date does not make a certificate held.
  assert.equal(r.act_by, null)
  assert.equal(r.stage, "unknown")
  assert.equal(r.expires_at, null)
  assert.equal(r.date_basis, "shop-declared")
  assert.equal(r.status, "unknown")
})

test("a lapsed cert (status expired) is stage lapsed with its date and consequence", () => {
  const r = renewalFor(cert("CGP", "2026-08-31", { status: "expired", shop_id: "syn-028" }), ctx("2026-09-26", "syn-028"))
  assert.equal(r.stage, "lapsed")
  assert.equal(r.expires_at, "2026-08-31")
  assert.equal(r.days_left, -26)
  assert.equal(r.act_by, null)
  assert.ok(r.consequence && r.consequence.includes("re-registering"))
  assert.deepEqual(r.jobs_at_risk, [])
  assert.ok(needsAttention(r))
  assert.equal(renewalSummary(r, d("2026-09-26")), "CGP · lapsed Aug 31")
})

test("expiryAlert flags urgent and lapsed certificates only", () => {
  assert.equal(R.expiryAlert(cert("CGP", "2027-01-15"), d("2026-09-26"))?.stage, "urgent")
  assert.equal(R.expiryAlert(cert("ISO9001", "2029-09-07"), d("2026-09-26")), null)
  assert.equal(R.expiryAlert(cert("CGP", null, { status: "unknown" }), d("2026-09-26")), null)
  assert.equal(R.expiryAlert(cert("CGP", "2026-08-31", { status: "expired" }), d("2026-09-26"))?.stage, "lapsed")
})

test("held cert with no date is stage unknown (Date unknown)", () => {
  const r = renewalFor(cert("ISO9001", null), ctx("2026-09-26"))
  assert.equal(r.stage, "unknown")
  assert.equal(r.days_left, null)
})

// ---------------------------------------------------------------------------
// Every stage boundary. CGP: act_by 90, remind 60, urgent 30.
// expires 2027-01-15 → act_by 2026-10-17 → urgent from 2026-09-17 → window from 2026-08-18.

test("CGP boundaries: ok / window_open / urgent / lapsed", () => {
  const c = cert("CGP", "2027-01-15")
  const at = (day: string) => renewalFor(c, ctx(day)).stage
  assert.equal(at("2026-08-17"), "ok") // act_by − 61
  assert.equal(at("2026-08-18"), "window_open") // act_by − 60
  assert.equal(at("2026-09-16"), "window_open") // act_by − 31
  assert.equal(at("2026-09-17"), "urgent") // act_by − 30
  assert.equal(at("2026-10-17"), "urgent") // act_by
  assert.equal(at("2026-10-18"), "urgent") // past act_by, before expiry
  assert.equal(at("2027-01-15"), "urgent") // expiry day itself is not lapsed
  assert.equal(at("2027-01-16"), "lapsed") // today > expires_at
})

test("days_left counts to act_by, then to expiry once lapsed", () => {
  const c = cert("CGP", "2027-01-15")
  assert.equal(renewalFor(c, ctx("2026-10-18")).days_left, -1)
  assert.equal(renewalFor(c, ctx("2027-01-20")).days_left, -5)
})

test("CPCSC L1 boundaries (act_by 0, remind 60)", () => {
  const c = cert("CPCSC_L1", "2027-09-06")
  const at = (day: string) => renewalFor(c, ctx(day)).stage
  assert.equal(at("2027-07-07"), "ok") // −61
  assert.equal(at("2027-07-08"), "window_open") // −60
  assert.equal(at("2027-08-06"), "window_open") // −31
  assert.equal(at("2027-08-07"), "urgent") // −30
  assert.equal(at("2027-09-06"), "urgent")
  assert.equal(at("2027-09-07"), "lapsed")
})

test("welder ticket uses remind 90 (window opens 90 days out)", () => {
  const c = cert("CWB_WELDER_TICKET", "2027-03-01")
  assert.equal(renewalFor(c, ctx("2026-11-30")).stage, "ok") // −91
  assert.equal(renewalFor(c, ctx("2026-12-01")).stage, "window_open") // −90
})

test("CWB W47.1 has no act-by offset: counts to the declared date with the default window", () => {
  const c = cert("CWB_W47.1", "2027-03-01", { date_basis: "shop-declared" })
  const r = renewalFor(c, ctx("2027-01-15")) // 45 days out
  assert.equal(r.act_by, "2027-03-01")
  assert.equal(r.stage, "window_open")
  assert.equal(r.flag, "assumption")
})

test("boundaries hold across a DST change (Nov 1 2026)", () => {
  const c = cert("CPCSC_L1", "2026-12-01")
  assert.equal(renewalFor(c, ctx("2026-10-31")).stage, "window_open") // 31 days out
  assert.equal(renewalFor(c, ctx("2026-11-01")).stage, "urgent") // 30 days out (DST ends this day)
})

// ---------------------------------------------------------------------------
// Rules and work at risk

test("Nadcap sub-types match the NADCAP:* rule", () => {
  assert.equal(ruleFor("NADCAP:HEAT_TREAT").cert_type, "NADCAP:*")
  assert.equal(ruleFor("NADCAP:COATINGS").source_url, "https://www.p-r-i.org/nadcap/getting-started")
})

test("every rule has a source URL, and non-verified values are flagged assumption", () => {
  for (const t of ["CGP", "CPCSC_L1", "AS9100", "ISO9001", "NADCAP:CHEM_PROCESSING", "CWB_W47.1", "CWB_WELDER_TICKET"]) {
    const rule = ruleFor(t)
    assert.match(rule.source_url, /^https:\/\//, t)
    assert.ok(rule.flag === "verified" || rule.flag === "assumption", t)
    assert.ok(rule.text.length > 20, t)
  }
  assert.equal(ruleFor("ISO9001").flag, "assumption")
  assert.equal(ruleFor("AS9100").act_by_flag, "assumption")
  assert.equal(renewalFor(cert("AS9100", "2027-09-10"), ctx("2026-09-26")).flag, "assumption")
})

test("AS9100 at syn-001 puts both AS9100 jobs at risk; declined offers drop out", () => {
  const r = renewalFor(cert("AS9100", "2027-09-10"), ctx("2026-09-26"))
  assert.deepEqual(r.jobs_at_risk.sort(), ["NG-004", "NG-009"])
  assert.equal(r.stage, "ok")
  const declined = assignments.map((a) => (a.job_id === "NG-009" ? { ...a, status: "declined" as const } : a))
  const r2 = renewalFor(cert("AS9100", "2027-09-10"), { ...ctx("2026-09-26"), assignments: declined })
  assert.deepEqual(r2.jobs_at_risk, ["NG-004"])
})

test("CGP only counts controlled jobs at this shop", () => {
  const r = renewalFor(cert("CGP", "2027-01-15", { shop_id: "syn-012" }), ctx("2026-09-26", "syn-012"))
  assert.deepEqual(r.jobs_at_risk, [])
  assert.equal(r.credit_at_risk_cad, 0)
})

test("renewalsFor sorts by soonest deadline, Not held last", () => {
  const list = renewalsFor(
    [
      cert("ISO9001", "2029-09-07"),
      cert("CWB_W47.1", null, { status: "unknown" }),
      cert("AS9100", "2027-09-10"),
      cert("CGP", "2027-01-15"),
    ],
    ctx("2026-09-26")
  )
  assert.deepEqual(
    list.map((r) => r.cert_type),
    ["CGP", "AS9100", "ISO9001", "CWB_W47.1"]
  )
  assert.equal(needsAttention(list[0]), true)
  assert.equal(needsAttention(list[1]), false)
})

test("fmtCredit matches the demo copy", () => {
  assert.equal(fmtCredit(5061600), "$5.06M")
  assert.equal(fmtCredit(1677312), "$1.68M")
  assert.equal(fmtCredit(12400000), "$12.4M")
  assert.equal(fmtCredit(2000000), "$2M")
})
