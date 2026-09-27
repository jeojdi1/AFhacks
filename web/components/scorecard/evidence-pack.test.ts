// Unit tests for the /scorecard evidence pack (evidence-pack.ts).
//
// Run from web/:   node --no-warnings --test components/scorecard/evidence-pack.test.ts
// (Node ≥ 22.18 strips TypeScript types natively; evidence-pack.ts has type-only imports.)

import { test } from "node:test"
import assert from "node:assert/strict"
import type { Assignment, CreditTxn, Job, TrainingPackage } from "@/lib/api/types"
import type { EvidenceInput } from "./evidence-pack"

// Dynamic import with the .ts extension so Node runs it directly (tsc sees the typed module).
const modPath = "./evidence-pack.ts"
const M = (await import(modPath)) as typeof import("./evidence-pack")
const {
  APPRENTICE_CHECKLIST,
  EVIDENCE_COLUMNS,
  EVIDENCE_PACK_COMMENT,
  TEN_X_NOTE,
  TRAINING_CHECKLIST,
  buildEvidenceRows,
  certsReliedOn,
  csvField,
  evidencePackCsv,
  plainPackageTitle,
  trainingChecklist,
} = M

const txn = (o: Partial<CreditTxn>): CreditTxn =>
  ({
    id: "t",
    program_id: "northgate",
    origin: "assignment",
    ref_id: "NG-001",
    shop_id: "syn-012",
    type: "direct",
    category: "sme_direct",
    value_cad: 1000,
    ccv_pct: 0.6,
    multiplier: 2,
    credit_cad: 1200,
    flags: [],
    ...o,
  }) as CreditTxn

function input(): EvidenceInput {
  return {
    transactions: [
      txn({ id: "t2", ref_id: "TP-01", origin: "training", type: "indirect", category: "training", value_cad: 96000, ccv_pct: 1, multiplier: 5, credit_cad: 480000 }),
      txn({ id: "t1", ref_id: "NG-002" }),
      txn({ id: "t0", ref_id: "NG-001", shop_id: "pub-051", category: "regular", multiplier: 1, credit_cad: 600 }),
    ],
    assignments: [
      { job_id: "NG-002", part_no: "P-2", shop_id: "syn-012", shop_name: "Tallowfield Fabricating Ltd.", shop_source: "synthetic", is_sme: true, status: "accepted" } as Assignment,
      { job_id: "NG-001", part_no: "P-1", shop_id: "pub-051", shop_name: 'Acme "Big" Works, Inc.', shop_source: "public", is_sme: false, status: "offered" } as Assignment,
    ],
    jobs: [{ id: "NG-002", part_no: "P-2", required_certs: ["CWB_W47.1", "CGP"] } as Job],
    packages: [{ id: "TP-01", title: "Qualify 4 welders under CSA W47.1", category: "personal_certification", shop_name: "Tallowfield", shop_source: "synthetic" } as TrainingPackage],
    shops: {
      "syn-012": {
        name: "Tallowfield Fabricating Ltd.",
        label: "Synthetic",
        is_sme: true,
        certs: [{ type: "CWB_W47.1", status: "verified", source: "synthetic demo data" }],
      },
    },
    routedAt: "2026-09-27T08:40:00Z",
    fundedAt: { "TP-01": "2026-09-28T10:00:00Z" },
    today: "2026-09-30",
  }
}

test("rows: work first by job id, then training; joins shop, job and package", () => {
  const rows = buildEvidenceRows(input())
  assert.deepEqual(
    rows.map((r) => [r.row_type, r.job_id]),
    [
      ["work", "NG-001"],
      ["work", "NG-002"],
      ["training", "TP-01"],
    ]
  )
  const [pub, tallow, tp] = rows
  assert.equal(pub.status, "offered (awaiting reply)")
  assert.equal(tallow.status, "accepted")
  assert.equal(tp.status, "funded")
  assert.equal(pub.shop_name, 'Acme "Big" Works, Inc.')
  assert.equal(pub.shop_label, "Public data (unverified)")
  assert.equal(pub.small_business, "no")
  assert.equal(tallow.small_business, "yes")
  assert.equal(tallow.canadian_content_pct, "60")
  assert.equal(tallow.multiplier, "2x")
  assert.equal(tallow.credit_cad, "1200.00")
  assert.equal(tallow.certificates_relied_on, "CWB_W47.1:verified:synthetic demo data; CGP:not on file:not stated")
  assert.equal(tallow.date, "2026-09-27")
  assert.equal(tp.part_no, "Qualify 4 welders under CSA W47.1")
  assert.equal(tp.value_cad, "96000.00")
  assert.equal(tp.multiplier, "5x")
  assert.equal(tp.credit_cad, "480000.00")
  assert.equal(tp.date, "2026-09-28")
  assert.equal(tp.evidence_checklist, TRAINING_CHECKLIST)
})

test("csvField: RFC 4180 quoting", () => {
  assert.equal(csvField("plain"), "plain")
  assert.equal(csvField("a,b"), '"a,b"')
  assert.equal(csvField('say "hi"'), '"say ""hi"""')
  assert.equal(csvField("two\nlines"), '"two\nlines"')
  assert.equal(csvField(""), "")
})

test("csv: comment line, header, one line per transaction", () => {
  const csv = evidencePackCsv(input())
  const lines = csv.split("\r\n")
  assert.equal(lines[0], EVIDENCE_PACK_COMMENT)
  assert.equal(lines[1], EVIDENCE_COLUMNS.join(","))
  assert.equal(lines.length, 2 + 3 + 1) // trailing CRLF
  assert.ok(lines[2].includes('"Acme ""Big"" Works, Inc."'))
  assert.ok(lines[4].endsWith(TRAINING_CHECKLIST))
})

test("status: the shop's decision wins; a declined job re-offered elsewhere names the new shop", () => {
  const base = input()
  const rows = buildEvidenceRows({
    ...base,
    decisions: { "syn-012|NG-002": "declined", "pub-051|NG-001": "question" },
  })
  assert.equal(rows.find((r) => r.job_id === "NG-002")?.status, "declined — still counted (demo)")
  assert.equal(rows.find((r) => r.job_id === "NG-001")?.status, "offered (awaiting reply)")
  const moved = buildEvidenceRows({
    ...base,
    decisions: { "syn-012|NG-002": "declined" },
    reoffers: { "NG-002": { shop_id: "syn-008", shop_name: "Kestrel Axis" } },
  })
  const row = moved.find((r) => r.job_id === "NG-002")
  assert.equal(row?.status, "re-offered to Kestrel Axis")
  assert.equal(row?.credit_cad, "1200.00") // credit never changes
})

test("certificates: a controlled job relies on Controlled Goods (CGP), listed once", () => {
  assert.equal(certsReliedOn([], undefined, true), "CGP:not on file:not stated")
  assert.equal(certsReliedOn(["CGP"], undefined, true), "CGP:not on file:not stated")
  const rows = buildEvidenceRows({ ...input(), jobs: [{ id: "NG-002", part_no: "P-2", required_certs: [], controlled: true } as unknown as Job] })
  assert.equal(rows.find((r) => r.job_id === "NG-002")?.certificates_relied_on, "CGP:not on file:not stated")
})

test("training: checklist by category, 10x note, plain W47.1 title", () => {
  assert.equal(trainingChecklist("personal_certification", 5), TRAINING_CHECKLIST)
  assert.equal(trainingChecklist("apprentice_sponsorship", 10), `${APPRENTICE_CHECKLIST}; ${TEN_X_NOTE}`)
  assert.equal(
    plainPackageTitle("Certify 4 welders to CWB W47.1 at Tallowfield Fabricating Ltd. (Woolwich)"),
    "Qualify 4 welders under CSA W47.1 at Tallowfield Fabricating Ltd. (Woolwich)"
  )
  const base = input()
  const rows = buildEvidenceRows({
    ...base,
    transactions: [...base.transactions, txn({ id: "t3", ref_id: "TP-02", origin: "training", multiplier: 10, credit_cad: 1000 })],
    packages: [...base.packages, { id: "TP-02", title: "Sponsor 2 apprentices", category: "apprentice_sponsorship", shop_name: "X", shop_source: "synthetic" } as TrainingPackage],
  })
  const tp2 = rows.find((r) => r.job_id === "TP-02")
  assert.equal(tp2?.evidence_checklist, `${APPRENTICE_CHECKLIST}; ${TEN_X_NOTE}`)
  assert.ok(!rows.some((r) => /certify \d+ welders/i.test(r.part_no)))
})
