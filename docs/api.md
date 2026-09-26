# Muster API contract (v0.1)

Owner: Lane B (shared). Source of truth for field names. Any change is a `CONTRACT:` commit that also updates `/data/fixtures` (CLAUDE.md §2).

- Base URL: `http://localhost:8000` (`API_URL` / `NEXT_PUBLIC_API_URL`)
- Demo program id: **`northgate`** (Northgate Land Systems, fictional prime)
- All bodies are JSON unless noted. Errors: `{"detail": "<readable message>"}` with 400 / 404 / 409 / 501.
- **Money** is CAD dollars as numbers, rounded to cents.
- **Every `*_pct` field is a fraction in [0, 1]** (`0.15` = 15%). The web formats it.
- Every credit number is computed as `value_cad × ccv_pct × multiplier` (CLAUDE.md §3.5).
- **Numbers in the examples below are illustrative.** The consistent, checked numbers live in `/data/fixtures`.

---

## 1. Vocabularies (enums)

| Name | Values |
| --- | --- |
| `process_tag` | `cnc_milling`, `five_axis_milling`, `cnc_turning`, `sheet_metal`, `welding`, `heat_treat`, `anodizing`, `plating`, `painting`, `wire_harness`, `electronics_assembly`, `fasteners` |
| `material` | `steel`, `armour_steel`, `stainless`, `aluminum`, `titanium`, `copper`, `polymer` |
| `tolerance_class` | `standard` < `precision` < `ultra` (a shop's value is the best it can hold; used in the fit score, not as a hard filter) |
| `cert_type` | `CGP`, `CPCSC_L1`, `ISO9001`, `AS9100`, `NADCAP:HEAT_TREAT`, `NADCAP:CHEM_PROCESSING`, `NADCAP:COATINGS`, `CWB_W47.1` |
| `cert_status` | `verified`, `declared`, `unknown`, `pending_training` |
| `filter` (rejection reason codes) | `process`, `envelope`, `certs`, `controlled_cgp`, `cpcsc`, `capacity` |
| `credit_category` | `regular` (1x), `sme_direct` (2x), `training` (5x), `indigenous_training` (10x) |
| `training_category` | `apprentice_sponsorship`, `personal_certification`, `skills_program_contribution`, `education_costs` |
| `recipient_type` | `college`, `apprenticeship_sponsor`, `nonprofit`, `indigenous_institution` |
| `shop.source` | `public`, `synthetic` |
| `assignment.status` | `offered`, `accepted`, `declined` |
| `package.status` | `suggested`, `funded` |
| `program.state` | `empty` (after reset), `uploaded`, `routed`, `funded` |

A certification **counts** for the rules if its status is `verified`, `declared` or `pending_training`. `pending_training` is only ever created by funding a training package. A job **requires CPCSC** if `"CPCSC_L1"` is in its `required_certs`. A `controlled: true` job may only go to a shop whose `CGP` certification counts.

---

## 2. Shared objects

### Shop
```json
{
  "id": "syn-012",
  "name": "Example Fabricating Ltd.",
  "source": "synthetic",
  "label": "Synthetic",
  "city": "Woolwich", "lat": 43.599, "lon": -80.557,
  "naics": "332319",
  "employee_band": "20-49",
  "is_sme": true,
  "processes": ["welding", "sheet_metal", "painting"],
  "machines": ["MIG/GMAW cells (4)", "Press brake 175t"],
  "materials": ["steel", "armour_steel", "aluminum"],
  "max_envelope_mm": [3000, 1500, 1200],
  "tolerance_class": "standard",
  "capacity_hours_week": 160,
  "lead_time_days": 21,
  "website": null,
  "contact_role_email": "sales@example.com",
  "provenance": [{ "field": "processes", "source_url": null, "confidence": "synthetic" }],
  "cert_summary": [{ "type": "CGP", "status": "declared" }, { "type": "CWB_W47.1", "status": "unknown" }]
}
```
`label` is `"Synthetic"` for synthetic shops and `"Public data — unverified — not affiliated"` for public ones. `max_envelope_mm` and `envelope_mm` are `[x, y, z]`; a job fits if its sorted dimensions are each ≤ the shop's sorted dimensions. `cert_summary` appears in list views.

### Certification
```json
{ "shop_id": "syn-012", "type": "CWB_W47.1", "status": "unknown",
  "source_url": null, "verified_at": null, "expires_at": null,
  "note": "Synthetic shop: status is illustrative" }
```

### Job (one per parts-list line)
```json
{
  "id": "NG-031",
  "program_id": "northgate",
  "part_no": "NG-HUL-4410",
  "description": "Hull side stowage bin weldment, armour steel, CWB W47.1 structural welding",
  "qty": 1440,
  "unit_price_cad": 1250.0,
  "est_value_cad": 1800000.0,
  "ccv_pct": 0.85,
  "hours_week": 40,
  "material": "armour_steel",
  "process_tags": ["welding", "painting"],
  "envelope_mm": [900, 600, 450],
  "tolerance_class": "standard",
  "required_certs": ["CWB_W47.1"],
  "controlled": false,
  "tag_source": "cache",
  "status": "blocked"
}
```
`qty` is the **fleet-lifetime quantity** (all vehicles plus spares over the program). `est_value_cad = qty × unit_price_cad`. `hours_week` is the weekly shop load during production and is what counts against `capacity_hours_week`. `tag_source` is `llm | cache | rules`. `status` is `unrouted | assigned | blocked`.

### Assignment
```json
{
  "job_id": "NG-004", "part_no": "NG-TUR-1120", "description": "Turret ring gear housing, 5-axis",
  "shop_id": "syn-004", "shop_name": "Example Precision Inc.", "shop_source": "synthetic",
  "shop_city": "Kitchener", "shop_lat": 43.451, "shop_lon": -80.492,
  "is_sme": true, "controlled": true,
  "hours_week": 24, "value_cad": 2160000.0, "ccv_pct": 0.9,
  "category": "sme_direct", "multiplier": 2, "credit_cad": 3888000.0,
  "distance_km": 88.4,
  "score": 0.81,
  "score_breakdown": { "fit": 0.92, "distance": 0.55, "lead_time": 0.70, "itb_value": 1.0 },
  "reasons": ["5-axis milling + AS9100", "CGP-registered (controlled job)", "SME: 2x direct credit"],
  "status": "offered"
}
```
`reasons` has exactly 3 short strings (the top 3). `shop_lat/lon` are included so the map can draw job lines without another call.

### BlockedJob
```json
{
  "job_id": "NG-031", "part_no": "NG-HUL-4410",
  "description": "Hull side stowage bin weldment, armour steel, CWB W47.1 structural welding",
  "process_tags": ["welding", "painting"], "required_certs": ["CWB_W47.1"],
  "value_cad": 1800000.0, "hours_week": 40,
  "reason_code": "capacity",
  "reason": "Both CWB W47.1 welding shops in range are at capacity; 3 other welding shops lack CWB W47.1",
  "eligible_shop_count": 2,
  "failing_filters": { "process": 24, "envelope": 0, "certs": 3, "controlled_cgp": 0, "cpcsc": 0, "capacity": 2 },
  "suggestion_ids": ["TP-01"]
}
```
`eligible_shop_count` counts shops that pass every filter **except** capacity. `failing_filters` counts shops failing each filter (a shop can fail more than one).

### CreditTxn
```json
{
  "id": "TX-0031", "program_id": "northgate",
  "origin": "assignment", "ref_id": "NG-004", "shop_id": "syn-004",
  "type": "direct", "category": "sme_direct",
  "value_cad": 2160000.0, "ccv_pct": 0.9, "multiplier": 2, "credit_cad": 3888000.0,
  "flags": ["simplified-demo"]
}
```
Assignments are `direct` (work on the contract): `sme_direct` (2x) if the shop is an SME, else `regular` (1x). Funded training is `indirect`, `ccv_pct` 1.0, category `training` (5x) or `indigenous_training` (10x), flags include `"assumption"`.

### TrainingPackage
```json
{
  "id": "TP-01", "program_id": "northgate",
  "title": "Certify 4 welders to CWB W47.1 at Example Fabricating (Woolwich)",
  "blocked_job_ids": ["NG-031", "NG-032", "NG-033"],
  "shop_id": "syn-012", "shop_name": "Example Fabricating Ltd.", "shop_city": "Woolwich", "shop_source": "synthetic",
  "gap": { "kind": "cert", "requirement": "CWB_W47.1",
           "detail": "Has welding cells and free capacity, but no CWB W47.1 certification" },
  "category": "personal_certification",
  "categories": ["personal_certification", "apprentice_sponsorship"],
  "recipient_type": "college",
  "recipient_example": "Conestoga College (example, not affiliated)",
  "trainees": 4,
  "est_cost_cad": 96000.0,
  "cost_basis": "data/rules/training_costs.json (assumption)",
  "multiplier": 5,
  "est_credit_cad": 480000.0,
  "cert_unlock": "CWB_W47.1",
  "capacity_unlock": { "welding": 80 },
  "unblocks_value_cad": 5100000.0,
  "eligibility_note": "Personal certification counts only for Canadian citizens or permanent residents (ITB model terms §7.5.1).",
  "flags": ["assumption"],
  "status": "suggested"
}
```
`category` is the primary category; `categories` lists all that apply. `est_credit_cad = est_cost_cad × 1.0 × multiplier`.

### Snapshot (used by fund)
```json
{ "assigned": 36, "blocked": 4,
  "credit_total_cad": 61200000.0, "obligation_met_pct": 0.1224,
  "direct_credit_cad": 61200000.0, "indirect_credit_cad": 0.0,
  "smb_achieved_cad": 29700000.0, "smb_progress_pct": 0.396 }
```

---

## 3. Endpoints

### `GET /health`
```json
{ "status": "ok", "service": "muster-engine", "version": "0.1.0" }
```

### `POST /demo/reset`
Rebuilds the demo state: shops and the program are seeded, no parts uploaded, no packages funded.
```json
{ "ok": true, "program_id": "northgate", "shops": 30, "jobs": 0,
  "message": "Demo reset: shops and program seeded; no parts uploaded." }
```

### `GET /programs/{id}`
```json
{
  "program": {
    "id": "northgate", "prime_name": "Northgate Land Systems", "prime_label": "Fictional prime",
    "site": { "city": "London", "lat": 42.9849, "lon": -81.2453 },
    "contract_value_cad": 500000000.0, "obligation_cad": 500000000.0,
    "smb_target_pct": 0.15, "rules_version": "demo-2026-09-26",
    "rules_label": "Simplified ITB rules for demo"
  },
  "counts": { "jobs": 40, "assigned": 36, "blocked": 4, "shops": 30 },
  "state": "routed"
}
```

### `POST /programs/{id}/parts`
Uploads a parts list and tags every line. Either:
- `multipart/form-data` with field **`file`** (a CSV), or
- no body with query **`?use_demo=true`** (loads `data/processed/parts_northgate.csv`).

CSV columns. Required: `part_no, description, qty, unit_price_cad`. Optional (the tagger fills them if missing): `material, process_tags` (`;`-separated), `envelope_mm` (`LxWxH`), `tolerance_class, required_certs` (`;`-separated), `controlled` (`true/false`), `ccv_pct, hours_week`.

Uploading replaces any previous jobs for the program and clears routing and funding.
```json
{ "program_id": "northgate", "count": 40,
  "tagger": { "llm": 0, "cache": 40, "rules": 0 },
  "jobs": [ /* Job × 40, status "unrouted" */ ] }
```

### `POST /programs/{id}/route`
Runs rules → scoring → assignment. Returns 400 if no parts are uploaded.
```json
{
  "program_id": "northgate", "solver": "ortools", "elapsed_ms": 140,
  "stats": { "jobs": 40, "assigned": 36, "blocked": 4,
             "assigned_value_cad": 34900000.0, "sme_share_pct": 0.87 },
  "assignments": [ /* Assignment × 36 */ ],
  "blocked": [ /* BlockedJob × 4 */ ]
}
```
`solver` is `ortools` or `greedy` (fallback). `sme_share_pct` = the assigned value going to SMEs ÷ assigned value.

### `GET /programs/{id}/assignments`
```json
{ "program_id": "northgate", "assignments": [ /* Assignment[] */ ] }
```

### `GET /programs/{id}/ledger`
```json
{
  "program_id": "northgate",
  "rules_version": "demo-2026-09-26", "rules_label": "Simplified ITB rules for demo",
  "obligation_cad": 500000000.0,
  "credit_total_cad": 61200000.0,
  "obligation_met_pct": 0.1224,
  "direct_credit_cad": 61200000.0,
  "indirect_credit_cad": 0.0,
  "smb": { "target_pct": 0.15, "target_cad": 75000000.0,
           "achieved_cad": 29700000.0, "progress_pct": 0.396,
           "basis": "CCV of SME work before multipliers (assumption)" },
  "multiplier_breakdown": [
    { "category": "regular", "label": "Regular work", "multiplier": 1, "count": 4, "value_cad": 3500000.0, "credit_cad": 3000000.0 },
    { "category": "sme_direct", "label": "SME direct work", "multiplier": 2, "count": 32, "value_cad": 31400000.0, "credit_cad": 58200000.0 },
    { "category": "training", "label": "Skills and training", "multiplier": 5, "count": 0, "value_cad": 0.0, "credit_cad": 0.0 },
    { "category": "indigenous_training", "label": "Indigenous workforce development", "multiplier": 10, "count": 0, "value_cad": 0.0, "credit_cad": 0.0 }
  ],
  "transactions": [ /* CreditTxn[] */ ],
  "flags": ["simplified-demo"]
}
```
Invariants (checked by demo-check):
- `credit_total_cad` = Σ `transactions[].credit_cad` = `direct_credit_cad + indirect_credit_cad` (±$0.01)
- `obligation_met_pct` = `credit_total_cad / obligation_cad`
- `smb.progress_pct` = `smb.achieved_cad / smb.target_cad`
- `multiplier_breakdown` always lists all 4 categories, even when a category is zero

### `GET /programs/{id}/gaps`
```json
{
  "program_id": "northgate",
  "summary": { "blocked_jobs": 4, "blocked_value_cad": 6600000.0,
               "top_reason": "CWB W47.1 welding capacity" },
  "blocked": [ /* BlockedJob[] (every one has ≥ 1 suggestion_id) */ ],
  "suggestions": [ /* TrainingPackage[] */ ]
}
```

### `POST /programs/{id}/training/{package_id}/fund`
Simulates funding: adds a `pending_training` certification (`cert_unlock`) and/or capacity (`capacity_unlock`) to the package's shop, records the training `CreditTxn`, and re-runs routing. Returns 404 for an unknown package and 409 if it is already funded.
```json
{
  "program_id": "northgate", "package_id": "TP-01",
  "package": { /* TrainingPackage, status "funded" */ },
  "before": { /* Snapshot */ },
  "after":  { /* Snapshot */ },
  "unblocked_jobs": [ /* Assignment[] for jobs that were blocked and are now assigned */ ],
  "still_blocked": ["NG-034"],
  "training_txn": { /* CreditTxn, origin "training" */ },
  "credit_added": 8110000.0,
  "credit_added_breakdown": { "training_cad": 480000.0, "jobs_cad": 7630000.0 },
  "headline": "$96K training → $480K credit (5x) + 3 jobs unblocked (+$7.6M credit)"
}
```
`credit_added` = `after.credit_total_cad − before.credit_total_cad` = `training_cad + jobs_cad`.

### `GET /shops`
Query `?source=public|synthetic` (optional).
```json
{ "shops": [ /* Shop[] with cert_summary */ ] }
```

### `GET /shops/{id}`
The shop-side view (H3.5): what this shop is offered, what it is missing, and what training is under way.
```json
{
  "shop": { /* Shop */ },
  "certifications": [ /* Certification[] (one per cert_type) */ ],
  "offers": [
    { "job_id": "NG-021", "part_no": "NG-STW-2210", "description": "Stowage rack, welded steel",
      "program_id": "northgate", "prime_name": "Northgate Land Systems",
      "value_cad": 640000.0, "hours_week": 16, "multiplier": 2, "credit_cad": 1088000.0,
      "reasons": ["Welding + sheet metal", "SME: 2x direct credit", "97 km from site"],
      "status": "offered" }
  ],
  "readiness": [
    { "kind": "cert", "requirement": "CWB_W47.1",
      "jobs_unlocked": ["NG-031", "NG-032", "NG-033"], "value_cad": 5100000.0,
      "message": "Get CWB W47.1 → qualify for 3 more jobs worth $5.1M" }
  ],
  "training": [
    { "package_id": "TP-01", "status": "suggested", "category": "personal_certification",
      "trainees": 4, "recipient_example": "Conestoga College (example, not affiliated)",
      "cert_unlock": "CWB_W47.1", "capacity_unlock": { "welding": 80 },
      "message": "Suggested: certify 4 welders to CWB W47.1" }
  ]
}
```
- `readiness` lists jobs this shop fails on **exactly one** requirement, grouped by that requirement (`kind`: `cert | capacity | process`).
- After funding, the unblocked jobs appear in `offers`, the matching readiness item disappears, and the training entry reads e.g. `"status": "funded"`, `"message": "4 welders in training for CWB W47.1"`.
- Before routing, `offers` is `[]`.

---

## 4. Fixtures (`/data/fixtures`)

Generated by `scripts/build_fixtures.py` (`make fixtures`) and checked by `make fixtures-check`. `index.json` maps each endpoint to its file. The demo flow is reset → upload → route → fund TP-01; the `*_after_fund` files are the state after funding TP-01.

| File | Endpoint / state |
| --- | --- |
| `index.json` | manifest: `{ "<METHOD> <path>": "<file>" }` plus `demo_shop_id` and `demo_package_id` |
| `health.json` | `GET /health` |
| `demo_reset.json` | `POST /demo/reset` |
| `program.json` / `program_after_fund.json` | `GET /programs/northgate` (routed / after TP-01) |
| `parts_upload.json` | `POST /programs/northgate/parts` |
| `route.json` | `POST /programs/northgate/route` |
| `assignments.json` / `assignments_after_fund.json` | `GET /programs/northgate/assignments` |
| `ledger.json` / `ledger_after_fund.json` | `GET /programs/northgate/ledger` |
| `gaps.json` / `gaps_after_fund.json` | `GET /programs/northgate/gaps` |
| `fund_TP-01.json` | `POST /programs/northgate/training/TP-01/fund` (from the routed state) |
| `fund_TP-02.json` | `POST .../training/TP-02/fund` (assumes TP-01 was funded first) |
| `shops.json` | `GET /shops` |
| `shop_<demo_shop_id>.json` / `shop_<demo_shop_id>_after_fund.json` | `GET /shops/{demo_shop_id}` (TP-01's shop) |

## 5. Scenario targets (the demo numbers)

- Program: Northgate Land Systems (fictional), $500M contract = $500M obligation, SMB target 15% ($75M), site in London ON.
- 40 jobs with fleet-lifetime quantities; work package ≈ **$40M**; 5 controlled jobs (all assigned to CGP shops).
- Routed: **36 assigned, 4 blocked**. All 4 blocked jobs are CWB-welded: TP-01 (certify welders at a shop that has welding but no CWB W47.1; unblocks 3; 5x) and TP-02 (apprentice sponsorship through an Indigenous-governed training institution at a CWB shop that is at capacity; unblocks 1; 10x, flagged assumption).
- Before funding, the obligation meter reads roughly 11–14%. Funding TP-01 visibly moves it and the SMB meter.
- 30 synthetic shops across Kitchener, Waterloo, Cambridge, Woolwich, London and Hamilton; a few are non-SME (1x) so the multiplier chart shows both bars.
