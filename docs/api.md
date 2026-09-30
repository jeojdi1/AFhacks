# Shieldworks API contract (v0.1; §6 additive v0.2; §7 v0.3; §8 v0.4; §6.1 v0.5; §6.2 + `expired` v0.6)

Owner: Lane B (shared). Source of truth for field names. Any change is a `CONTRACT:` commit that also updates `/data/fixtures` (CLAUDE.md §2).

- Base URL: `http://localhost:8000` (`API_URL` / `NEXT_PUBLIC_API_URL`). Through the web server the same API is also served same-origin at `/engine/*` (Next.js rewrite to `MUSTER_ENGINE_URL`, default `http://127.0.0.1:8000`), which is how a phone on the same Wi-Fi reaches it (`make demo` builds with `NEXT_PUBLIC_API_URL=/engine`).
- Demo program id: **`northgate`** (Northgate Land Systems, fictional prime)
- All bodies are JSON unless noted. Errors: `{"detail": "<readable message>"}` with 400 / 404 / 409 / 501.
- **Money** is CAD dollars as numbers, rounded to cents.
- **Every `*_pct` field is a fraction in [0, 1]** (`0.15` = 15%). The web formats it.
- Every credit number is computed as `value_cad × ccv_pct × multiplier` (CLAUDE.md §3.5).
- **Examples** in §3, §6, §7 and §8 come from real calls to the engine (`MUSTER_DB` on a scratch file, reset → upload → route → fund TP-01, and seed → tick → shop actions → fund; re-checked against a live engine with Neo4j loaded on 2026-09-27: all 29 routes called, the §6 / §7 / §8 examples compared field by field); timestamps, `seq`, `elapsed_ms` and lists are trimmed. The consistent, checked numbers live in `/data/fixtures`.

### Endpoint index

Every live route: **29** (26 in `engine/app.py`, 3 in the `engine/simulate.py` router; search and graph logic in `engine/search.py` / `engine/graphdb.py`). `{id}` is the program id (`northgate`). FastAPI's own `/docs` and `/openapi.json` are also served.

| Method and path | Section | Writes state |
| --- | --- | --- |
| `GET /health` | §3 | no |
| `POST /demo/reset` | §3 | yes |
| `POST /demo/seed?scenario=populated\|empty` | §8 | yes |
| `POST /demo/simulate/tick` | §8 | yes |
| `GET /demo/simulate/status` | §8 | no |
| `GET /programs/{id}` | §3 | no |
| `POST /programs/{id}/parts` | §3 | yes |
| `POST /programs/{id}/route?solver=auto\|ortools\|greedy` | §3 | yes |
| `GET /programs/{id}/assignments` | §3 | no |
| `GET /programs/{id}/jobs` | §3 | no |
| `GET /programs/{id}/ledger` | §3 | no |
| `GET /programs/{id}/gaps` | §3 | no |
| `POST /programs/{id}/training/{package_id}/fund` | §3 | yes |
| `POST /programs/{id}/jobs/{job_id}/reoffer` | §6 | yes |
| `GET /programs/{id}/actions` | §6 | no |
| `GET /programs/{id}/events?since=&limit=` | §6 | no |
| `GET /programs/{id}/training/{package_id}/seats/{seat}` | §6 | no |
| `GET /shops?source=public\|synthetic` | §3 | no |
| `GET /shops/{shop_id}` | §3 | no |
| `POST /shops/{shop_id}/offers/{job_id}/decision` | §6 | yes |
| `POST /shops/{shop_id}/offers/{job_id}/reply` | §6 | yes |
| `POST /shops/{shop_id}/funding-requests` | §6 | yes |
| `POST /shops/{shop_id}/capacity` | §6 | yes |
| `POST /shops/{shop_id}/certifications/{cert_type}` | §6 | yes |
| `GET /shops/{shop_id}/actions` | §6 | no |
| `GET /shops/{shop_id}/offers/{job_id}/award` | §6.1 | no |
| `POST /shops/{shop_id}/offers/{job_id}/award/documents/{key}` | §6.1 | yes |
| `POST /shops/{shop_id}/offers/{job_id}/award/call` | §6.1 | yes |
| `GET /shops/{shop_id}/vault` | §6.2 | no |
| `POST /shops/{shop_id}/vault/{key}` | §6.2 | yes |
| `GET /search/shops` | §7 | no |
| `GET /search/jobs?shop_id=` | §7 | no |
| `GET /graph/summary` | §7 | no |
| `GET /graph/ego?id=&depth=&limit=` | §7 | no |

### Quickstart (curl)

```bash
E=http://localhost:8000
curl -s -X POST "$E/demo/seed?scenario=populated"          # reset + upload + route + an hour of simulated shop activity
curl -s "$E/programs/northgate/ledger"                        # 11.5% of the $500M obligation
curl -s -X POST "$E/demo/simulate/tick"                       # one more scripted shop event
curl -s "$E/programs/northgate/events?since=0&limit=20"       # what the laptop bell and the prime's phone poll
curl -s -X POST -H 'Content-Type: application/json' \
     -d '{"decision":"accepted"}' "$E/shops/syn-012/offers/NG-021/decision"
curl -s -X POST "$E/programs/northgate/training/TP-01/fund"   # "$96K training → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)"
curl -s "$E/search/shops?process=welding&cert=CWB_W47.1&near=London"   # 13 shops after funding (2 synthetic, 11 public)
curl -s "$E/graph/summary"                                     # 4,490 nodes, 5,808 edges
```

Without the seed, the classic path is `POST /demo/reset` → `POST /programs/northgate/parts?use_demo=true` → `POST /programs/northgate/route` (the 8 steps `make demo-check` walks).

---

## 1. Vocabularies (enums)

| Name | Values |
| --- | --- |
| `process_tag` | `cnc_milling`, `five_axis_milling`, `cnc_turning`, `sheet_metal`, `welding`, `heat_treat`, `anodizing`, `plating`, `painting`, `wire_harness`, `electronics_assembly`, `fasteners` |
| `material` | `steel`, `armour_steel`, `stainless`, `aluminum`, `titanium`, `copper`, `polymer` |
| `tolerance_class` | `standard` < `precision` < `ultra` (a shop's value is the best it can hold; used in the fit score, not as a hard filter) |
| `cert_type` | `CGP`, `CPCSC_L1`, `ISO9001`, `AS9100`, `NADCAP:HEAT_TREAT`, `NADCAP:CHEM_PROCESSING`, `NADCAP:COATINGS`, `CWB_W47.1` |
| `cert_status` | `verified`, `declared`, `unknown`, `pending_training`, `expired` (v0.6) |
| `filter` (rejection reason codes) | `process`, `envelope`, `certs`, `controlled_cgp`, `cpcsc`, `capacity` |
| `credit_category` | `regular` (1x), `sme_direct` (2x), `training` (5x), `indigenous_training` (10x) |
| `training_category` | `apprentice_sponsorship`, `personal_certification`, `skills_program_contribution`, `education_costs` |
| `recipient_type` | `college`, `apprenticeship_sponsor`, `nonprofit`, `indigenous_institution` |
| `shop.source` | `public`, `synthetic` |
| `assignment.status` | `offered`, `accepted`, `declined` |
| `package.status` | `suggested`, `funded` |
| `program.state` | `empty` (after reset), `uploaded`, `routed`, `funded` |

A certification **counts** for the rules if its status is `verified`, `declared` or `pending_training`. `pending_training` is only ever created by funding a training package. A job **requires CPCSC** if `"CPCSC_L1"` is in its `required_certs`. A `controlled: true` job may only go to a shop whose `CGP` certification counts.

*(Additive, v0.6.)* **`expired`** means the shop held the certification and it lapsed (`expires_at` is the date it ran out). Like `unknown` it **never counts** (the counting list above is unchanged), so a controlled job cannot go to a shop whose CGP registration lapsed. Where it shows: rule reasons read "lapsed" (`"CGP status is lapsed"`, `"… (status lapsed)"`); `GET /shops/{id}` readiness lists it as a **renewal** (§3); the graph has no `HOLDS_CERT` edge for it and `/search/shops` result chips leave it out (like `unknown`); `/search/jobs` near misses read `"Renew Controlled Goods registration (lapsed)"`. Demo data: synthetic shop `syn-028` (Millrace Machine Works) has a CGP registration that lapsed on 2026-08-31. Its CGP was `unknown` before, and neither status counts, so no routing number moves.

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
*(Additive.)* `"onboarding": "onboarded" | "discovered"` (absent means onboarded). Public shops (`pub-XXX`, from `data/processed/shops_public.json`) are `"discovered"`: `GET /shops` lists them **after** the synthetic shops (also `?source=public`) and `GET /shops/pub-XXX` returns their certifications (self-reported, with `source_url`), `provenance`, `notes` and a `notice`, with `offers`, `readiness` and `training` always `[]`. They are **listed but never routed**: never candidates, assignments, gaps, readiness or ledger entries. They carry no contact data (`contact_role_email` is `null`, many capability fields are `null`), and their `cert_summary` items also carry `source_url`, `verified_at` (date the source was read), `expires_at` and `note`. Fixtures: `shops_public.json` (`GET /shops?source=public`) and `shop_pub-001.json`, from `scripts/build_public_fixtures.py`; `shops.json` stays synthetic-only.

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
  "description": "Hull side stowage bin weldment, armour steel plate, press-brake formed sheet metal, structural welding to CWB W47.1",
  "process_tags": ["welding", "sheet_metal"], "required_certs": ["CWB_W47.1"],
  "value_cad": 1656000.0, "hours_week": 40,
  "reason_code": "capacity",
  "reason": "Both CWB W47.1 welding shops are at capacity (18 and 16 h/week free vs 40 needed); 2 other welding shops lack CWB W47.1 (certified-welder shortage)",
  "eligible_shop_count": 2,
  "failing_filters": { "process": 26, "envelope": 9, "certs": 28, "controlled_cgp": 0, "cpcsc": 0, "capacity": 10 },
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
  "title": "Certify 4 welders to CWB W47.1 at Tallowfield Fabricating Ltd. (Woolwich)",
  "blocked_job_ids": ["NG-031", "NG-032", "NG-033"],
  "shop_id": "syn-012", "shop_name": "Tallowfield Fabricating Ltd.", "shop_city": "Woolwich", "shop_source": "synthetic",
  "gap": { "kind": "cert", "requirement": "CWB_W47.1",
           "detail": "Has welding cells and 154 h/week free capacity, but no CWB W47.1 certification" },
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
  "unblocks_value_cad": 5068000.0,
  "eligibility_note": "Personal certification counts only for Canadian citizens or permanent residents (ITB model terms §7.5.1).",
  "flags": ["assumption"],
  "status": "suggested"
}
```
`category` is the primary category; `categories` lists all that apply. `est_credit_cad = est_cost_cad × 1.0 × multiplier`.

### Snapshot (used by fund)
```json
{ "assigned": 36, "blocked": 4,
  "credit_total_cad": 57541497.6, "obligation_met_pct": 0.1150829952,
  "direct_credit_cad": 57541497.6, "indirect_credit_cad": 0.0,
  "smb_achieved_cad": 27322644.8, "smb_progress_pct": 0.36430193066666666 }
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

### `POST /programs/{id}/route?solver=auto`
Runs rules → scoring → assignment. Returns 400 if no parts are uploaded. `solver` is `auto` (default: CP-SAT, greedy if it fails), `ortools` or `greedy`; anything else is 400 `solver must be one of: auto, greedy, ortools`.
```json
{
  "program_id": "northgate", "solver": "ortools", "elapsed_ms": 9,
  "stats": { "jobs": 40, "assigned": 36, "blocked": 4,
             "assigned_value_cad": 36099480.0, "sme_share_pct": 0.900552584136946 },
  "assignments": [ /* Assignment × 36 */ ],
  "blocked": [ /* BlockedJob × 4 */ ]
}
```
The response's `solver` is the one that ran: `ortools` or `greedy` (fallback). `sme_share_pct` = the assigned value going to SMEs ÷ assigned value.

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
  "credit_total_cad": 57541497.6,
  "obligation_met_pct": 0.1150829952,
  "direct_credit_cad": 57541497.6,
  "indirect_credit_cad": 0.0,
  "smb": { "target_pct": 0.15, "target_cad": 75000000.0,
           "achieved_cad": 27322644.8, "progress_pct": 0.36430193066666666,
           "basis": "CCV of SME work before multipliers (assumption)" },
  "multiplier_breakdown": [
    { "category": "regular", "label": "Regular work", "multiplier": 1, "count": 4, "value_cad": 3590000.0, "credit_cad": 2896208.0 },
    { "category": "sme_direct", "label": "SME direct work", "multiplier": 2, "count": 32, "value_cad": 32509480.0, "credit_cad": 54645289.6 },
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
  "summary": { "blocked_jobs": 4, "blocked_value_cad": 6569000.0,
               "top_reason": "CWB W47.1 welder shortage (certification + capacity)" },
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
  "credit_added": 9602400.0,
  "credit_added_breakdown": { "training_cad": 480000.0, "jobs_cad": 9122400.0 },
  "headline": "$96K training → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)"
}
```
Real `before` → `after` for TP-01: `assigned` 36 → 39, `blocked` 4 → 1, `credit_total_cad` 57,541,497.60 → 67,143,897.60, `obligation_met_pct` 0.1151 → 0.1343 (the 11.5% → 13.4% meter), `indirect_credit_cad` 0 → 480,000 (training is indirect), `smb_progress_pct` 0.3643 → 0.4251.
`credit_added` = `after.credit_total_cad − before.credit_total_cad` = `training_cad + jobs_cad`.

### `GET /shops`
Query `?source=public|synthetic` (optional; anything else is 400). Without it: 108 shops, the 30 synthetic ones first, then the 78 public ones (`?source=public` → 78).
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
    { "job_id": "NG-021", "part_no": "NG-STW-2210",
      "description": "Crew stowage rack, mild steel sheet metal, formed and MIG welded, primed and painted (non-structural)",
      "program_id": "northgate", "prime_name": "Northgate Land Systems",
      "value_cad": 921600.0, "hours_week": 22, "multiplier": 2, "credit_cad": 1677312.0,
      "reasons": ["Sheet metal + welding", "88 km from Northgate's London site", "SME: 2x direct credit"],
      "status": "offered" }
  ],
  "readiness": [
    { "kind": "cert", "requirement": "CWB_W47.1",
      "jobs_unlocked": ["NG-031", "NG-032", "NG-033"], "value_cad": 5068000.0,
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
- *(Additive, v0.6.)* A `cert` item whose certification is `expired` at this shop is a **renewal**: `"message": "Renew Controlled Goods registration → qualify for 1 more job worth $1.5M"` plus `"renewal": true` and `"lapsed_on": "2026-08-31"` (the certification's `expires_at`). Renewals come first, then the other items by value. Items that are not renewals have no `renewal` / `lapsed_on` keys (their shape is unchanged). Renewal names: CGP → "Controlled Goods registration" (a lapsed registration means registering again with PSPC's Controlled Goods Program), CPCSC L1 → "CPCSC Level 1 self-assessment", ISO 9001 / AS9100 → "… certificate", CWB W47.1 → "CWB W47.1 certification", Nadcap → "Nadcap … accreditation".
- After funding, the unblocked jobs appear in `offers` (2 → 5), the matching readiness item disappears (the next one is `"Get ISO 9001 → qualify for 2 more jobs worth $1.2M"`), and the training entry reads `"status": "funded"`, `"message": "4 welders in training for CWB W47.1"`.
- Before routing, `offers` is `[]`.
- A declined job Northgate re-offered to this shop (§6 re-offer) is also listed here, with the assignment's value, credit and multiplier, this shop's own three reasons, `status` from this shop's own answer (`offered | accepted | declined`) and `"reoffered_from": "<shop that declined>"`. The shop that declined keeps it in its list as `declined`. Other offers have no `reoffered_from` key.

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

What a shop tells Shieldworks from the phone app (docs/app-spec.md §2.3–§2.8), and the activity log the prime's feed and desktop bell poll. Logic: `engine/shopside.py`; routes: `engine/app.py`; tests: `engine/tests/test_shopside.py`; examples: `data/fixtures/app/` (below).

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
| `offer_reply` | prime's reply to a question | the assignment's value / credit | `reply_code`, `question_code`, `previous_reply_code?` |
| `funding_requested` | funding request | package `unblocks_value_cad` / `est_credit_cad` | `requirement, est_cost_cad, multiplier, trainees, blocked_job_ids` |
| `package_funded` | `POST /fund` | Σ value of unblocked jobs / fund `credit_added` | `headline, requirement, trainees, unblocked_job_ids, still_blocked, training_credit_cad` |
| `capacity_confirmed` | capacity check-in | `null` / `null` | `hours_week, horizon_weeks, accepted_load_hours, offered_load_hours, over_by_hours` |
| `cert_declared` | expiry declaration | `null` / `null` | `cert_type, expires_at` |
| `reoffered` | `POST /programs/{id}/jobs/{job}/reoffer` (`shop_id` = the new shop) | the assignment's value / credit | `from_shop_id, from_shop_name, demo: true` |

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

### `POST /shops/{shop_id}/offers/{job_id}/reply`
The prime (Northgate) answers the shop's open question on a job, so the answer reaches the shop's phone.
```json
{ "reply_code": "yes_date",            // required, ≤ 40 chars (the web's canned-reply id)
  "text": "Yes, November works",       // required, ≤ 280 chars (shown to the shop)
  "idempotency_key": "…" }             // optional
→ 200
{ "decision": { "shop_id": "syn-012", "job_id": "NG-021", "decision": "question", "reason_code": null,
                "question_code": "lead_time", "note": null, "at": "2026-09-26T21:41:07Z", "idempotency_key": "…",
                "reply": { "code": "yes_date", "text": "Yes, November works", "at": "2026-09-26T21:43:10Z" } },
  "event": { "kind": "offer_reply", "shop_id": "syn-012", "job_id": "NG-021",
             "message": "Northgate replied to Tallowfield Fabricating Ltd. on NG-021: \"Yes, November works\"",
             "payload": { "reply_code": "yes_date", "question_code": "lead_time" }, … } }
```
- Stored on the question's decision record as `reply: {code, text, at}`. The `reply` key is **absent** until the prime replies, so every other decision shape is unchanged. `GET /shops/{id}/actions` and `GET /programs/{id}/actions` return it inside `decisions[]`.
- Needs a current `question` decision from that shop on that job. A new decision by the shop (accept / decline / a different question / undo) replaces the record and drops the reply; route, upload, reset and reseed clear it with the decisions. Replying again with a different code or text replaces the reply (`payload.previous_reply_code` names the old one); the same reply again under a new key returns `"event": null`.
- Never changes the assignment status, routing or the ledger.
- Errors: 404 `Unknown shop '…'`; 400 `Route the program first`; 404 `Job 'NG-099' is not offered to shop 'syn-012'`; 400 `reply_code is required` / `text is required` (also for missing fields); 400 `reply_code must be at most 40 characters`; 400 `text must be at most 280 characters`; 409 `No open question from shop 'syn-012' on job 'NG-021'`.

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
- `accepted_load_hours` = Σ `hours_week` of this shop's assignments with status `accepted`; `offered_load_hours` = Σ over all its assignments; `over_by_hours` = max(0, accepted − `hours_week`). The phone asks for hours free for *new* work, so the web does not present `over_by_hours` as overbooking; it compares work accepted after the check-in with `hours_week` instead (see `web/lib/app/fit.ts`). Changing the engine field is a pending contract decision.
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
Everything this shop has told Shieldworks (cached per revision).
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
`routed_at` is the latest `routed` event's `ts` (`null` before routing). `capacity` is `null` until the first check-in. `reoffers` lists declined jobs Northgate re-offered to this shop since the latest routing (same shape as below; `[]` when none). A declined decision whose job was re-offered since carries `"reoffered_to": "<new shop id>"`. Lists are oldest first (a replaced decision moves to the end). 404 `Unknown shop '…'`.

### `GET /programs/{program_id}/actions`
The same lists across every shop, for the prime feed and the Gaps "Shop requested" badge: `{ "program_id", "routed_at", "decisions": [], "funding_requests": [], "capacity": [ /* CapacityCheckin[] */ ], "declared_certs": [], "reoffers": [] }` (no `shop_id` key; `capacity` is a list). 404 `Unknown program '…'`.

### `POST /programs/{program_id}/jobs/{job_id}/reoffer`
Demo re-offer: Northgate sends a job a shop **declined** to another qualified synthetic shop (the supplier card's "Offer NG-005 to …"). Body `{ "shop_id": "syn-001", "idempotency_key"?: "…" }`. The only record is a `reoffered` event: **assignments, credit, the ledger and the obligation % never change** (the credit stays counted as placed). The new shop then sees the job in `GET /shops/{id}` `offers`, `GET /search/jobs` (`status: "offered_to_you"`, `reoffered_from`) and its `actions.reoffers`, and can accept, decline or ask a question through the §6 decision endpoint; the shop that declined gets 409 `… re-offered …` if it tries to answer again. A new route, an upload or a reset clears every re-offer. The simulator never plays a scripted answer on a re-offered job.
```json
// POST /programs/northgate/jobs/NG-022/reoffer  {"shop_id": "syn-026"}  (after syn-012 declined NG-022)
{ "reoffer": { "job_id": "NG-022", "shop_id": "syn-026", "shop_name": "Keelbar Heavy Fabrication Ltd.",
               "from_shop_id": "syn-012", "from_shop_name": "Tallowfield Fabricating Ltd.", "status": "offered",
               "value_cad": 777600.0, "credit_cad": 1415232.0, "at": "2026-09-27T10:31:47Z", "seq": 19 },
  "event": { "seq": 19, "kind": "reoffered", "shop_id": "syn-026", "job_id": "NG-022",
             "value_cad": 777600.0, "credit_cad": 1415232.0,
             "message": "Northgate offered NG-022 to Keelbar Heavy Fabrication Ltd. after Tallowfield Fabricating Ltd. declined it (credit stays counted as placed, demo)",
             "payload": { "from_shop_id": "syn-012", "from_shop_name": "Tallowfield Fabricating Ltd.", "demo": true }, "…": "…" } }
```
(`value_cad` / `credit_cad` are the assignment's.) Errors: 400 `shop_id is required`; 400 when the shop is not synthetic; 404 unknown program, job not placed, or unknown shop; 409 `Job '…' is not declined (… has it: offered)`; 409 `… already declined …` (the holder or any shop that declined it); 409 `… does not pass …'s filters (processes, certificates, size or distance)`; 400 before routing.

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

*(v0.6.)* It also marks one lapsed registration: `syn-028` (Millrace Machine Works) **CGP `status` = `expired`**, `verified_at` 2026-09-01, `expires_at` 2026-08-31. In `data/fixtures/` only `shops.json` changes (that one `cert_summary` status); every routing, ledger, gaps and fund fixture is byte-identical.

### 6.1 Award onboarding after an accept (additive, v0.5)

When a shop presses **Accept**, the phone jumps to a formal award page: the paperwork Northgate (fictional) needs for this job, and a kickoff call with Northgate's supplier development team. Northgate's desktop reads the same award to show progress and the booked call. Logic and routes: `engine/award.py`; tests: `engine/tests/test_award.py`.

**Demo only, numbers never change.** No real e-signature (Sign records only that it was pressed), nothing is uploaded or stored (an `upload` document records only "marked as sent"; Shieldworks never stores drawings or controlled technical data), and no calendar invite is sent. An award never changes assignments, jobs, packages, credit or the ledger. Every response carries `demo_note` and `flags: ["assumption"]`.

**Rules.** 404 unless the job is offered to this shop (unknown shop / job, not routed yet, or the job is another shop's); 409 `Accept the offer first: job '…' is offered|declined for shop '…'` unless the shop's current decision is `accepted`. The document list is built deterministically from the job and the shop; only progress is stored (`State.awards`, keyed `"shop:job"`, tied to the current routing). A new route, an upload or a reset clears it; `/demo/seed` leaves none. Undo then re-accept keeps the progress. Every write is a new revision; a repeat (document already done, same slot) writes nothing and emits no event. The GET is cached per revision and per demo-clock date (the slots move with the date).

#### `GET /shops/{shop_id}/offers/{job_id}/award`
```json
{ "shop_id": "syn-012", "shop_name": "Tallowfield Fabricating Ltd.", "job_id": "NG-021",
  "part_no": "NG-STW-2210", "description": "Crew stowage rack, …", "value_cad": 921600.0, "hours_week": 22,
  "credit_cad": 1677312.0, "controlled": false, "required_certs": [], "accepted_at": "2026-09-27T12:40:03Z",
  "status": "in_progress", "done": 3, "total": 6,
  "documents": [
    { "key": "subcontract", "title": "Subcontract / purchase order (draft)", "kind": "sign",
      "why": "The agreement to make this part for Northgate: quantity, price and payment terms.",
      "detail": "1,440 × NG-STW-2210 at $640.00 each = $921,600 CAD total · Net 30 payment (assumption)",
      "status": "todo", "done_at": null },
    { "key": "quality", "title": "Quality certificates", "kind": "auto", "…": "…", "status": "done", "done_at": "2026-09-27T12:40:03Z" } ],
  "call": { "booked": true, "slot": "2026-09-29T10:00:00-04:00", "booked_at": "2026-09-27T12:41:10Z",
            "slots": ["2026-09-28T10:00:00-04:00", "2026-09-28T14:00:00-04:00", "…", "2026-10-02T14:00:00-04:00"],
            "timezone": "America/Toronto", "duration_min": 30,
            "agenda": ["Scope and quantities", "Delivery schedule", "Quality plan and first article", "ITB reporting (Canadian content)"],
            "with": "Northgate supplier development (fictional)" },
  "next_steps": ["Complete the remaining paperwork (3 of 6 left)", "Kickoff call Tue Sep 29, 10:00 AM (Eastern time, 30 min)",
                 "First article inspection before full production"],
  "demo_note": "Demo paperwork: no real e-signature, nothing is uploaded or stored, and no calendar invite is sent. Northgate Land Systems is fictional.",
  "flags": ["assumption"] }
```
- `status`: `not_started` (no sign/upload document done and no call booked), `in_progress`, `complete` (every document done **and** the call booked). `done` / `total` count documents (the `auto` one counts as done).
- `documents` (in this order; `kind` is `sign | upload | auto`; `status` is `todo | done`):

| `key` | Title | Kind | When | `detail` |
| --- | --- | --- | --- | --- |
| `subcontract` | Subcontract / purchase order (draft) | sign | always | qty × part at unit price = total, "Net 30 payment (assumption)" |
| `nda` | Mutual non-disclosure agreement | sign | always | demo template (assumption) |
| `cgp` | Controlled Goods declaration | sign | `controlled` jobs only | "Technical data moves only through Northgate's secure channel after this check; Shieldworks never stores drawings" |
| `cpcsc` | Cyber-security self-check (CPCSC Level 1) attestation | sign | `CPCSC_L1` in `required_certs` | 13 controls, self-assessed, shop-declared |
| `quality` | Quality certificates | auto (done at accept) | always | the job's required certificates from the shop's profile (plus ISO 9001 when held); CWB W47.1 not yet held → "Welding certification (CWB W47.1): welders in training — qualification expected before first article (assumption)" |
| `fai` | First article inspection plan | upload | always | no file is stored |
| `ccv` | Canadian content declaration (for Northgate's ITB report) | sign | always | "Canadian content 91% of $921,600 = $838,656 CCV (Simplified ITB rules for demo)" |
| `insurance` | Certificate of insurance | upload | always | coverage per Northgate's terms (assumption); no file is stored |

- `call.slots`: the next 5 business days after the demo clock's date (Eastern time), at 10:00 and 14:00, ISO 8601 with offset. `call.agenda` adds "Controlled goods handling" for a controlled job.
- *(Additive, v0.6: paperwork once, §6.2.)* A document whose vault item is on file and not expired (`on_file` or `expiring_soon`) starts **done** without the shop doing anything: `nda` ← master NDA, `ccv` ← CCV declaration template, `insurance` ← certificate of insurance, `quality` ← quality certificate copies (already `auto`; it then also reads reused). Each document gains:
  - `reused` (bool; true only when done because of the vault, not because the shop marked it here), `reused_label` (`"Reused from your profile"` or `null`),
  - `vault_key` (the vault item it maps to, or `null` for `subcontract`, `cgp`, `cpcsc`, `fai`), `vault_status` (`on_file | expiring_soon | expired | missing`, or `null`) and `vault_expires_at`. An expired vault item is **not** reused: the document stays `todo` with `vault_status: "expired"`.
  - The award gains `done_automatically` (documents done by `auto` or reuse), `reused` (count), `automatic_summary` (`"4 of 6 done automatically"`) and `time_saved` `{minutes, label, flag: "assumption", basis}` (e.g. 195 minutes → `"about 3.5 hours"`; per item: insurance 30, quality 20, NDA 45, CCV 60, vendor form 40 minutes, assumption, not measured; the vendor and banking form counts when on file).
  - `status` counts only what the shop did itself: reused and `auto` documents leave it `not_started`. `next_steps` gains a payment set-up line: the vendor and banking form on file ("nothing new to send (reused from your profile)") or "send Northgate your vendor and banking form once …".
  - The demo shop `syn-012` has nothing on file, so its awards are unchanged (`done` 1 of 6).

#### `POST /shops/{shop_id}/offers/{job_id}/award/documents/{key}`
Body `{}` (or none; `idempotency_key` is accepted and ignored: the call is naturally idempotent). Marks the document done and returns the award. Already done (or `auto`) → the same award, no event. 404 `Unknown document '…' for job '…' (one of: …)` for a key not in this job's list.

*(Additive, v0.6.)* `{"save_to_profile": true}` also keeps the document on file in the shop's vault (§6.2) when it has a vault item that is not already reusable, so the next award reuses it. The `paperwork_done` event then carries `payload.saved_to_profile: true` and its message ends "…; kept on file for next time)". On a document that is already done it only adds the vault item (a new revision, no event). Without the flag the vault never changes.

#### `POST /shops/{shop_id}/offers/{job_id}/award/call`
Body `{ "slot": "2026-09-29T10:00:00-04:00" }`: must be the same instant as one of `call.slots` (a UTC `Z` form is accepted and stored as the offered string). Returns the award. Booking another slot re-books (event with `previous_slot`); the same slot again is a no-op. 400 `slot is required …` / `slot '…' is not one of the offered times (call.slots)`.

#### Events
| `kind` | `value_cad` / `credit_cad` | `payload` | Example `message` |
| --- | --- | --- | --- |
| `paperwork_done` | `null` / `null` | `job_id, key, title, done, total, demo: true` | "Tallowfield Fabricating Ltd. signed the Mutual non-disclosure agreement for NG-021 (2 of 6 done, demo)" (`sent` for uploads) |
| `kickoff_booked` | `null` / `null` | `job_id, slot, with, demo: true, previous_slot?` | "Tallowfield Fabricating Ltd. booked the kickoff call with Northgate for NG-021: Tue Sep 29, 10:00 AM ET (demo, no invite sent)" |

### 6.2 Supplier document vault: paperwork once (additive, v0.6)

Shop owners told us the paperwork on a first defence order is the slow part, and that after the first time it runs like any other project. The vault keeps the reusable part on the shop's profile so the next award package reuses it (§6.1). Logic and routes: `engine/vault.py`; tests: `engine/tests/test_vault.py`.

**No file is stored.** An item records only that a document is on file, its type, the date it was put on file and an optional expiry. No banking details, no personal names. Seeds: `data/processed/vault_synthetic.json` (illustrative records for synthetic shops `syn-021` (everything on file), `syn-001`, `syn-016` (insurance expiring soon), `syn-008` (insurance expired) and `syn-028`; labelled synthetic). The demo shop `syn-012` starts with nothing on file. A shop's own marks live in `State.vault` and override a seed. Upload and route keep the vault (it belongs to the shop); a reset clears the marks (seeds come back). Numbers never change: no assignment, job, package or ledger value.

Items, in order (`key` → award document):

| `key` | Title | Award document | Minutes saved per reuse (assumption) |
| --- | --- | --- | --- |
| `insurance` | Certificate of insurance | `insurance` | 30 |
| `quality` | Quality certificates (copies) | `quality` | 20 |
| `nda` | Master mutual NDA with Northgate | `nda` | 45 |
| `ccv` | Canadian content (CCV) declaration template | `ccv` | 60 |
| `vendor` | Vendor and banking set-up form | none (shortens payment set-up) | 40 |

#### `GET /shops/{shop_id}/vault`
```json
{ "shop_id": "syn-021", "shop_name": "Northfield Axis Machining Inc.", "shop_source": "synthetic",
  "as_of": "2026-09-26",
  "items": [
    { "key": "insurance", "title": "Certificate of insurance",
      "why": "Proof of business liability insurance. Defence companies ask for it before a first order.",
      "award_document": "insurance", "has_expiry": true,
      "status": "on_file", "on_file": true, "reusable": true,
      "on_file_at": "2026-05-04", "expires_at": "2027-05-31", "days_left": 247,
      "source": "synthetic", "note": "Synthetic shop: illustrative record (no file stored)",
      "marked_at": null, "minutes_saved": 30 } ],
  "on_file": 5, "total": 5, "expired": 0, "expiring_soon": 0,
  "time_saved_per_award": { "minutes": 195, "label": "about 3.5 hours", "flag": "assumption",
                            "basis": "Typical time to find, fill in and send each document again (assumption, not measured)." },
  "note": "Shieldworks records only that a document is on file: its type and dates. No file is stored, and no banking details or personal names.",
  "flags": ["assumption"] }
```
- `status`: `missing` (not on file), `expired` (`expires_at` before the demo clock's date; not reused), `expiring_soon` (60 days or less left, assumption; still reused), `on_file`. `reusable` is true for `on_file` and `expiring_soon`. `on_file` (top level) counts the reusable items.
- `source`: `synthetic` (seed) or `shop` (marked by the shop); `marked_at` is the shop's mark time (ISO), `null` for seeds.
- 404 `Unknown shop '…'` (public `pub-XXX` shops have no vault). Cached per revision and per demo-clock date.

#### `POST /shops/{shop_id}/vault/{key}`
Body `{ "on_file": true, "expires_at": "2027-06-30", "idempotency_key": "…" }` (all optional; `on_file` defaults to true). Marks the item on file today (optionally with an expiry, any item) or, with `on_file: false`, off file (hides a seed). Returns `{ "item": VaultItem, "vault": <GET body>, "changed": bool }`. The same mark again changes nothing (`changed: false`, no new revision); a reused `idempotency_key` replays the stored response, and 409 when it was used for a different request. 404 unknown shop / `Unknown vault item '…' (one of: insurance, quality, nda, ccv, vendor)`; 400 `expires_at must be a date as YYYY-MM-DD`, before 2000-01-01, or more than 10 years out. A past date is accepted and reads `expired`. No event is emitted.

---

## 7. Search and graph (additive, v0.3)

Four read-only endpoints. No existing endpoint changes and nothing here writes the State. `engine` in every response says which backend answered: `"neo4j"` when the graph database is reachable (1 s probe, cached 5 s) **and** loaded by `make graph-load`, otherwise `"memory"`. Both engines return the same content for the same State (engine/tests/test_search.py compares them); if Neo4j fails mid-request the API answers from memory. `MUSTER_GRAPH=memory` forces memory. Search reads are memoized per State revision (and per loaded graph).

**Setup (optional).** `make graph-up` starts Neo4j if needed, waits for it and loads the graph if stale; `make graph-load` wipes and reloads it (`scripts/load_graph.py`). Credentials come from `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` in the environment or `.env` (never printed or committed).

**The graph** (`engine/graphdb.py`, built from `data/processed/shops_synthetic.json`, `shops_public.json`, `national/graph_seed.json`, `national/entity_links.json`, `national/labour_outlook.json`, `itb_obligations.json` and `data/fixtures/parts_upload.json`). Every node has a unique namespaced `id` and one kind:

```
(:Prime)-[:HAS_PROGRAM]->(:Program)-[:HAS_JOB]->(:Job {job_id, part_no, value_cad, controlled, hours_week})
(:Job)-[:NEEDS_PROCESS]->(:Process)          (:Job)-[:NEEDS_CERT {via}]->(:Cert)   (controlled → CGP)
(:Prime)-[:ITB_OBLIGATION {value, achieved, currency, progress_pct, status}]->(:Program)
(:Shop {shop_id, name, source, label_text, onboarding, city, lat, lon, location, is_sme})
   -[:HAS_PROCESS]->(:Process)   -[:HOLDS_CERT {status, source_url, verified_at, expires_at}]->(:Cert)
   -[:IN_REGION]->(:Region)-[:OUTLOOK {noc, label, score, prior_label, period, wage_median}]->(:Occupation)
   -[:MATCHES_DND_VENDOR {confidence, method, contracts, value_cad, last_date}]->(:DNDVendor {name, province, contracts, value_cad})
   -[:SAME_AS {confidence}]->(:Manufacturer)   (StatCan ODBus sites; also IN_REGION / MATCHES_DND_VENDOR)
(:Region)-[:PART_OF]->(:Region)
```

Ids: `shop:syn-012`, `job:NG-034`, `process:welding`, `cert:CWB_W47.1`, `region:3560`, `occupation:72106`, `prime:northgate`, `program:northgate`, `dnd:<vendor>`, `mfr:<odbus id>`. `HOLDS_CERT` is written only for statuses other than `unknown`. Neo4j adds `:Node` on every node (unique `id`), a unique `id` constraint per kind, lookup indexes and a point index on `Shop.location` / `Manufacturer.location`. Counts today: 4,490 nodes (108 shops, 40 jobs, 2,946 ODBus manufacturers, 1,099 DND vendors, 53 primes, 123 programs, 89 regions, 12 occupations, 12 processes, 8 certs) and 5,808 edges. Northgate stays fictional; real companies stay "Public data — unverified — not affiliated"; DND matches are name matches (confidence `high` / `medium`), not confirmed by the companies.

### `GET /search/shops`

| Param | Meaning |
| --- | --- |
| `q` | case-insensitive substring of the shop name or city |
| `process` (repeatable) | process tag or label (`cnc_milling`, `CNC milling`, `cnc`, …); unknown → 400 |
| `cert` (repeatable) | cert type (`CWB_W47.1`, `cwb`, `ISO 9001`, `CGP`, …); it matches when its status counts (`verified`, `declared`, `pending_training`, funding included); unknown → 400 |
| `near` | a city (program site or any shop city) or `lat,lon`; unknown → 400 listing the known cities |
| `radius_km` | default 100 when `near` is given; without `near` → 400 |
| `source` | `all` (default) \| `synthetic` \| `public` |
| `dnd_history` | `true` = only shops with a DND contract match, `false` = only without |
| `match` | `all` (default: every requested process and cert) \| `any` (at least one; `missing` lists the rest) |
| `limit` | 1–200, default 25 (`counts` are before the limit) |

On Neo4j this is one Cypher query (`EXISTS` patterns per process / cert, `point.distance` for the radius, the State's funding overrides passed as a map), in memory set algebra on `engine.graph.CapabilityGraph`. Order: `score` desc, then distance, synthetic before public, name. `score = 0.7 × (matched / requested, 1 if none) + 0.2 × (1 − distance / radius, 0 without near) + 0.1 if onboarded`. `distance_km` is `null` without `near`. `certs` lists the certs whose status is not `unknown`. `dnd_history` sums the best-confidence match(es) (`links` = all matches). Public shops are always `onboarding: "discovered"`, `routable: false`: listed, never offered work.

`GET /search/shops?process=cnc_milling&near=London&radius_km=50` (fixture `search/shops_cnc_london.json`, one result shown):

```json
{ "engine": "neo4j",
  "query": { "q": null, "process": ["cnc_milling"], "cert": [], "near": "London", "near_lat": 42.9849,
             "near_lon": -81.2453, "radius_km": 50.0, "source": "all", "dnd_history": null, "match": "all", "limit": 25 },
  "counts": { "total": 7, "synthetic": 2, "public": 5 },
  "results": [
    { "shop_id": "syn-021", "name": "Northfield Axis Machining Inc.", "source": "synthetic", "label": "Synthetic",
      "onboarding": "onboarded", "routable": true, "city": "London", "lat": 42.998, "lon": -81.203,
      "distance_km": 3.7, "is_sme": true, "processes": ["cnc_milling", "cnc_turning"],
      "certs": [ { "type": "CGP", "status": "declared", "source_url": null },
                 { "type": "ISO9001", "status": "declared", "source_url": null } ],
      "dnd_history": null,
      "match": { "matched": ["CNC milling"], "missing": [] },
      "score": 0.9851 } ],
  "notes": [ "Synthetic shops are Shieldworks' fictional demo shops.",
             "Public shops: Public data — unverified — not affiliated. Discovered, not onboarded: never offered work.",
             "Certifications count when verified, declared or pending training (Simplified ITB rules for demo)." ] }
```

`dnd_history` when present (`GET /search/shops?dnd_history=true` → `pub-020`):
```json
{ "contracts": 1, "value_cad": 1149796.8, "last_date": "2022-12-22", "confidence": "high", "links": 2,
  "source": "DND contracts over $10K (proactive disclosure, Open Government Licence); name match, unverified" }
```
After funding TP-01, `?cert=CWB_W47.1` also returns `syn-012` with `{"type": "CWB_W47.1", "status": "pending_training", "source_url": null}` and `matched: ["CWB W47.1 (pending training)"]` (both engines).

### `GET /search/jobs?shop_id=&q=&process=&include_near_miss=true`

What one shop can do in the **current** State (always computed by `engine.pipeline` / `engine.gaps`, never Neo4j, so `engine` is `"memory"`). `shop_id` is required (400 without, 404 unknown). `q` filters on job id / part number / description / material, `process` (repeatable) on process tags.

- `eligible`: jobs the shop passes every hard filter for except capacity. `status` = `offered_to_you` (assigned to this shop; credit, multiplier and reasons are the assignment's, `offer_status` is its offered / accepted / declined), `assigned_elsewhere`, or `open` (not assigned). Otherwise `credit_cad = value × ccv × multiplier` with the shop's multiplier (2 for an SME) and the three routing reasons. Ordered offered, open, elsewhere; job order within.
- `near_miss` (when `include_near_miss`): jobs failing only 1–2 trainable requirements (cert or process; capacity is ignored, an envelope failure excludes the job), fewest missing first, then value. `missing[].kind` is `cert` or `process`.
- `tenders`: up to 5 open defence tenders from the CanadaBuys sample (`data/processed/tenders_defence.json`) for parts the shop could make or supply: category fits the shop's processes (machining/welding/fabrication also takes vehicle and vessel "spare parts" notices), or, when `q` is set, the title contains `q`. Notices that buy equipment (lathes, milling machines, trucks, trailers…) or off-the-shelf hardware (washers, O-rings, tires) are left out. Ontario first (the province or an Ontario city such as Belleville, London, Toronto, Ottawa), then soonest closing. Notices past their closing time are dropped (closing times are local, with no zone; a date-only value is open through 23:59 that day). Each tender carries `closed` (boolean): when fewer than 3 are still open, the most recently closed matches follow with `"closed": true` (enough to make 3 rows), and the web shows them under "Recently closed". `tenders_source` labels them. The cache key changes whenever a sample notice closes, so a cached answer never keeps listing a closed notice.
- A public shop (`pub-XXX`) gets `routable: false`, a `notice`, empty `eligible` / `near_miss`, and tenders.
- Before an upload `eligible` and `near_miss` are `[]`.

`GET /search/jobs?shop_id=syn-012` after routing (fixture `search/jobs_syn-012.json`, one item of each list shown):

```json
{ "engine": "memory", "shop_id": "syn-012", "query": { "q": null, "process": [], "include_near_miss": true },
  "routable": true, "stage": "routed",
  "counts": { "eligible": 5, "offered_to_you": 2, "open": 0, "assigned_elsewhere": 3, "near_miss": 25 },
  "eligible": [
    { "job_id": "NG-021", "part_no": "NG-STW-2210", "description": "Crew stowage rack, …", "value_cad": 921600.0,
      "hours_week": 22, "process_tags": ["sheet_metal", "welding", "painting"], "controlled": false,
      "credit_cad": 1677312.0, "multiplier": 2,
      "reasons": ["Sheet metal + welding", "88 km from Northgate's London site", "SME: 2x direct credit"],
      "status": "offered_to_you", "offer_status": "offered" } ],
  "near_miss": [
    { "job_id": "NG-033", "part_no": "NG-HUL-4431", "description": "Rear ramp door frame weldment, …",
      "value_cad": 1710000.0, "hours_week": 48, "status": "open",
      "missing": [ { "kind": "cert", "requirement": "CWB_W47.1", "message": "Get CWB W47.1 (now: unknown)" } ] } ],
  "tenders": [
    { "title": "Spare Parts for Material Handling Equipment 2", "reference": "cb-893-93522986",
      "solicitation_number": "W8486-270977/A", "closing_date": "2026-09-27T14:00:00",
      "buyer": "Department of National Defence (DND)", "category": "vehicles_vessels_aircraft",
      "notice_type": "Request for Proposal", "region": "Quebec (except NCR) / Montr\u00e9al", "url": null, "closed": false } ],
  "tenders_source": "CanadaBuys open tender notices (Open Government Licence); sample retrieved 2026-09-26. Matched by category and title; notices that buy equipment or off-the-shelf hardware are left out." }
```
After funding TP-01, NG-031 / NG-032 / NG-033 move from `near_miss` to `eligible` as `offered_to_you`.

### `GET /graph/summary`

```json
{ "engine": "neo4j",
  "nodes": { "Cert": 8, "DNDVendor": 1099, "Job": 40, "Manufacturer": 2946, "Occupation": 12, "Prime": 53,
             "Program": 123, "Process": 12, "Region": 89, "Shop": 108 },
  "edges": { "HAS_JOB": 40, "HAS_PROCESS": 226, "HAS_PROGRAM": 123, "HOLDS_CERT": 119, "IN_REGION": 3865,
             "ITB_OBLIGATION": 123, "MATCHES_DND_VENDOR": 102, "NEEDS_CERT": 44, "NEEDS_PROCESS": 52,
             "OUTLOOK": 1020, "PART_OF": 76, "SAME_AS": 18 },
  "totals": { "nodes": 4490, "edges": 5808 } }
```

### `GET /graph/ego?id=<node id>&depth=1|2&limit=150`

The neighbourhood of one node for the graph page. `id` accepts bare ids (`syn-012`, `NG-034`, `welding`) or namespaced ones; unknown → 404; `depth` 1 (default) or 2, else 400; `limit` 1–500 nodes (default 150). Breadth-first: at each hop a node's neighbours are taken in kind order (Prime, Program, Job, Shop, Process, Cert, Region, Occupation, DNDVendor, Manufacturer), then id, until `limit` (`truncated: true` if some were dropped). `edges` are the edges seen from explored nodes whose both ends were kept (sorted). Node `props` are the stored properties minus `id` / `location`; edge `props` are the relationship's.

```json
{ "engine": "neo4j", "root": "shop:syn-012", "depth": 1, "limit": 150, "truncated": false,
  "nodes": [
    { "id": "shop:syn-012", "type": "Shop", "label": "Tallowfield Fabricating Ltd.",
      "props": { "capacity_hours_week": 200, "city": "Woolwich", "employee_band": "20-49", "is_sme": true,
                 "label_text": "Synthetic", "lat": 43.599, "lon": -80.557, "naics": "332319",
                 "name": "Tallowfield Fabricating Ltd.", "onboarding": "onboarded", "shop_id": "syn-012",
                 "source": "synthetic" } },
    { "id": "process:painting", "type": "Process", "label": "painting", "props": { "label": "painting", "name": "painting" } } ],
  "edges": [
    { "source": "shop:syn-012", "target": "cert:CPCSC_L1", "type": "HOLDS_CERT",
      "props": { "expires_at": "2027-09-06", "status": "declared", "verified_at": "2026-09-06" } } ] }
```

### Search fixtures (`data/fixtures/search/`)

Generated by `scripts/build_search_fixtures.py` (the real engine in-process on a temporary `MUSTER_DB`, `MUSTER_GRAPH=memory`, state = reset → upload → route, not funded; byte-identical on re-run; `--check` verifies; `test_search_fixtures_are_current`). The Neo4j engine returns the same content with `"engine": "neo4j"`. `data/fixtures/index.json` is unchanged.

| File | Endpoint |
| --- | --- |
| `index.json` | manifest `{ generated_by, engine, state, note, endpoints: { "GET <path>": "<file>" } }` |
| `shops_cnc_london.json` | `GET /search/shops?process=cnc_milling&near=London&radius_km=50` |
| `shops_cwb.json` | `GET /search/shops?cert=CWB_W47.1` |
| `jobs_syn-012.json` | `GET /search/jobs?shop_id=syn-012` |
| `graph_summary.json` | `GET /graph/summary` |
| `graph_ego_syn-012.json` | `GET /graph/ego?id=syn-012&depth=2&limit=150` |

---

## 8. Demo seed and simulation (additive, v0.4)

Makes the live demo look like a working marketplace instead of an empty one (`engine/simulate.py`, router mounted on the same app; tests: `engine/tests/test_simulate.py`). Callers: `make demo-seed`, and the phone's role picker (`/m`, **Presenter tools** → **Demo version** panel, Live mode only; closed by default, open it with `/m?presenter=1`): **Fill with demo activity** (seed; asks for confirmation first, since it resets the demo for everyone) and **Simulate shops responding** (one tick every 8 s; phone events show a **Simulated** chip; while only `waiting` steps are left it checks every 15 s instead of stopping).

**Guardrails.** Everything goes through the existing §6 shop actions, so routing, jobs, packages and the ledger never change (the demo numbers stay 36 / 4, $57.5M, 11.5%). The presenter's shop **Tallowfield (`syn-012`) is never touched**, so both of its offers stay open, and **no package is ever funded**. The one scripted funding request (TP-02, another shop) waits until the presenter has funded TP-01 and sits last in the queue, so `/gaps` never features another shop's request ahead of TP-01. Every scripted event carries `"simulated": true` (top level and in `payload`) plus `payload.sim_step`; scripted decisions and requests use `idempotency_key = "sim:<step>"`. Progress lives in the event log (`payload.sim_step`), so it survives an engine restart and is cleared by `/demo/reset` or a new upload. Declared certificate dates are relative to today and the renewal rule's act-by lead (`data/rules/renewals.json`), so a seeded renewal never reads as already overdue.

### `POST /demo/seed?scenario=populated|empty`
`populated` (default): reset, upload the demo parts list, route (the `routed` event is back-dated 47 minutes), then apply a scripted history of 9 events spread over that hour: 4 other shops accept, 1 declines ("No capacity this month"), 1 asks "Can delivery start in November?", 2 capacity check-ins, 1 certificate declaration whose renewal is due soon (Nadcap chemical processing, act by in 24 days). `empty` is `POST /demo/reset` plus three fields. Anything else is 400 `scenario must be one of: populated, empty`.
```json
{ "ok": true, "scenario": "populated", "program_id": "northgate", "stage": "routed",
  "counts": { "jobs": 40, "assigned": 36, "blocked": 4, "shops_with_offers": 22,
              "accepted": 4, "declined": 1, "questions": 1, "capacity_checkins": 2,
              "cert_declarations": 1, "funding_requests": 0, "packages_funded": 0,
              "demo_shop_open_offers": ["NG-021", "NG-022"] },
  "events_added": 9, "demo_shop_id": "syn-012", "simulated": true,
  "message": "Demo seeded with simulated shop activity. Tallowfield's two offers are open and no training is funded." }
```
`scenario=empty`:
```json
{ "ok": true, "program_id": "northgate", "shops": 30, "jobs": 0,
  "message": "Demo reset: shops and program seeded; no parts uploaded.",
  "scenario": "empty", "stage": "empty", "events_added": 0 }
```
After a populated seed, `GET /programs/northgate/events?since=0` starts:
```
1  routed          Northgate Land Systems routed 36 of 40 jobs to 22 shops · 4 blocked
2  offer_accepted  Tessellate Precision Machining Inc. accepted NG-004 (+$5.06M credit)   (simulated)
3  offer_accepted  Bitmesh Electronics Assembly Inc. accepted NG-024 (+$5.59M credit)     (simulated)
```

### `POST /demo/simulate/tick`
Applies the next applicable event of a fixed 12-step queue (another shop accepts, a question, a capacity check-in, a new declaration, a decline, and last a funding request). Steps that no longer apply are skipped (the job was re-routed, the shop already answered, or the funding request is waiting for TP-01). Returns the new §6 Event (or `null` when nothing is left; that writes nothing), how many applicable steps remain, and `waiting`: steps held back only until the presenter funds TP-01 (1 before the fund moment, the TP-02 funding request; 0 after, when it counts in `remaining`). A caller that sees `remaining: 0, waiting: 1` should keep checking rather than stop. 400 `Route the program first (or POST /demo/seed?scenario=populated)` before routing.
```json
{ "event": { "seq": 11, "ts": "2026-09-27T07:10:29Z", "kind": "offer_accepted",
             "shop_id": "syn-014", "shop_name": "Carapace Coatings Inc.", "job_id": "NG-017", "package_id": null,
             "value_cad": 1267200.0, "credit_cad": 2331648.0,
             "message": "Carapace Coatings Inc. accepted NG-017 (+$2.33M credit)",
             "payload": { "simulated": true, "sim_step": "tick-01" }, "simulated": true },
  "remaining": 10, "waiting": 1 }
```
The last step, after TP-01 is funded:
```json
{ "event": { "seq": 23, "kind": "funding_requested", "shop_id": "syn-026", "shop_name": "Keelbar Heavy Fabrication Ltd.",
             "package_id": "TP-02", "value_cad": 1501000.0, "credit_cad": 400000.0,
             "message": "Keelbar Heavy Fabrication Ltd. asked Northgate to fund welding capacity (TP-02) · $40K → $400K credit",
             "payload": { "requirement": "welding", "est_cost_cad": 40000.0, "multiplier": 10, "trainees": 2,
                          "blocked_job_ids": ["NG-034"], "simulated": true, "sim_step": "tick-12" },
             "simulated": true, "…": "…" },
  "remaining": 0, "waiting": 0 }
```
Before TP-01 is funded, the queue runs out after 11 ticks: `{"event": null, "remaining": 0, "waiting": 1}`.

### `GET /demo/simulate/status`
```json
{ "queue_length": 12, "applied": 1, "remaining": 10,
  "next": { "step": "tick-02", "type": "decision", "shop_id": "syn-006", "job_id": "NG-002" },
  "seeded": true, "stage": "routed" }
```
`remaining` counts only steps that can run now (the waiting funding request is not counted until TP-01 is funded; then `next` is `{"step": "tick-12", "type": "funding", "shop_id": "syn-026", "job_id": null}`). Before routing: `{"queue_length": 12, "applied": 0, "remaining": 0, "next": null, "seeded": false, "stage": "empty"}`.
