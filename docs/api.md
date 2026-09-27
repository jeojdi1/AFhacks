# Muster API contract (v0.1; §6 additive v0.2)

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
`tag_warning` (optional string) appears only when the tagger could not recognise a process and fell back to a default. `unit_price_cad` is kept as given (sub-cent prices allowed); `est_value_cad` is rounded to cents. `qty` is the **fleet-lifetime quantity** (all vehicles plus spares over the program). `est_value_cad = qty × unit_price_cad`. `hours_week` is the weekly shop load during production and is what counts against `capacity_hours_week`. `tag_source` is `llm | cache | rules`. `status` is `unrouted | assigned | blocked`.

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
`eligible_shop_count` counts shops that pass every filter **except** capacity. `suggestion_ids` may be empty when no trainable near-miss shop exists (or its only package is already funded); the web must handle `[]`. `failing_filters` counts shops failing each filter (a shop can fail more than one).

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

### `GET /programs/{id}/jobs`
Every uploaded job with its **current** `status` (`unrouted` before routing, then `assigned` / `blocked`; funding updates it). The web uses it to rebuild the jobs table after a reload. Before any upload, `jobs` is `[]`. *(Additive contract change.)*
```json
{ "program_id": "northgate", "jobs": [ /* Job[] */ ] }
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
| `index.json` | manifest: `{ "program_id", "demo_shop_id", "demo_package_id", "endpoints": { "<METHOD> <path>": "<file>" }, "after_fund": { "<METHOD> <path>": "<file>" } }`. `endpoints` maps every endpoint to its routed-state file (both fund calls included); `after_fund` maps program, assignments, jobs, ledger, gaps and `GET /shops/<demo_shop_id>` to their `*_after_fund` files |
| `health.json` | `GET /health` |
| `demo_reset.json` | `POST /demo/reset` |
| `program.json` / `program_after_fund.json` | `GET /programs/northgate` (routed / after TP-01) |
| `parts_upload.json` | `POST /programs/northgate/parts` |
| `route.json` | `POST /programs/northgate/route` |
| `assignments.json` / `assignments_after_fund.json` | `GET /programs/northgate/assignments` |
| `jobs.json` / `jobs_after_fund.json` | `GET /programs/northgate/jobs` (routed / after TP-01) |
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

---

## 6. Shop actions and events (additive, v0.2)

What a shop tells Muster from the phone app (docs/app-spec.md §2.3–§2.8), and the activity log the prime's feed and desktop bell poll. Logic: `engine/shopside.py`; routes: `engine/app.py`; tests: `engine/tests/test_shopside.py`; examples: `data/fixtures/app/` (below).

**Additive only.** No existing response shape or value changes, with one documented effect: the decision endpoint sets `assignment.status` (`offered | accepted | declined`, already in §1), so `GET /programs/{id}/assignments` and `GET /shops/{id}` `offers[].status` show the shop's answer. Decisions **never** change routing, jobs, packages or the ledger: a declined job still counts as routed ("Declined · counted as routed until re-routed (demo)"; re-routing is a later stretch). Capacity check-ins and declared expiries are stored only; they never change `capacity_hours_week`, `certifications` or routing.

**Conventions**
- Timestamps are UTC, `YYYY-MM-DDTHH:MM:SSZ`.
- Every POST accepts an optional `idempotency_key` (string ≤ 128; the web sends `crypto.randomUUID()`). Re-sending the same key with the same request returns the stored response byte-for-byte, emits no event and writes nothing. The same key with a *different* request is **409** `{"detail":"idempotency_key '…' was already used for a different request"}`.
- Every mutation is a new State revision, so every cached read (including the ones below) is invalidated at once.
- Errors are `{"detail": "..."}`: 400 bad input or "Route the program first", 404 unknown shop / job / package / seat, 409 conflicts. Unknown JSON fields are ignored.
- The shop endpoints act on the demo program (`northgate`), like `GET /shops/{id}`.

**Lifecycle**
| Event | Effect |
| --- | --- |
| `POST /demo/reset` | everything below is empty (a fresh State; event `seq` restarts at 1) |
| `POST /programs/{id}/parts` | clears decisions, funding requests, events and idempotency records; **keeps** capacity check-ins and declared expiries (they belong to the shop). `seq` keeps counting |
| `POST /programs/{id}/route` | clears decisions and funding requests (and their idempotency records), then appends a `routed` event (that is `routed_at`) |
| `POST /programs/{id}/training/{pkg}/fund` | appends a `package_funded` event; decisions and requests are kept (fund never moves existing assignments) |

### Event
```json
{ "seq": 4, "ts": "2026-09-26T21:42:30Z", "kind": "offer_declined",
  "shop_id": "syn-012", "shop_name": "Tallowfield Fabricating Ltd.",
  "job_id": "NG-022", "package_id": null,
  "value_cad": 777600.0, "credit_cad": 1415232.0,
  "message": "Tallowfield Fabricating Ltd. declined NG-022: no capacity",
  "payload": { "reason_code": "capacity" } }
```
| `kind` | Emitted by | `value_cad` / `credit_cad` | `payload` |
| --- | --- | --- | --- |
| `routed` | `POST /route` | assigned value / Σ assignment credit | `assigned, blocked, shops, solver` |
| `offer_accepted` | decision | the assignment's value / credit | `previous?`, `note?` |
| `offer_declined` | decision | the assignment's value / credit | `reason_code`, `note?`, `previous?` |
| `offer_question` | decision | the assignment's value / credit | `question_code`, `note?`, `previous?` |
| `offer_undo` | decision `undo` | the assignment's value / credit | `previous` (the withdrawn decision) |
| `funding_requested` | funding request | package `unblocks_value_cad` / `est_credit_cad` | `requirement, est_cost_cad, multiplier, trainees, blocked_job_ids` |
| `package_funded` | `POST /fund` | Σ value of unblocked jobs / fund `credit_added` | `headline, requirement, trainees, unblocked_job_ids, still_blocked, training_credit_cad` |
| `capacity_confirmed` | capacity check-in | `null` / `null` | `hours_week, horizon_weeks, accepted_load_hours, offered_load_hours, over_by_hours` |
| `cert_declared` | expiry declaration | `null` / `null` | `cert_type, expires_at` |

`shop_id`/`shop_name` are `null` for `routed`. `message` is a ready-to-show English sentence; the web may build its own copy from the fields.

### `POST /shops/{shop_id}/offers/{job_id}/decision`
```json
// request
{ "decision": "declined",              // accepted | declined | question | undo
  "reason_code": "capacity",           // declined only: capacity | price | tooling | schedule | not_our_process | other
  "question_code": null,               // question only: lead_time | material_supply | first_article | quantity_split
  "note": null,                        // optional, ≤ 280 chars (not stored for undo)
  "idempotency_key": "6f1c…" }
// 200
{ "decision": { "shop_id": "syn-012", "job_id": "NG-022", "decision": "declined",
                "reason_code": "capacity", "question_code": null, "note": null,
                "at": "2026-09-26T21:42:30Z", "idempotency_key": "6f1c…" },
  "assignment_status": "declined",
  "event": { /* Event, kind offer_declined */ } }
```
- Effects: `accepted` / `declined` set the assignment's `status`; `question` sets it to `offered`; `undo` sets it to `offered` and deletes the shop's decision (the response's `decision` is the undo record, `decision: "undo"`). One decision per shop and job: a new one replaces the old (the event's `payload.previous` names it).
- A code that does not apply to the decision (e.g. `reason_code` on `accepted`) is dropped, stored as `null`.
- Sending the **same** decision again under a new key returns it with `"event": null` (nothing new for the prime).
- Errors: 404 `Unknown shop 'syn-999'`; 400 `Route the program first`; 400 `decision must be one of: …`; 400 `reason_code is required when declining`; 400 `question_code is required when asking a question`; 400 `Unknown reason_code '…'` / `Unknown question_code '…'`; 400 `note must be at most 280 characters`; 404 `Job 'NG-099' is not offered to shop 'syn-012'` (also for a job assigned to another shop); 409 `No decision to undo for job 'NG-021' at shop 'syn-012'`.

### `POST /shops/{shop_id}/funding-requests`
"Ask Northgate to fund this" for the suggested training package at this shop whose `gap.requirement` matches.
```json
// request
{ "requirement": "CWB_W47.1", "idempotency_key": "…" }
// 200
{ "request": { "package_id": "TP-01", "shop_id": "syn-012", "requirement": "CWB_W47.1",
               "status": "requested", "at": "2026-09-26T21:44:00Z", "idempotency_key": "…" },
  "event": { "seq": 5, "kind": "funding_requested", "package_id": "TP-01",
             "value_cad": 5068000.0, "credit_cad": 480000.0,
             "message": "Tallowfield Fabricating Ltd. asked Northgate to fund CWB W47.1 (TP-01) · $96K → $480K credit",
             "payload": { "requirement": "CWB_W47.1", "est_cost_cad": 96000.0, "multiplier": 5, "trainees": 4,
                          "blocked_job_ids": ["NG-031", "NG-032", "NG-033"] }, "…": "…" } }
```
- A repeat request (new key) returns the existing request with `"event": null` (200).
- In the `actions` reads, `status` is derived: `"funded"` once the package is funded, else `"requested"`.
- Errors: 404 unknown shop; 400 `Route the program first`; 400 `requirement is required (e.g. "CWB_W47.1")`; 404 `No training package for CWB_W47.1 at shop 'syn-012'`; 409 `Training package 'TP-01' is already funded`.

### `POST /shops/{shop_id}/capacity`
Weekly check-in: free hours per week for the next 4 / 8 / 12 weeks. Works before routing too (loads are then 0).
```json
// request
{ "hours_week": 40, "by_process": { "welding": 40, "sheet_metal": 0, "painting": 0 },
  "horizon_weeks": 4, "idempotency_key": "…" }
// 200
{ "capacity": { "shop_id": "syn-012", "hours_week": 40,
                "by_process": { "welding": 40, "sheet_metal": 0, "painting": 0 },
                "horizon_weeks": 4, "confirmed_at": "2026-09-26T21:47:15Z", "used_in_routing": false },
  "accepted_load_hours": 22, "offered_load_hours": 46, "over_by_hours": 0,
  "event": { /* Event, kind capacity_confirmed:
             "Tallowfield Fabricating Ltd.: 40 h/wk free · accepted 22 h/wk" (+ " · over by 6 h" when over) */ } }
```
- `hours_week` is as given, or the sum of `by_process` when omitted (one of them is required). `by_process` is stored as given (zeros kept) or `null`. `horizon_weeks` defaults to 4.
- `accepted_load_hours` = Σ `hours_week` of this shop's assignments with status `accepted`; `offered_load_hours` = Σ over all its assignments; `over_by_hours` = max(0, accepted − `hours_week`).
- `used_in_routing` is always `false` tonight: routing still uses `capacity_hours_week`.
- Errors: 404 unknown shop; 400 `hours_week must be between 0 and 2000` (also for each `by_process` value and their sum); 400 `Unknown process_tag '…' in by_process`; 400 `horizon_weeks must be 4, 8 or 12`; 400 `Send hours_week or by_process`.

### `POST /shops/{shop_id}/certifications/{cert_type}`
A shop-declared expiry date. `cert_type` is the §1 enum (`NADCAP:HEAT_TREAT` and `CWB_W47.1` work as path segments).
```json
// request
{ "expires_at": "2027-04-30", "cert_number": null, "idempotency_key": "…" }
// 200
{ "declaration": { "shop_id": "syn-012", "type": "CPCSC_L1", "expires_at": "2027-04-30",
                   "cert_number": null, "status": "declared", "declared_at": "2026-09-26T21:50:00Z",
                   "note": "Shop-declared; not used for routing until reviewed" },
  "event": { /* Event, kind cert_declared */ } }
```
- Stored in the declarations only; it **does not** change `GET /shops/{id}` `certifications` or routing. A new declaration for the same type replaces the old one. Past (lapsed) dates are allowed.
- Errors: 404 unknown shop; 400 `Unknown cert_type '…'`; 400 `expires_at must be a date as YYYY-MM-DD`; 400 `expires_at '…' is not a valid date`; 400 `expires_at is more than 10 years from today`; 400 `expires_at is before 2000-01-01`; 400 `cert_number must be at most 40 characters`.

### `GET /shops/{shop_id}/actions`
Everything this shop has told Muster (cached per revision).
```json
{ "shop_id": "syn-012",
  "routed_at": "2026-09-26T21:30:00Z",
  "decisions": [ { "shop_id": "syn-012", "job_id": "NG-021", "decision": "accepted", "reason_code": null,
                   "question_code": null, "note": null, "at": "2026-09-26T21:41:07Z", "idempotency_key": "…" } ],
  "funding_requests": [ { "package_id": "TP-01", "shop_id": "syn-012", "requirement": "CWB_W47.1",
                          "status": "funded", "at": "2026-09-26T21:44:00Z", "idempotency_key": "…" } ],
  "capacity": { "shop_id": "syn-012", "hours_week": 40, "by_process": { "welding": 40, "sheet_metal": 0, "painting": 0 },
                "horizon_weeks": 4, "confirmed_at": "2026-09-26T21:47:15Z", "used_in_routing": false },
  "declared_certs": [ { "shop_id": "syn-012", "type": "CPCSC_L1", "expires_at": "2027-04-30", "cert_number": null,
                        "status": "declared", "declared_at": "2026-09-26T21:50:00Z",
                        "note": "Shop-declared; not used for routing until reviewed" } ] }
```
`routed_at` is the latest `routed` event's `ts` (`null` before routing). `capacity` is `null` until the first check-in. Lists are oldest first (a replaced decision moves to the end). 404 `Unknown shop '…'`.

### `GET /programs/{program_id}/actions`
The same lists across every shop, for the prime feed and the Gaps "Shop requested" badge: `{ "program_id", "routed_at", "decisions": [], "funding_requests": [], "capacity": [ /* CapacityCheckin[] */ ], "declared_certs": [] }` (no `shop_id` key; `capacity` is a list). 404 `Unknown program '…'`.

### `GET /programs/{program_id}/events?since=0&limit=100`
Events with `seq > since`, oldest first, at most `limit` (1–500, default 100). Cached per revision under `("events", since, limit)`.
```json
{ "program_id": "northgate", "last_seq": 8, "has_more": false,
  "events": [ { "seq": 8, "ts": "2026-09-26T21:52:40Z", "kind": "package_funded",
                "shop_id": "syn-012", "shop_name": "Tallowfield Fabricating Ltd.",
                "job_id": null, "package_id": "TP-01",
                "value_cad": 5068000.0, "credit_cad": 9602400.0,
                "message": "Northgate Land Systems funded TP-01 at Tallowfield Fabricating Ltd.: $96K training → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)",
                "payload": { "headline": "…", "requirement": "CWB_W47.1", "trainees": 4,
                             "unblocked_job_ids": ["NG-031", "NG-032", "NG-033"],
                             "still_blocked": ["NG-034"], "training_credit_cad": 480000.0 } } ] }
```
- Polling: call with `since` = the `seq` of the last event you have. If `has_more`, call again at once.
- `last_seq` is the newest `seq` in the log (0 when empty). **If `last_seq < since`, the log was reset: drop local events and re-read from `since=0`.** An upload clears the log but keeps counting, so a poller never mistakes new events for old ones.
- Errors: 404 unknown program; 400 for `since < 0` or `limit` outside 1–500.

### `GET /programs/{program_id}/training/{package_id}/seats/{seat}`
A pseudonymous trainee seat card (T8). There are no personal fields anywhere: a seat is "Seat 3 of 4 · TP-01".
```json
{ "program_id": "northgate", "package_id": "TP-01", "seat": 3, "seats": 4, "label": "Seat 3 of 4 · TP-01",
  "shop_id": "syn-012", "shop_name": "Tallowfield Fabricating Ltd.", "shop_source": "synthetic", "shop_label": "Synthetic",
  "package_status": "funded", "funding_requested_at": "2026-09-26T21:44:00Z", "funded_at": "2026-09-26T21:52:40Z",
  "stage": "enrolled",
  "stages": ["nominated", "eligibility_attested", "enrolled", "started", "test_booked", "passed", "ticket_issued"],
  "stage_flag": "assumption",
  "category": "personal_certification", "recipient_example": "Conestoga College (example, not affiliated)",
  "cert_unlock": "CWB_W47.1", "capacity_unlock": { "welding": 80 },
  "jobs_unlocked": ["NG-031", "NG-032", "NG-033"], "jobs_unlocked_value_cad": 5068000.0,
  "jobs_now_assigned": ["NG-031", "NG-032", "NG-033"],
  "example_test_date": "2026-11-07", "example_test_date_flag": "assumption",
  "eligibility_note": "Personal certification counts only for Canadian citizens or permanent residents (ITB model terms §7.5.1).",
  "flags": ["assumption"] }
```
- Before funding: `stage: "not_funded"`, `funded_at` and `example_test_date` are `null`; `funding_requested_at` is set once the shop has asked. After funding the demo stage is `enrolled` (assumption), and the example test date is funding date + 6 weeks (assumption).
- `jobs_now_assigned` = the package's `blocked_job_ids` now assigned to this shop.
- Errors: 404 `Unknown training package 'TP-77'` (also before routing); 404 `Seat 5 does not exist on TP-01 (4 seats)`; 400 for a non-integer seat.

### CORS
`allow_origin_regex` also covers private LAN hosts on any port (`192.168.*`, `10.*`, `172.16–31.*`), so a real phone on the same network can reach the engine during a demo. Never `*`.

### Example fixtures (`data/fixtures/app/`)
Generated by `scripts/build_app_fixtures.py` (the real engine in-process on a temporary `MUSTER_DB`, a fixed clock, fixed idempotency keys; re-running is byte-identical; `--check` verifies). Flow: reset → upload → route → question NG-021 (lead time) → accept NG-021 → decline NG-022 (capacity) → request funding CWB_W47.1 → capacity check-in → declare the CPCSC L1 expiry → fund TP-01 → reads. The web's fixture mode does **not** read these; they are contract examples and test goldens (`test_app_fixtures_are_current`). `data/fixtures/index.json` is unchanged.

| File | Endpoint / state |
| --- | --- |
| `index.json` | manifest `{ program_id, demo_shop_id, demo_package_id, generated_by, flow, note, endpoints: { "<METHOD> <path>": "<file>" } }` |
| `decision_question_NG-021.json` | `POST /shops/syn-012/offers/NG-021/decision` (question, lead time) |
| `decision_accept_NG-021.json` | `POST /shops/syn-012/offers/NG-021/decision` (accepted) |
| `decision_decline_NG-022.json` | `POST /shops/syn-012/offers/NG-022/decision` (declined, capacity) |
| `funding_request_TP-01.json` | `POST /shops/syn-012/funding-requests` (CWB_W47.1) |
| `capacity_syn-012.json` | `POST /shops/syn-012/capacity` |
| `cert_declare_syn-012_CPCSC_L1.json` | `POST /shops/syn-012/certifications/CPCSC_L1` |
| `trainee_seat_TP-01_3.json` | `GET /programs/northgate/training/TP-01/seats/3` (after funding) |
| `shop_actions_syn-012.json` | `GET /shops/syn-012/actions` (after funding) |
| `program_actions.json` | `GET /programs/northgate/actions` (after funding) |
| `events.json` | `GET /programs/northgate/events?since=0&limit=100` (after funding; 8 events) |

### Data change (the only change to existing data)
`scripts/build_fixtures.py` moves one illustrative date: `syn-001` (Tessellate Precision Machining) **CGP `expires_at` = `2027-01-15`**, note "Synthetic shop: self-declared (illustrative date, inside the CGP renewal window for the demo)". Only `data/processed/shops_synthetic.json` changes (so live `GET /shops/syn-001` shows it); every file in `data/fixtures/` is byte-identical, since expiry is not a routing filter and `shops.json` carries only `cert_summary`.
