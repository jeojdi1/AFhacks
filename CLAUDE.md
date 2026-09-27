# MUSTER: The Complete Playbook (CLAUDE.md)

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

**Muster turns defence contracts into work and workers for small Canadian factories.**

| Module | What it does |
| --- | --- |
| **Route** | A prime uploads a parts list; Muster splits it into jobs and assigns each to a qualified small Canadian shop |
| **Credit** | A live ITB ledger: direct vs indirect credit, multipliers, SMB target, % of obligation met |
| **Train** | When no shop can take a job (missing certified workers or capacity), Muster proposes an ITB-eligible training package. "Funding" it unblocks the job and earns 5x credit (10x for Indigenous workforce development). |
| **Comply** | Every shop shows its certifications with source, date verified, status, and expiry |

**Two-sided.** Muster serves both sides of the same transaction:

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

- A prime must do business activity in Canada equal to **100% of the contract value**. The policy applies automatically above $100M; contracts of $25M–$100M are reviewed. *(ITB overview)*
- Credit is measured in **Canadian Content Value (CCV)**. A contract may carry a **mandatory SMB requirement**, e.g. 15% of the contract price. *(ITB policy)*
- **Direct** = work on the contract itself. **Indirect** = any other eligible activity. Excess credit can be applied elsewhere. *(Model terms)*
- The **Value Proposition** is generally weighted at **least 10%** of the bid score. Credits can be **banked for up to 10 years**. *(Gowling WLG)*
- **Multipliers:** regular work 1x, SME direct work 2x, eligible skills and training 5x, Indigenous workforce development 10x. *(ITB overview)*
- **Eligible training categories** (model terms §7.5.1):
  - `apprentice_sponsorship`: sponsorship costs for apprentices in a recognized apprenticeship program
  - `personal_certification`: certification for a **Canadian citizen or permanent resident** by a recognized trade body
  - `skills_program_contribution`: contribution to a skills program through a registered charity or nonprofit
  - `education_costs`: tuition, course fees and travel incurred in Canada
- ITB authority moved to the **Defence Investment Agency** on July 16, 2026. Contact: ITB-RIT@dia-aid.gc.ca.
- **Compliance gates:**
  - **Controlled Goods:** technical data counts as a controlled good. **Muster never stores drawings.** A job with `controlled=true` may only go to a CGP-registered shop.
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

- **0:00–0:45 Purpose.** Canada is spending $81.8B on defence and targets 70% of acquisitions going to Canadian firms. Every major contractor owes Canada 100% of its contract value in business activity, with up to double credit for small-business work. Yet primes can't find small shops, and shops lack welders.
- **0:45–1:30 Value (both sides).** Primes win bids (the Value Proposition is at least 10% of the bid score) and meet their obligations. Shops get work they'd never have seen. Workers get trained. Canada builds its industrial base.
- **1:30–4:30 Walkthrough:**
  1. Upload Northgate's parts list.
  2. Routing and map: show a controlled job going only to a CGP-registered shop.
  3. ITB Scorecard: SME 2x credit.
  4. Gaps: jobs blocked by the welder shortage.
  5. Fund training: credit jumps 5x and the jobs unblock.
  6. **Shop view:** the Elmira/Cambridge shop accepts Northgate's offer, sees "Get CWB W47.1 → 3 more jobs", sees its welders in training, and shows certification badges with source and date.
- **4:30–5:00 Next steps.** One prime, 20 shops in southwestern Ontario, and a college training partner. Australia's ICN Gateway proved the matching model; Canada needs its own, with the workforce built in.

### 8.2 One-paragraph pitch

"Canada is spending $81.8 billion on defence and wants 70% of it to go to Canadian firms. Every major contractor must spend the full contract value in Canada, and earns up to double credit for small-business work and five times the credit for training workers. But primes can't find small shops, and small shops don't have the welders to take the work. Muster fixes both. We route defence jobs to qualified local factories, and when a shop is short on workers, we set up training the prime funds for 5x credit. Primes win bids and meet obligations, shops get work and workers, and Canada gets its industrial base."

### 8.3 Judge Q&A

- **"Isn't this ICN Gateway, OMX, or Goverly?"** ICN connects suppliers to projects in Australia. OMX and consultant tools *tracked* obligations. Goverly scores suppliers. We're the only one we found that routes the work, calculates credit per job, and fixes the worker gap in one loop.
- **"Why hasn't it worked before?"** Primes could meet ITB through indirect activity. Now there's 2x credit for direct SME work and 5x for training, plus $81.8B in new spending.
- **"Security?"** We never store drawings; matching uses metadata only. Controlled jobs go only to CGP-registered shops. We'll register with the CGP before we handle any technical data.
- **"Why would a prime pay?"** The credit is worth far more than our fee, and a stronger Value Proposition helps them win the bid.
- **"Is training credit guaranteed?"** Only eligible categories under the ITB model terms count, and we confirm with the Defence Investment Agency.
- **"What happens Monday?"** Meetings with the DIA ITB team, a local prime, CME and Conestoga, then a one-prime pilot.
- **"Why would a shop trust a platform the prime pays for?"** *(draft)* It's free for shops, they see exactly why they were or weren't matched, and they can decline any offer. The prime's credit depends on the shop doing the work, so the prime needs the shop to succeed.
- **"What if the welder you trained leaves?"** *(draft)* The welder stays in Canada's workforce, which is the point of the 5x multiplier. An apprenticeship is registered with a sponsoring employer, so the training happens at the shop that needs the worker. How credit is counted for trainees who leave is something we confirm with the DIA (assumption).

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
- **Compliance loop (quarterly):** CGP registration status, Canadian hosting on a CGP-registered provider, privacy policy, access logs and audit trail, and CPCSC readiness if Muster will handle specified information.

### 9.3 Startup backlog

- [ ] **S1** Accounts and multi-tenancy (prime, shop, college, advisor roles), SSO, audit logs.
- [ ] **S2** Postgres, a Canadian cloud region, backups, secrets manager.
- [ ] **S3** Data pipeline: entity resolution (name, address, business number, domain), monthly crawls, shop profile claiming, CertSearch API integration.
- [ ] **S4** ITB engine validated by an ITB consultant; exports for annual reports; banking; regional targets.
- [ ] **S5** Train module v1: partner onboarding, evidence file generation (receipts, enrolment, completion), eligibility checklists per category.
- [ ] **S6** Comply module: document vault, expiry alerts (CGP, CPCSC, ISO, AS9100, clearances), readiness scores.
- [ ] **S7** CGP registration for Muster; controlled-data enclave (only after registration).
- [ ] **S8** Integrations: prime procurement systems (e.g. JAGGAER exports), CSV/ERP imports, STEP metadata extraction.
- [ ] **S9** Bid mode v2: Value Proposition builder.
- [ ] **S10** Europe: SAFE partner discovery via TED award data; Korea and Japan through partnerships.

### 9.4 Business model

- Primes pay a subscription per program plus a small fee on routed value.
- Training coordination is a service fee paid by the prime. Confirm with the DIA which costs count toward credit; Muster's own fee likely won't.
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
Read CLAUDE.md fully. You are starting the Muster hackathon build. Enter SETUP mode
and complete H0.1–H0.4 exactly as specified. Write /docs/api.md from Section 3,
create the fixtures (a realistic Northgate scenario), and create demo_check.py.
Update Section 13 (my lane row and the Log), commit and push with task IDs, then
summarize the API contract in 5 lines for my teammate.
```

### 10.2 RUN (the main loop; paste whenever Claude Code stops)

```
Run the Muster workflow from CLAUDE.md Section 6 for Lane [E or F]. Pull, read
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
Muster status [time] | mode: [..] | done: [IDs] | demo-check reached: [step] |
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
```
