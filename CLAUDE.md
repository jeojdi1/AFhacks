# SHIELDWORKS (formerly Muster): The Complete Playbook (CLAUDE.md)

> This file is `CLAUDE.md` in the repo root. Claude Code loads it automatically every session.
> Humans: read Section 0. Claude Code: follow Section 6 (the Dynamic Workflow) every time you are asked to "run the workflow".

---

## 0. How to use this document (humans, 5 minutes)

1. The repo is **`jeojdi1/AFhacks`** (public): https://github.com/jeojdi1/AFhacks. This file is `CLAUDE.md` in the root.
2. Each person opens Claude Code in their own clone of the repo.
3. **One person** pastes the **KICKOFF** prompt (Section 10.1) once. *(Done by Lane E; see the Log in §13.)*
4. Then each person pastes their **RUN** prompt (Section 10.2) whenever Claude Code stops. It decides the mode, picks the next task, builds, tests, updates the status, commits, and loops.
5. Glance at **Section 13 (Live Status)** every hour. That's your dashboard.
6. After the hackathon, switch to the **Startup** modes (Section 9) and paste the WEEKLY prompt (Section 10.6) each Monday.

---

## 1. Mission and context

**Shieldworks turns defence contracts into work and workers for small Canadian factories.**

| Module | What it does |
| --- | --- |
| **Route** | A prime uploads a parts list; Shieldworks splits it into jobs and assigns each to a qualified small Canadian shop |
| **Credit** | A live ITB ledger: direct vs indirect credit, multipliers, SMB target, % of obligation met |
| **Train** | When no shop can take a job (missing certified workers or capacity), Shieldworks proposes an ITB-eligible training package. "Funding" it unblocks the job and earns 5x credit (10x for Indigenous workforce development). |
| **Comply** | Every shop shows its certifications with source, date verified, status, and expiry |

**Two-sided.** Shieldworks serves both sides of the same transaction:

- **Big companies (primes)** pay. They get jobs routed to qualified shops, 2x credit per SME job, a ledger they can report from, a stronger bid, and 5x credit for funding training.
- **Small companies (shops)** use it free. They get defence job offers they would never have seen, a profile that shows their certifications, a readiness list of what would unlock more work, and workers trained on the prime's money.
- **Workers and colleges** are the third group: the prime funds training, the college fills seats, workers get certified, and the shop gets capacity.
- A prime's obligation is a shop's opportunity. **The demo shows both sides.**

**Long-term vision:** the operating system for Canada's defence supply chain. **Wedge:** Route + Credit, with Train as the differentiator.

### 1.1 Locked decisions (Sat Sept 26, 6 PM; rationale in `/docs/decisions.md`)

1. **Shop side is on the demo path (P0).** The video includes a shop view: accept a Northgate offer, see a readiness card ("Get CWB W47.1 → qualify for N more jobs worth $X"), and see welders in training after the prime funds it.
2. **Fleet-sized quantities.** Each part's `qty` covers the whole vehicle fleet over the program, so the 40-line work package is worth **about $40M**. The obligation meter then fills visibly (~13–16%) and the Fund jump is visible. No made-up "prior credits".
3. **Scenario shape:** 40 jobs → **36 assigned, 4 blocked** (all 4 are welding jobs blocked by the CWB welder shortage).
4. **Funding counts:** rules accept certifications with status `verified`, `declared`, or `pending_training` (the last is created only by a funded package). `credit_added` = training credit **plus** credit from newly assigned jobs.
5. **CPCSC:** `requires_cpcsc` means `"CPCSC_L1"` is in the job's `required_certs`.
6. **Repo:** `jeojdi1/AFhacks`, public from the start.
7. **Name (Sun Sept 27, 09:00):** the product is **Shieldworks** (renamed from Muster). Code identifiers keep the old name (`MUSTER_DB`, `MUSTER_ENGINE_URL`, `muster.*` storage keys) so nothing breaks; the 55 outreach emails went out as "Muster", so say "Shieldworks, formerly Muster" to anyone who replies.

### Hackathon facts

- Event: AF Hacks "Growing Canada", University of Waterloo (QNC).
- **Deadline: Sunday Sept 27, 2026, 12:00 PM sharp** on Devpost.
- Submit: a **public GitHub repo with everything merged into `main`**, plus a **demo video of 5 minutes or less** covering (a) the app's purpose, (b) its value to target users, and (c) a walkthrough of the tool and each feature.
- Top 10 announced at 1:00 PM, followed by a live pitch. Judges include MP Bardish Chagger and Dr. Ian Burgess.
- **Rubric (no technical judging):** each criterion is scored 0–4.
  - *Relevance to theme:* national-scale, obvious "why Canada".
  - *Viability:* clear user, realistic path to adoption, what happens after the hackathon.
  - *Pitch:* tight, investor-ready, handles tough questions.
- **Implication: a reliable, well-labelled demo path beats breadth. `main` must always run.**
- Optional prize: ElevenLabs "Best Project Built with ElevenLabs" (voice onboarding, only if time allows).

---

## 2. Operating model

### Lanes

| Lane | Owner | Owns | Stack |
| --- | --- | --- | --- |
| **E** (engine and data) | James | `/engine`, `/data`, `/scripts` | Python 3.12 (via `uv`; the system 3.14 lacks some wheels), FastAPI, Pydantic/SQLModel, SQLite, OR-Tools, pytest |
| **F** (frontend) | Teammate | `/web` | Next.js App Router, TypeScript, Tailwind, shadcn/ui, react-leaflet, Recharts |
| **B** (both) | Shared | `/docs/api.md`, `/data/fixtures`, `README.md`, `CLAUDE.md` §13 | — |

### Git rules

- Both lanes commit **directly to `main`** in their own folders. Always `git pull --rebase` before pushing.
- Commit message format: `<TASK-ID>: <what>`, e.g. `E2.5: ITB ledger + tests`.
- **API contract changes** use a commit that starts with `CONTRACT:` and must update `/docs/api.md` and `/data/fixtures` in the same commit. Note it in the Log (§13).
- Never commit `.env`, secrets, `data/raw/*`, or anything larger than 10 MB.

### Repo layout

```
/web                 Next.js app
/engine              FastAPI app (engine/app.py), modules below
  tagger.py          parts-list tagging (LLM + cache + rule fallback)
  rules.py           hard filters from data/rules/*.json
  scoring.py         match scoring
  assign.py          OR-Tools assignment + greedy fallback
  ledger.py          ITB credit calculations
  gaps.py            blocked jobs + training suggestions + shop readiness
  training.py        fund-training simulation
  seed.py            builds SQLite from data/processed
/engine/tests        pytest
/data/raw            downloads (gitignored)
/data/processed      candidates.csv, shops_public.json, shops_synthetic.json,
                     certs.json, parts_northgate.csv, program_northgate.json
/data/rules          policy.json, filters.json, weights.json, training_costs.json
/data/fixtures       one JSON per API endpoint (+ *_after_fund variants)
/data/cache          LLM responses keyed by input hash (committed)
/scripts             ingest_odbus.py, enrich_sites.py, build_fixtures.py, demo_check.py
/docs                api.md, demo-script.md, decisions.md, pitch.md
Makefile             setup, dev, seed, test, lint, demo-check, fixtures-check, reset-demo
```

---

## 3. Architecture

### Data model

- **Shop:** id, name, `source` (public|synthetic), city, lat, lon, naics, employee_band, is_sme, processes[], machines[], materials[], max_envelope_mm [x,y,z], tolerance_class, capacity_hours_week, lead_time_days, website, contact_role_email, provenance[{field, source_url, confidence}]
- **Certification:** shop_id, `type` (CGP | CPCSC_L1 | ISO9001 | AS9100 | NADCAP:<commodity> | CWB_W47.1), `status` (verified | declared | unknown | pending_training), source_url, verified_at, expires_at
- **Program:** id, prime_name (demo: "Northgate Land Systems", fictional), site {city, lat, lon}, contract_value_cad, obligation_cad (= contract value), smb_target_pct, rules_version
- **PartLine / Job** (1:1 for the demo): id, program_id, part_no, description, qty (**fleet-lifetime quantity**), unit_price_cad, material, process_tags[], envelope_mm [x,y,z], tolerance_class, required_certs[], controlled (bool), est_value_cad (= qty × unit_price_cad), ccv_pct, hours_week (weekly shop hours during production)
- **Match:** job_id, shop_id, eligible, reasons[], score, score_breakdown{fit, distance, lead_time, itb_value}
- **Assignment:** job_id, shop_id, hours_week, value_cad, credit_cad, status (offered | accepted | declined)
- **CreditTxn:** program_id, origin (assignment | training), type (direct | indirect), value_cad, ccv_pct, multiplier, credit_cad, category, flags[] (e.g. "assumption", "simplified-demo")
- **TrainingPackage:** id, program_id, blocked_job_ids[], shop_id, category (enum below), recipient_type (college | apprenticeship_sponsor | nonprofit | indigenous_institution), recipient_example, trainees, est_cost_cad (**assumption**), multiplier, capacity_unlock{process: hours}, cert_unlock, status (suggested | funded)

### API contract (keep in sync with `/docs/api.md`, which is authoritative for field-level detail)

```
GET  /health
POST /demo/reset
GET  /programs/{id}                        → program + counts
POST /programs/{id}/parts                  multipart CSV (or ?use_demo=true) → tagged jobs
POST /programs/{id}/route                  → {assignments[], blocked[]}
GET  /programs/{id}/assignments
GET  /programs/{id}/jobs                   → current jobs with status (rebuilds the jobs table after reload)
GET  /programs/{id}/ledger                 → totals, direct/indirect, smb_progress, multiplier_breakdown
GET  /programs/{id}/gaps                   → blocked jobs + training suggestions
POST /programs/{id}/training/{pkg}/fund    → {before, after, unblocked_jobs[], credit_added, headline}
GET  /shops            GET /shops/{id}     → shop + certifications + offers + readiness + training
# Shop actions and events (additive v0.2, api.md §6; phone app /m). POSTs take an idempotency_key.
POST /shops/{id}/offers/{job}/decision     accepted | declined (+reason) | question | undo
POST /shops/{id}/funding-requests          {requirement} → request on the shop's training package
POST /shops/{id}/capacity                  weekly free hours per process
POST /shops/{id}/certifications/{type}     shop-declared expiry (never "verified")
GET  /shops/{id}/actions   GET /programs/{id}/actions
GET  /programs/{id}/events?since=&limit=   event log (routed, offer_*, funding_requested, package_funded, ...)
GET  /programs/{id}/training/{pkg}/seats/{n}  pseudonymous trainee seat card
# Search and graph (additive v0.3, api.md §7; read-only). Neo4j when up and loaded (make graph-up), else in-memory; `engine` says which.
GET  /search/shops?q=&process=&cert=&near=&radius_km=&source=&dnd_history=&match=&limit=   capability search (public shops never routable)
GET  /search/jobs?shop_id=&q=&process=     jobs for a shop: offered / eligible / near misses (one requirement away) + federal tenders
GET  /graph/summary                        node and edge counts by kind
GET  /graph/ego?id=&depth=&limit=          neighbourhood of one node (graph page)
```

### Algorithms

1. **Tagger:** the LLM returns strict JSON (process_tags, material, envelope_mm, tolerance_class, required_certs, controlled). Cache results by hash of the input line. If the API is unavailable, fall back to keyword rules.
2. **Rules (hard filters):** process match, envelope fits, required certs present (status `verified`, `declared`, or `pending_training`), `controlled → shop has CGP`, `requires_cpcsc` (i.e. `CPCSC_L1` in required_certs) `→ shop has CPCSC_L1`, remaining capacity > 0. Every failure returns a readable reason.
3. **Scoring:** `score = w_fit·fit + w_dist·(1 − d/d_max) + w_lead·(1 − lead/lead_max) + w_itb·itb_norm`. Weights live in `weights.json`. `itb_norm` favours SMEs (2x direct credit). Distance is measured from the program site.
4. **Assignment:** OR-Tools (min-cost flow or CP-SAT) maximizes total score, subject to each job getting at most one shop and each shop's hours staying within capacity. The **greedy fallback** handles the hardest jobs first (fewest eligible shops).
5. **Ledger:** `credit = value × ccv_pct × multiplier`. Aggregate totals, the direct/indirect split, SMB share vs target, and % of obligation met. SMB progress counts the CCV of SME work **before** multipliers (label: assumption).
6. **Gaps:** a job is blocked if it has no eligible shop, or eligible shops are out of capacity. Report the most common failing filter as the reason. Suggestions: find shops within radius that fail *only* on a certification or on capacity, then map the gap to a training category:
   - missing welding certification → `personal_certification` + `apprentice_sponsorship`
   - capacity shortage → `apprentice_sponsorship`
   - Costs come from `training_costs.json` and are labelled **assumption**.
7. **Fund simulation:** add a `pending_training` certification and extra capacity, re-run routing, and return the before/after diff. `credit_added` = the training transaction's credit + the credit of newly assigned jobs. Also return a `headline`, e.g. "$96K training → $480K credit (5x) + 3 jobs unblocked (+$9.2M credit)".
8. **Shop readiness:** for one shop, list the jobs it fails on exactly one requirement, grouped by that requirement (cert, capacity or process), with jobs unlocked and value. E.g. "Get CWB W47.1 → qualify for 3 more jobs worth $4.1M".

---

## 4. Domain rules

These are simplified for the demo. Label them "Simplified ITB rules for demo" in the UI. Store the values in `data/rules/policy.json` with a `source` key for each.

- A prime must do business in Canada equal to **100% of the contract value** (do business equal to it, not spend it). The policy applies automatically above $100M; contracts of $25M–$100M are reviewed. *(ITB overview)*
- Credit is measured in **Canadian Content Value (CCV)**. A contract may carry a **mandatory SMB requirement**: generally **15% of the ITB obligation** must involve SMBs. *(ITB policy)*
- **Direct** = work on the contract itself. **Indirect** = any other eligible activity. Excess credit can be applied elsewhere. *(Model terms)*
- The **Value Proposition** is set per procurement and generally weighted at **least 10%** of the bid score. Banked activity can generally be kept **up to 10 years** *(Gowling WLG, secondary)*; banked credit may cover **at most 50% of the obligation** *(model terms §12.1)*.
- **Multipliers:** regular work 1x, SMB direct work 2x, eligible skills and training 5x, Indigenous workforce development 10x. *(ITB overview; it says the policy "will provide" / "may receive", so never say "Canada now gives")* Training credit applies to the prime's **cash** and is **capped at 25% of the obligation** *(model terms §7.5.3, §7.5.4.1)*. Demo simplification: SME = under 500 employees; the official SMB line is ≤250 FTE (≤500 with affiliates) *(model terms §1.1.41–1.1.42)*.
- **Eligible training categories** (model terms §7.5.1):
  - `apprentice_sponsorship`: sponsorship costs for apprentices in a recognized apprenticeship program
  - `personal_certification`: certification for a **Canadian citizen or permanent resident** by a recognized trade body
  - `skills_program_contribution`: contribution to a skills program through a registered charity or nonprofit
  - `education_costs`: tuition, course fees and travel incurred in Canada
- ITB authority moved to the **Defence Investment Agency** on July 16, 2026. Contact: ITB-RIT@dia-aid.gc.ca.
- **Compliance gates:**
  - **Controlled Goods:** controlled technical data is itself a controlled good. **Shieldworks never stores drawings.** A job with `controlled=true` may only go to a CGP-registered shop.
  - **CPCSC Level 1:** 13 controls, self-assessed, no public registry. Always a shop-declared field.
  - **ISO, AS9100, Nadcap, CWB:** record source, verified_at and status.
- **Never invent a policy number.** Anything not in this section or Section 11 must be labelled `assumption`.

---

## 5. Data rules and legal guardrails

- **Base list:** StatCan Open Database of Businesses (Open Government Licence). Credit it in the README and UI footer.
- **Do not scrape** Canada's Business Registries, CADSI GATEWAY, or IAQG OASIS.
- **Company websites:** respect robots.txt, fetch only capability or equipment pages, extract facts only, store the source URL per field, and rate-limit to 1 request per second.
- **CGP directory, CWB, Nadcap:** manual lookups for the demo shops only. Record the date checked.
- **No personal names.** Role-based emails only.
- Real companies are labelled **"Public data — unverified — not affiliated."** Never show a real company as a customer or partner. The prime is fictional: **Northgate Land Systems**. Training partners appear as "example (not affiliated)".
- Synthetic shops are clearly labelled `synthetic` in data and UI.

---

## 6. The Dynamic Workflow (Claude Code follows this every iteration)

### 6.1 Modes

Evaluate these in order from top to bottom; the first match wins. `T` is the time remaining until the deadline (Sun 12:00 PM).

| Mode | Enter when | Behaviour |
| --- | --- | --- |
| **SETUP** | Any H0 task is unchecked | Do H0 tasks only |
| **PITCH** | Submission done | Prepare pitch notes and Q&A; no code changes |
| **SHIP** | T ≤ 2h (10:00 AM) | README, video, merge, submit (H5) |
| **FREEZE** | T ≤ 2.5h (9:30 AM) | Fix bugs on the demo path only; no new features |
| **TRIAGE** | T ≤ 8h and demo-check fails before the "route" step, OR a P0 task is over 150% of its time box, OR 3 failed attempts on the same task | Apply the Fallback Ladder (§6.5), cut all P2 tasks, and make the demo path pass |
| **INTEGRATE** | 2h since the last integration, OR your lane completed 3 tasks since the last integration, OR a `CONTRACT:` commit landed | Run §6.6 |
| **BUILD** | Otherwise | Core Loop (§6.2) |

After the hackathon, the startup modes take over (§9): **DISCOVER → PILOT → NETWORK → EXPAND**.

### 6.2 The Core Loop (one iteration)

1. **Sync:** `git pull --rebase`. Read §13 (Live Status and Log).
2. **Decide mode** using §6.1. Write it in your lane's row of §13.
3. **Select a task** using §6.3.
4. **Plan:** 3–5 lines, written in the terminal.
5. **Build:** implement in small steps and keep `main` runnable.
6. **Verify:** run the gates in §6.4 that apply to the task.
7. **Record:** tick the task in §7 or §9 with a one-line note, update your row in §13, and append one line to the Log.
8. **Commit and push** with the task ID in the message.
9. **Re-evaluate** the mode. If still in BUILD and less than about 45 min of work remains in the session, stop and report. Otherwise continue with the next iteration.
10. **Stop and ask the human** if a decision would change the demo scope, the API contract, or the legal/data rules.

### 6.3 Task selection rules

1. Only tasks in your lane (or B tasks nobody has claimed; claim one by writing your lane next to it).
2. All dependencies must be ticked.
3. Priority: **P0** (on the demo path) → **P1** (makes the demo stronger) → **P2** (nice to have).
4. Within the same priority, take the earliest ID.
5. If nothing is available, run INTEGRATE, or help the other lane by writing tests or fixtures.

### 6.4 Gates

- **Engine:** `make test` (pytest) must pass.
- **Web:** `npm run build` and `npm run lint` must pass (run inside `/web`).
- **Fixtures:** `make fixtures-check` runs the demo-check assertions against `/data/fixtures` offline; it must pass whenever fixtures change.
- **Demo gate:** `make demo-check` runs `scripts/demo_check.py` against the running API and prints PASS/FAIL for each step:
  1. `health`
  2. `reset`
  3. `upload` (40 jobs tagged)
  4. `route` (≥ 25 assignments; **no controlled job assigned to a non-CGP shop**)
  5. `ledger` (totals equal the sum of transactions; SMB % computed)
  6. `gaps` (≥ 3 blocked jobs, each with a suggestion)
  7. `fund` (≥ 1 job unblocked and credit_added > 0)
  8. `shop` (the funded package's shop shows offers, a readiness list, and the funded training)
- A task that touches the demo path is **not done** until the demo gate passes at least as far as it did before.

### 6.5 Fallback Ladder (use in TRIAGE, in this order)

1. OR-Tools → greedy assignment.
2. Live LLM → cached responses → keyword rules.
3. Live API in the web app → fixtures (with a visible "demo mode" badge).
4. Map tiles → static map image with pins.
5. Voice onboarding → cut.
6. Live gap computation → precomputed gap fixtures, labelled "precomputed".

### 6.6 INTEGRATE procedure

Pull, run `make dev`, then `make demo-check`, then click through the full demo path in the browser:

upload → route → scorecard → gaps → fund training → jobs turn green and credit rises → shop view (offer, readiness, training)

List every break in priority order. Fix the top 3 if they're in your lane, and add the rest as new tasks (ID suffix `.x`) for the right lane. Log the result.

### 6.7 Status and log protocol

- Each lane edits **only its own row** in the Live Status table (§13) to avoid merge conflicts.
- The Log is append-only, one line per event: `HH:MM [E|F] TASK-ID — result (demo-check: step reached)`.

---

## 7. Hackathon backlog

Format: `ID [lane] [priority] (depends on) — time box — acceptance criteria (AC)`. Suggested clock times assume a 6 PM Saturday start; the modes in §6.1 override the clock.

### H0: Setup (target: 6:00–6:45 PM)

- [x] **H0.1** [B] [P0] — 30m — Scaffold the repo per §2, with the Makefile targets `setup dev seed test lint demo-check fixtures-check reset-demo`, `.env.example`, `.gitignore` and a README stub. AC: `make dev` serves :8000 and :3000.
- [x] **H0.2** [B] [P0] (H0.1) — 20m — Write `/docs/api.md` from §3 with example payloads. AC: both lanes agree.
- [x] **H0.3** [B] [P0] (H0.2) — 20m — One fixture per endpoint in `/data/fixtures`, plus `*_after_fund` variants: a realistic Northgate scenario with fleet-sized quantities (package ≈ $40M), 40 jobs, **36 assigned, 4 blocked**. AC: the web app can import all of them; `make fixtures-check` passes.
- [x] **H0.4** [E] [P0] (H0.1) — 20m — `scripts/demo_check.py` with all 8 steps (live mode and `--fixtures` mode). AC: `make demo-check` runs and reports honestly.

### H1: Data (target: 6:45–9:30 PM)

- [x] **H1.1** [E] [P0] — 60m — `ingest_odbus.py`:
  - Download the ODBus CSV (manually into `data/raw` if needed).
  - Filter to Kitchener, Waterloo, Cambridge, Woolwich, London and Hamilton.
  - Keep NAICS codes starting with 3327, 3323, 3321, 3328, 3329, 3344, 3353, 3359, 3363, 3364, 3366, plus a keyword fallback (machine, tool, precision, fab, weld, metal).

  AC: `candidates.csv` has 100 or more rows, with counts per city logged. *(Done: 115 rows, but only Kitchener 103 + Hamilton 12 — ODBus covers only cities that publish business open data. Keyword matches ~44% noise; NAICS matches clean.)*
- [ ] **H1.2** [E] [P1] (H1.1) — 75m — `enrich_sites.py`: for 30–50 shops with websites, polite crawl and LLM extraction to the Shop schema with provenance, cached. AC: 30 or more shops in `shops_public.json`.
- [ ] **H1.3** [E] [P1] (H1.2) — 45m — Manual certification checks (CGP directory, CWB, Nadcap), saved to `certs.json` with verified_at. AC: every demo shop has a status for each certification type.
- [ ] **H1.4** [E] [P0] — 30m — `shops_synthetic.json`: 30 shops, fixed seed, labelled synthetic, covering heat treat, plating, harness, 5-axis, CWB welding and CGP. AC: every process in the parts list is covered. *(A draft is produced by H0.3's `build_fixtures.py`; finalize it here.)*
- [ ] **H1.5** [E] [P0] — 30m — `parts_northgate.csv` (40 lines: brackets, housings, weldments, harnesses, coatings, fasteners; 4–6 controlled; **fleet-lifetime quantities**, unit prices, values and CCV; package ≈ $40M) plus `program_northgate.json` ($500M, SMB target 15%, site in London ON). **Deliberately design 4 welding lines that will be blocked** by the CWB welder shortage. *(Draft from H0.3; finalize here.)*
- [ ] **H1.6** [E] [P0] — 20m — `data/rules/*.json`: policy (with sources), filters, weights, training_costs (all labelled `assumption`).

### H2: Engine (target: 9:30 PM–3:30 AM)

- [x] **H2.1** [E] [P0] (H1.4, H1.5) — 40m — Models and `seed.py`. AC: `make seed` builds SQLite.
- [x] **H2.2** [E] [P0] (H2.1) — 45m — `tagger.py` with cache and rule fallback. AC: 40 lines tagged; fallback tests pass.
- [x] **H2.3** [E] [P0] (H2.2) — 45m — `rules.py`. AC: the test "controlled job is never eligible for a non-CGP shop" passes; `pending_training` certs count; every rejection has a reason.
- [x] **H2.4** [E] [P0] (H2.3) — 60m — `scoring.py` + `assign.py` (OR-Tools plus greedy fallback). AC: under 2 seconds; capacity tests pass; each assignment carries its top 3 reasons.
- [x] **H2.5** [E] [P0] (H2.4) — 40m — `ledger.py`. AC: 5 hand-calculated pytest cases pass (including SME 2x and a mix of direct and indirect).
- [x] **H2.6** [E] [P0] (H2.4) — 50m — `gaps.py`. AC: 4 blocked jobs, each with a category, recipient type, cost (assumption), multiplier and capacity unlock.
- [x] **H2.7** [E] [P0] (H2.5, H2.6) — 40m — `training.py` fund simulation. AC: the diff shows unblocked jobs, credit added (training + jobs) and a headline.
- [x] **H2.8** [E] [P0] (H2.1–H2.7) — 45m — FastAPI endpoints with CORS. AC: `make demo-check` passes steps 1–7.
- [x] **H2.9** [E] [P0] (H2.6, H2.7) — 30m — Shop readiness (§3 algorithm 8) + offers + training in `GET /shops/{id}`. AC: `make demo-check` passes all 8 steps.

### H3: Frontend (target: 6:45 PM–3:30 AM, in parallel against fixtures)

- [x] **H3.1** [F] [P0] (H0.3) — 45m — App shell and nav: Program, ITB Scorecard, Gaps & Training, Network, Shop. Always-visible footer: "Simplified ITB rules for demo · Public data unverified · Not affiliated · Data: Statistics Canada ODBus (OGL)".
- [x] **H3.2** [F] [P0] (H3.1) — 90m — Program page: CSV upload, jobs table (part, process, shop, score, reasons popover, controlled badge) and Leaflet map with pins and job lines.
- [x] **H3.3** [F] [P0] (H3.1) — 60m — ITB Scorecard: obligation meter, direct/indirect split, SMB % vs target, multiplier breakdown chart, "rules_version" tag.
- [x] **H3.4** [F] [P0] (H3.1) — 90m — Gaps & Training (the hero screen): blocked jobs with reasons, suggestion cards, and a **Fund training** button with an animated before/after (credit counter jump, jobs turning green, the `headline` in big type with the multiplier).
- [x] **H3.5** [F] [P0] (H3.1) — 60m — Shop view and Network: the shop's **offer inbox** (accept/decline, local state), **readiness card** ("Get CWB W47.1 → qualify for N more jobs worth $X"), **training status** after funding ("2 welders in training"), and certification badges (status, source, date). Network page lists shops with public/synthetic labels.
- [x] **H3.6** [F] [P0] (H2.8) — 45m — Wire to the live API with fixture fallback and a "demo mode" badge.

### H4: Optional (only in BUILD mode, and only if H2.9 and H3.6 are both done by 8:00 AM)

- [ ] **H4.1** [E] [P2] — 90m hard cap, cut at 9:30 — ElevenLabs voice onboarding: agent interview → transcript → profile extraction → new shop appears in the Network.
- [ ] **H4.2** [E] [P2] — 45m — Bid mode: projected credit and SMB share for a Value Proposition before the contract is awarded.
- [ ] **H4.3** [F] [P2] — 45m — "Live demand" panel from the CanadaBuys open tender CSV (defence-related rows).

### H5: Ship (FREEZE from 9:30 AM, SHIP from 10:00 AM)

- [ ] **H5.1** [B] [P0] — Bug bash on the demo path only; `make reset-demo` works.
- [ ] **H5.2** [B] [P0] — README: problem, solution, screenshots, how to run, data sources and licences (§11), disclaimers, limitations, next steps (§9).
- [ ] **H5.3** [B] [P0] — Record the demo video (≤ 5 min) per §8.1 from a freshly reset state. Upload it, unlisted.
- [ ] **H5.4** [B] [P0] — Everything merged to `main`, repo public, no secrets committed (run `git log -p | grep -i key` as a check), then **submit on Devpost by 11:30 AM**.
- [ ] **H5.5** [B] [P1] — `/docs/pitch.md`: 3 slides max and the Q&A from §8.3, ready for the 1:00 PM top-10 announcement.

---

## 8. Demo, pitch, and Q&A

### 8.1 Video script (≤ 5:00)

- **0:00–0:45 Purpose.** Budget 2025 adds $81.8B for defence over five years; the Defence Industrial Strategy (Feb 2026) targets 70% of defence acquisitions going to Canadian firms by 2035. On July 16, 2026, Ottawa announced a nearly $2B armoured-vehicle deal built in London, ON, drawing on 600+ Canadian suppliers. Every major contractor must do business in Canada equal to 100% of its contract value, with double credit for direct small-business work. Yet primes can't find small shops, and those shops lack CWB-qualified welders.
- **0:45–1:30 Value (both sides).** Primes win bids (the Value Proposition is generally at least 10% of the bid score, set per procurement) and meet their obligations. Shops get work they'd never have seen. Workers get trained. Canada builds its industrial base.
- **1:30–4:30 Walkthrough:**
  1. Upload Northgate's parts list.
  2. Routing and map: show a controlled job going only to a CGP-registered shop.
  3. ITB Scorecard: SME 2x credit.
  4. Gaps: jobs blocked because no available shop has CWB-qualified welders.
  5. Fund training: the prime's cash for eligible training earns 5x credit and the jobs unblock ($96K = 4 new-welder training seats, assumption).
  6. **Shop view (desktop, then phone at `/m`):** the Woolwich shop accepts or declines Northgate's offers on its phone (the prime sees it live), sees "Get CWB W47.1 → 3 more jobs", asks Northgate to fund it, sees its welders in training, and shows certification badges with source and date.
  7. Optional: `/network` lists 78 real southwestern Ontario shops (public data, unverified, not affiliated; never routed).
- **4:30–5:00 Next steps.** Fifteen shop interviews, a pilot with one prime, and a regional college training partner. Australia's ICN Gateway proved suppliers will register; Canada needs the next step, with the workforce built in.

### 8.2 One-paragraph pitch

"Canada is adding $81.8 billion to defence over five years and wants 70% of defence acquisitions to go to Canadian firms by 2035. Every major contractor must do business in Canada equal to its full contract value, and earns double credit for small-business work and five times the credit for cash spent training workers (capped at 25% of the obligation). But primes can't find small shops, and those shops don't have the CWB-qualified welders to take the work. Shieldworks fixes both. We route defence jobs to qualified local factories, shops answer offers on their phone, and when a shop is short on qualified welders, the prime funds training for 5x credit. Primes win bids and meet obligations, shops get work and workers, and Canada gets its industrial base."

### 8.3 Judge Q&A

- **"Isn't this ICN Gateway, OMX, or Goverly?"** ICN lets suppliers raise their hand, but doesn't select them. OMX and consultants track obligations. Goverly builds supplier readiness files and prime search, paid by suppliers. As of this weekend, we found no one assigning each job, crediting it, and funding the training that unblocks it.
- **"Why hasn't it worked before?"** Primes could meet ITB through indirect activity. Now the updated policy gives 2x credit for direct SMB work and 5x for training, on top of $81.8B more for defence over five years.
- **"Security?"** We never store drawings; matching uses metadata only. Controlled jobs go only to CGP-registered shops. We'll register with the CGP before we handle any technical data.
- **"Why would a prime pay?"** The credit is worth far more than our fee, and a stronger Value Proposition, generally at least 10% of the bid score and set per procurement, helps them win the bid.
- **"Is training credit guaranteed?"** No. Only the prime's cash in the §7.5.1 categories counts, training credit is capped at 25% of the obligation (§7.5.4.1), and the Defence Investment Agency decides. We produce the evidence.
- **"What happens Monday?"** We incorporate and request a concept review from the DIA's ITB team; CME Defence and Waterloo EDC introduce us to shops. That means 15 shop interviews in 30 days and one prime pilot LOI in 90.
- **"Why would a shop trust a platform the prime pays for?"** *(draft)* It's free for shops, they see exactly why they were or weren't matched, and they can decline any offer. The prime's credit depends on the shop doing the work, so the prime needs the shop to succeed.
- **"What if the welder you trained leaves?"** *(draft)* The welder stays in Canada's workforce, which is the point of the 5x multiplier. An apprenticeship is registered with a sponsoring employer, so the training happens at the shop that needs the worker. How credit is counted for trainees who leave is something we confirm with the DIA (assumption).
- **"Isn't the welder shortage overstated?"** Job Bank rates the general welder outlook in Ontario "very limited". The gap is welders qualified to CSA W47.1 at CWB-certified shops. Re-qualifying an experienced welder costs a few thousand dollars and takes weeks (our estimate).
- **"Who holds the training money?"** No one in the middle. The prime pays the college or apprenticeship sponsor directly, the DIA decides eligibility, and Shieldworks keeps the per-job audit trail.
- **"Your data only covers a few cities?"** We already have 78 public shops across 12 southwestern Ontario cities, 39 of which list welding, from company sites plus StatCan ODBus (public, unverified, not affiliated). Next, shops claim their profiles, and CME Defence and Waterloo EDC bring members in.

---

## 9. Startup build (after the hackathon)

### 9.1 Modes and gates

| Mode | Timing | Goal | Gate to exit |
| --- | --- | --- | --- |
| **DISCOVER** | Weeks 1–4 | Validate the pain and the buyer | 3 primes or Tier 1s say "we'd pilot"; 15 shop interviews; the DIA ITB team has reviewed the concept |
| **PILOT** | Months 2–4 | Route + Credit with one prime's existing suppliers | 1 paid pilot (or LOI); first credit report accepted internally |
| **NETWORK** | Months 4–8 | 50–100 verified shops; Train module with one college and one Indigenous-governed institution | Measurable $ routed; first funded apprentices; CGP registration filed |
| **EXPAND** | Months 8–12 | Second prime; Comply module; European and SAFE partners | Repeat customer; renewal signed |

### 9.2 Startup loops

- **Weekly loop:**
  - Monday: pick 3 goals from the backlog tied to the current gate.
  - Build.
  - Friday: demo to one real user and log what they said.
  - Update the metrics and the backlog.
- **Discovery loop (per interview):**
  - Prepare: the prime's ITB obligations (from the ISED report) and the shop's certifications.
  - Ask: how do you find suppliers today, what's painful, what would you pay, who else decides?
  - Log insights and tag them `pain | workaround | budget | blocker`.
  - Rule: if 5 interviews in a row reject the premise, revisit the wedge.
- **Data loop (monthly):** re-crawl shop sites, re-check certification expiry, invite shops to claim their profiles, refresh CanadaBuys and ITB report data.
- **Compliance loop (quarterly):** CGP registration status, Canadian hosting on a CGP-registered provider, privacy policy, access logs and audit trail, and CPCSC readiness if Shieldworks will handle specified information.

### 9.3 Startup backlog

- [ ] **S1** Accounts and multi-tenancy (prime, shop, college, advisor roles), SSO, audit logs.
- [ ] **S2** Postgres, a Canadian cloud region, backups, secrets manager.
- [ ] **S3** Data pipeline: entity resolution (name, address, business number, domain), monthly crawls, shop profile claiming, CertSearch API integration.
- [ ] **S4** ITB engine validated by an ITB consultant; exports for annual reports; banking; regional targets.
- [ ] **S5** Train module v1: partner onboarding, evidence file generation (receipts, enrolment, completion), eligibility checklists per category.
- [ ] **S6** Comply module: document vault, expiry alerts (CGP, CPCSC, ISO, AS9100, clearances), readiness scores.
- [ ] **S7** CGP registration for Shieldworks; controlled-data enclave (only after registration).
- [ ] **S8** Integrations: prime procurement systems (e.g. JAGGAER exports), CSV/ERP imports, STEP metadata extraction.
- [ ] **S9** Bid mode v2: Value Proposition builder.
- [ ] **S10** Europe: SAFE partner discovery via TED award data; Korea and Japan through partnerships.

### 9.4 Business model

- Primes pay a subscription per program plus a small fee on routed value.
- Training coordination is a service fee paid by the prime. Confirm with the DIA which costs count toward credit; Shieldworks' own fee likely won't.
- Shops and colleges use it free.
- Channels: BDC Defence Platform, regional development agencies, CME, CADSI.

### 9.5 Outreach order

1. DIA ITB team (ITB-RIT@dia-aid.gc.ca)
2. CME (just released its Ontario workforce report)
3. Waterloo EDC
4. Conestoga Skilled Trades Campus
5. GDLS–Canada and NP Aerospace (London)
6. CADSI and BDC
7. Marconi Technologies (SAFE)
8. TKMS and Irving (later)

Use warm introductions through WVG and the judges where possible.

---

## 10. Prompts (paste into Claude Code)

### 10.1 KICKOFF (once, by one person)

```
Read CLAUDE.md fully. You are starting the Shieldworks hackathon build. Enter SETUP mode
and complete H0.1–H0.4 exactly as specified. Write /docs/api.md from Section 3,
create the fixtures (a realistic Northgate scenario), and create demo_check.py.
Update Section 13 (my lane row and the Log), commit and push with task IDs, then
summarize the API contract in 5 lines for my teammate.
```

### 10.2 RUN (the main loop; paste whenever Claude Code stops)

```
Run the Shieldworks workflow from CLAUDE.md Section 6 for Lane [E or F]. Pull, read
Section 13, decide the mode using 6.1, select the next task using 6.3, plan in 3–5
lines, build, verify with the 6.4 gates, record in Sections 7 and 13, commit and
push. Keep looping through iterations until the mode changes to FREEZE/SHIP/PITCH,
you need a human decision (6.2 step 10), or about 45 minutes of work is done. Then
stop and give me: mode, tasks completed, demo-check result, blockers, and the next
task.
```

### 10.3 INTEGRATE (every 2–3 hours)

```
Enter INTEGRATE mode per CLAUDE.md 6.6. Run make dev and make demo-check, walk the
full demo path, fix the top 3 breaks in my lane, add the rest as tasks for the
right lane, and log the results in Section 13.
```

### 10.4 TRIAGE (if behind)

```
Enter TRIAGE mode. Apply the Fallback Ladder (6.5) in order until make demo-check
passes all 8 steps. Cut every P2 task, record the cuts in Section 7 and the Log,
and keep main runnable after every commit.
```

### 10.5 SHIP (9:30 AM onward)

```
Enter FREEZE, then SHIP. Only fix demo-path bugs. Complete H5.1–H5.5: README with
data sources and licences from Section 11, a demo script per 8.1, secrets check,
everything merged to main, repo public. Give me a final pre-submission checklist
and the Devpost description text.
```

### 10.6 WEEKLY (startup mode)

```
Startup mode. Read CLAUDE.md Section 9 and Section 13. Determine the current mode
(DISCOVER/PILOT/NETWORK/EXPAND) from the gates. Propose 3 goals for this week tied
to the gate, break them into tasks in 9.3 with acceptance criteria, then run the
Core Loop (6.2) on the first engineering task. Update Section 13 when done.
```

### 10.7 Status update to paste back into Claude chat

```
Shieldworks status [time] | mode: [..] | done: [IDs] | demo-check reached: [step] |
blockers: [..] | hours left: [..] | question: [..]
```

---

## 11. Sources

| Topic | URL |
| --- | --- |
| StatCan Open Database of Businesses | https://www150.statcan.gc.ca/n1/pub/21-26-0003/212600032023001-eng.htm |
| Corporations Canada, federal corporations | https://open.canada.ca/data/en/dataset/0032ce54-c5dd-4b66-99a0-320a7b5e99f2 |
| Canadian Business Counts, Table 33-10-1097-01 | https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3310109701 |
| ISED industry statistics, NAICS 3327 | https://ised-isde.canada.ca/app/ixb/cis/businesses-entreprises/3327 |
| Controlled Goods Program directory | https://www.canada.ca/en/public-services-procurement/services/industrial-security/controlled-goods/find-individuals-organizations-registered-program.html |
| CWB certified companies | https://www.cwbgroup.org/directory/certified-companies |
| Nadcap / eAuditNet | https://www.eauditnet.com |
| IAF CertSearch | https://www.iafcertsearch.org |
| ITB overview (100%, thresholds, 5x/10x, DIA transfer) | https://ised-isde.canada.ca/site/ised/en/procurement-services/defence-and-marine-procurement/industrial-and-technological-benefits-itb |
| ITB policy (CCV, SMB requirement example) | https://ised-isde.canada.ca/site/industrial-technological-benefits/en/itb-policy |
| ITB model terms and conditions (direct/indirect, training §7.5.1) | https://ised-isde.canada.ca/site/ised/en/procurement-services/defence-and-marine-procurement/industrial-and-technological-benefits-itb/itb-toolkit/itb-model-terms-and-conditions |
| Gowling WLG (Value Proposition ≥ 10%, banking up to 10 years) | https://gowlingwlg.com/en/insights-resources/articles/2026/industrial-and-technological-benefits-policy |
| ITB contractor progress report | https://ised-isde.canada.ca/site/ised/en/procurement-services/defence-and-marine-procurement/industrial-and-technological-benefits-itb/projects-and-obligations/contractor-progress |
| CanadaBuys open tenders CSV (verify URL) | https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv |
| CPCSC Level 1 | https://www.canada.ca/en/public-services-procurement/news/2026/04/canadian-program-for-cyber-security-certification-level-1.html |
| CME workforce report (Sept 23, 2026) | https://cme-mec.ca/blog/new-cme-report-lower-vacancies-havent-solved-ontario-manufacturings-workforce-challenge/ |
| Conestoga Skilled Trades Campus (example partner, not affiliated) | https://www.waterlooedc.ca/blog/skilled-trades-conestoga |
| ICN Gateway (proof of model) | https://gateway.icn.org.au/how-it-works |
| Irving work packages (siloed prime portals) | https://shipsforcanada.ca/suppliers/upcoming-csc-work-packages |
| MLT Aikins ($81.8B, 70%, BDC, RDII) | https://www.mltaikins.com/insights/developments-in-canadas-defence-sector-mean-new-opportunities-for-businesses/ |
| Anthropic API docs (check current model IDs) | https://docs.claude.com/en/api/overview |
| Claude Code docs | https://docs.claude.com/en/docs/claude-code/overview |
| Google OR-Tools | https://developers.google.com/optimization |

---

## 12. Definition of done (hackathon)

- [ ] `make demo-check` passes all 8 steps from a fresh `make reset-demo`.
- [ ] The full demo path works in the browser with no console errors, including the shop view.
- [ ] Every real company is labelled "not affiliated"; synthetic shops and assumptions are labelled.
- [ ] README complete; data sources and licences credited.
- [ ] Video ≤ 5:00 uploaded; Devpost submitted; repo public; `main` up to date.

---

## 13. Live Status (Claude Code updates this section)

| Lane | Mode | Current task | Demo-check reached | Blockers | Updated |
| --- | --- | --- | --- | --- | --- |
| E | BUILD | public shops (Network) + outreach call list | live 8/8, fixtures 8/8 | teammate offline → Lane E runs Lane F too | Sat 20:30 |
| F | BUILD (run by E's session) | polish; public shops on Network | live 8/8 in browser | teammate's laptop dead | Sat 20:30 |

**Last integration:** Sat 20:28 — live engine + web (live mode) headless walkthrough: upload → route → scorecard → shop before → fund TP-01 → reload (state restored) → shop after; 42 API calls all 200, 0 console errors; demo-check live 8/8.

### Log (append-only)

```
HH:MM [lane] TASK-ID — result (demo-check: step)
19:26 [E] KICKOFF — CLAUDE.md saved with locked decisions (§1.1); repo jeojdi1/AFhacks created, public (demo-check: —)
19:31 [E] H0.1 — engine (FastAPI, uv py3.12, OR-Tools 9.15) + web (Next 16.3, React 19.2, shadcn, leaflet, recharts) scaffolded; make test, ruff, npm build/lint pass (demo-check: —)
19:31 [E] H0.2 — docs/api.md v0.1 + docs/decisions.md (demo-check: —)
19:44 [E] H1.1 — ODBus ingest: 115 candidates (Kitchener 103, Hamilton 12) (demo-check: —)
20:12 [B] H0.3 — scenario generator + 20 fixtures: $42.7M package, 36/4, obligation 11.5% → 13.4% after TP-01, headline "$96K training → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)"; drafts for H1.4/H1.5/H1.6 (demo-check: fixtures 8/8)
20:12 [E] H0.4 — demo_check.py 8 steps, live + --fixtures, catches 20/20 fixture mutations (demo-check: fixtures 8/8)
20:12 [E] H2.2/H2.4(solver)/H2.5 — tagger, CP-SAT + greedy, ledger; 130 tests pass on clean main (demo-check: fixtures 8/8)
20:12 [E] CONTRACT: GET /programs/{id}/jobs added (api.md §3, jobs.json fixtures) (demo-check: fixtures 8/8)
20:14 [F] H3.1–H3.5 — shell, store (live/fixtures), Program+map, Scorecard, Gaps hero, Shop+Network; review fixes; build+lint pass; headless walkthrough no console errors (demo-check: fixtures 8/8)
20:22 [E] H2.1/H2.3/H2.4/H2.6–H2.9 — engine + API; 255 tests; live demo-check 8/8 (demo-check: live 8/8)
20:22 [E] H5.5 prep — pitch.md, demo-script.md (shop view before+after funding), devpost.md with final numbers (demo-check: live 8/8)
20:28 [B] INTEGRATE — web live mode ↔ engine: full demo path in headless Chrome, 0 errors, reload restores state; H3.6 done (demo-check: live 8/8)
22:35 [I] APP-INTEGRATE — phone app /m (T1–T8) integrated: build+lint+tsc clean, 344 tests, ruff, app fixtures up to date; scripts/smoke_mobile.mjs 20/20 live + 20/20 fixtures; §2.11 rehearsal 30/30 live (2 contexts) + 30/30 fixtures (2 tabs); original desktop path 17/17 both modes; fixes: tab badge + LiveStepSync (live phone follows laptop route/reset); demo-script phone segment (4:15, 530 words), W47.1 wording (demo-script, pitch, devpost) (demo-check: live 8/8, fixtures 8/8)
01:00 [INT] UX-INTEGRATE — UX simplification (A–E) + portals/sign-in (H) + search/graph pages (I) + Neo4j graph and /search, /graph routes (G) + DND data fixes merged: copy-<agent>.ts keys merged into COPY (518 keys, no conflicts), store.tsx §9.3 strings (busy.*, "Claude read all 40 lines"), header portal links prefetch on, demo-script ON SCREEN cells + portals beat (4:40, 630 words), smoke script button names; make graph-load 4,490 nodes / 5,808 edges; 392 tests, ruff, npm build+lint, ux-check 71/71, smoke_mobile 20/20 live + 20/20 fixtures, /search + /graph engine neo4j (memory with Neo4j dead, /search/jobs memory by design) (demo-check: live 8/8, fixtures 8/8)
02:29 [INT] QA2-INTEGRATE — 6 fixers (shell, story, shopdesk, search, phone, engine) + integrator cross-file changes: shop desk phone link → /phone?to= QR (phone-connect reads ?to), See how / fund links → /m/shops/{id}/grow/{req}, prime desk "22 Canadian shops (19 small businesses)", feed funding request → /gaps#TP-0x then "Funded", upload toast "Parts list loaded: 40 lines", offer inbox NG-0xx + green Accept, network stats hidden under Real, banner gap, NextStep outline fix (Button variant prop), search card in-training clock, renewalFor held excludes pending_training, phone offer totals drop declined, 404 page in the shell, phone toasts bottom-centre no close, assumption chip 13px, shop profile size label; engine tenders_for drops equipment/stock, title-only q, vehicle spares, Ontario first (+test, fixtures regen, api.md), demo-script (100 km); smoke adds /m/college + /phone; npm build+lint, 412 tests, ruff, ux-check 71/71, smoke_mobile 24/24 live + 24/24 fixtures, flagship 5-axis/AS9100/London 3 shops (neo4j), multi-user rerun 14/14 (hero stays TP-01, sim marked, no competitor bell, phone↔laptop, Demo→Live no reset) (demo-check: live 8/8, fixtures 8/8)
04:06 [INT] cycle 1: 18 fixed (C1-1…C1-18) + integrator 6 (actions-store calls replaceOfferStatus directly, /m/prime "Qualify 4 welders under CSA W47.1", 2 contrast fixes (training-card id zinc-600, trainee seat stepper no opacity), fixtures /graph CWB W47.1 start node, capacity check-in no longer claims "over by" (engine over_by_hours unchanged, pending contract decision), prime desk Find another shop keeps ?mode/?api); gates: npm build+lint clean, tsc clean, 416 tests, ruff clean, fixtures-check 8/8, ux-check 71/71, smoke_mobile 24/24 live + 24/24 fixtures (demo-check: live 8/8 on 8770, fixtures 8/8)
06:10 [INT] cycle 2: 17 fixed (C2-1…C2-17; C2-3 finished by integrator) + integrator cross-area: StartDemo/AutoNextStep/UploadCard hide load-and-match for shop/college/trainee sessions (role line instead), "reoffered" EventKind + feed row ("You sent NG-005 to …"), engine GET /shops/{id} lists re-offered jobs for the new shop (reoffered_from; phone Offers tab shows them), simulate skips decisions on re-offered jobs, tick returns waiting (phone C2-13 keeps polling for TP-02), renewals/shop desk held = certIsHeld only, m-header "no engine needed", store error toasts deduped by id, decisionIsSimulated → lib/app/sim-flag, docs api.md (29 routes, reoffer route/reoffers/reoffered_to/event, tender closed + closing filter, waiting, Presenter tools) + app-spec + README/devpost 29 endpoints; gates: npm build+lint clean, tsc clean, 419 tests, ruff clean, fixtures-check 8/8, ux-check 71/71, smoke_mobile 24/24 live + 24/24 fixtures, evidence-pack test 3/3 (demo-check: live 8/8 on 8780, fixtures 8/8)
07:42 [INT] cycle 3: 14 fixed (C3-1…C3-14) + docs pass + integrator cross-area: /program and /gaps show EngineUnreachable when live load fails cold (loadFailed), StoryBanner numbered steps hidden for shop/college/trainee (useStoryChrome), phone activity-feed "Find another shop" adds from=m, shop profile certs counter gets offerTypes ("N held · X of Y needed for its offers"), stale renewals test updated (not-held never staged), ux-simplification.md header tagline/gaps.b/cert counter; gates: npm build (dead proxy :9) + lint clean, tsc clean, 419 tests, ruff clean, fixtures-check 8/8, TS unit 24/24, ux-check 71/71, smoke_mobile 24/24 live + 24/24 fixtures (demo-check: live 8/8 on 8790, fixtures 8/8)
09:18 [INT] AWARD-INTEGRATE — Accept → formal award package (paperwork: subcontract draft, NDA, CGP/CPCSC when required, quality auto-attached, FAI plan, CCV declaration, insurance; kickoff call booking with Northgate, .ics; all demo: no e-signature, no file stored, no invite sent; numbers unchanged): engine/award.py (GET award, POST documents/{key}, POST call; events paperwork_done/kickoff_booked; State.awards cleared by route/upload/reset) + 13 tests, docs/api.md §6.1; web/lib/award (useAward live + local fallback, muster.award.v1 cross-tab), award pages /m/shops/{id}/offers/{job}/award and /shops/{id}/offers/{job}/award (read-only ?from=prime), prime desk "Awards in progress" + /m/prime awards + feed/bell rows; integrator: EventKind +2, Award engine extras typed, slots shown in America/Toronto, call 30 min (.ics + copy), award strings Shieldworks, search fixtures regenerated after engine/search.py rename, smoke_mobile accepted phase (+3 award routes), demo-script 2:24–3:00 award beat (Portals Armatec search cut, 629 words); gates: npm build+lint clean, tsc clean, 432 tests, ruff clean, fixtures-check 8/8, ux-check 71/71, smoke_mobile 27/27 live + 27/27 fixtures (demo-check: live 8/8 on 8910, fixtures 8/8)
09:48 [INT] RENAME + DEMO-2MIN — product renamed Muster → Shieldworks everywhere user-visible (web, phone, docs, engine title, deck, call sheet; code identifiers MUSTER_* / muster.* keys unchanged; §1.1 #7), shield logo (header, flow diagram, app icon), search fixtures regenerated; docs/demo-2min.md (product-only live demo, ~1:45, Load → Match → Credit → Fund → phone Accept NG-031 → award package → book kickoff), rehearsed end to end on a production build (laptop + phone contexts, live engine, 0 console errors, phone updated <1 s after Fund); gates: npm build (dead proxy :9) + lint clean, tsc clean, 432 tests, ruff clean, fixtures-check 8/8, ux-check 71/71, smoke_mobile 27/27 live + 27/27 fixtures (demo-check: live 8/8 on 8930, fixtures 8/8)
10:12 [INT] DEMO-NOTICE — "This is a demo of Shieldworks" notice (once per session on the first page, desktop + phone; ?notice=1 to show again; skipped under automation) with the production security layer: 3 controls enforced now (no drawings, controlled jobs → CGP shops only, no personal data), 5 planned and labelled "not active in demo" (SSO + two-factor, per-company role-based access, TLS 1.3/AES-256 + key vault, Canadian CGP-registered hosting, tamper-evident audit log); /security page (this demo vs production table) + footer links; demo-2min.md opens on the notice (~1:55); gates: npm build (dead proxy :9) + lint clean, tsc clean, ux-check 71/71, smoke_mobile 27/27 live + 27/27 fixtures, 2-min rehearsal 0 console errors
```
