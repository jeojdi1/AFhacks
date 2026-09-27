# Muster UX simplification spec: understood in 5 seconds per screen

Status: buildable spec, 2026-09-26 (night before the freeze).

**Inputs**
- Three persona walkthroughs, all in `?mode=fixtures`:
  - MP judge: `scratchpad/sweep/ux/mp/`
  - 55-year-old welding shop owner: `scratchpad/sweep/ux/welder/`
  - First-time visitor: `scratchpad/sweep/ux/first-time/`
- CLAUDE.md §1, §4, §5 and §8
- `docs/demo-script.md`
- `docs/app-spec.md` §2.1–2.8 (the phone app, `/m`)

**Goal.** A non-expert judge (an MP, an academic) watching the ≤5-minute video, or clicking around afterwards, can answer each screen's question within 5 seconds of seeing it.

**Hard constraint.** No engine number, fixture value, API shape or URL changes. This is copy, layout, and a few new presentational components.

**What the three personas agreed on**
1. **No "why".** Nothing says what problem Muster solves. `/` redirects straight into a CSV upload.
2. **Jargon without glosses.** ITB, SMB/SME (three names for one idea), CGP, CCV, CWB W47.1, "fixtures", "prime", "tagged", "routed".
3. **Numbers without meaning.**
   - "11.5%" reads as failing.
   - "Credit bigger than the work" reads as funny money.
   - "$5.1M" and "$9.1M" look like two different values for the same 3 jobs.
4. **Two competing navs and a confusing stepper.**
   - The stepper's red "current" looks like an error.
   - It can highlight two steps at once, can go backwards after a reload, and shows "5 Shop view" while you are on Network.
5. **The payoff is buried.**
   - The map is below five KPI cards.
   - "Fund training" is about 1,000 px down on `/gaps`.
   - The shop's best sentence ("Get CWB W47.1 → 3 more jobs worth $5.1M") is not at the top.
6. **Detail noise.**
   - 40 table rows, each with a "Claude (cached)" chip.
   - A six-number "shops failing each check" grid on each of 4 cards.
   - 7 "Unknown" certificate rows.
   - Grey not-held certificate pills that read as "not certified" on real companies.
7. **Bugs.**
   - `/?mode=fixtures` loses `?mode`, so it lands in **live** mode.
   - A discovered shop's profile highlights "Shop view" in the nav.
   - "1 of 6 in place" lights the 2nd dot, and the counter disagrees with the 8 rows shown.
   - The scorecard layout jumps after funding.
   - The multiplier chart is still empty 1.5 s after load.

---

## 1. The plain-language model (one sentence the whole app repeats)

**The sentence** (landing page, `<meta description>`, footer tagline, video title card):

> **Big defence companies owe Canada business equal to their contracts. Muster sends that work to small Canadian shops, and when shops are short of qualified welders, the defence company pays to train them.**

**Short form** (header tagline, ≤ 7 words):

> **Defence work for small Canadian shops**

**Credit explainer.** It appears verbatim wherever a credit number first appears on a screen (Scorecard, Fund moment, Program stats tooltip):

> **Credit isn't cash.** It's how the government counts Northgate's Canadian business toward the $500M it owes. Small-business work counts double. Training counts 5×.

**The story in five steps.** This is the nav, the stepper and the video order:

| # | Nav label | Question the screen answers in 5 s | URL (unchanged) |
| --- | --- | --- | --- |
| 1 | **Parts list** | What does Northgate need made? | `/program` (before matching) |
| 2 | **Where the work goes** | Which small shops got the work, and what's stuck? | `/program` (after matching) |
| 3 | **Credit earned** | How much of what Northgate owes is covered? | `/scorecard` |
| 4 | **Fix the welder gap** | Why are 4 jobs stuck, and what does $96K of training fix? | `/gaps` |
| 5 | **The shop's side** | What does the small shop see and get? | `/shops/syn-012` (and `/m/shops/syn-012`) |
| extra | **Shops directory** | Who is out there in real public data? | `/network`, `/shops/pub-*` |

**Rules for numbers.** These apply everywhere.
- **Compact money** ($36.1M, $96K) is the default. Exact dollars appear only in a `title` tooltip or inside "details".
- **One idea, one number, one pairing.**
  - The 3 unblocked jobs are always "**$5.1M of work → $9.1M credit**", never one number without the other.
  - The obligation is always "**$X of $500M (Y%)**".
- **Say what a percentage is of**, in words. For example: "11.5% of what Northgate owes", not "11.5% met".
- **No derived "return" ratios.** Never "100× its money". The $9.1M comes from real work that Northgate also pays for.

---

## 2. Glossary rule and plain labels

**The rule.** An acronym never appears on screen by itself.
- On a screen's **first** use, show **plain label (ACRONYM)**, wrapped in `<Term>` so hover or focus shows the tooltip.
- After that, the plain label alone is enough.
- Exceptions, where the label is required as written:
  - "Simplified ITB rules for demo" (CLAUDE.md §4)
  - The fund-moment headline (§10)
  - Package IDs like `TP-01` and job IDs like `NG-004`, as small secondary text only
- `Term` must render a real `title` fallback as well as the tooltip. Today the `abbr` has no `title`, so hover shows nothing when the tooltip fails.

**Source of truth.** A new file, `web/lib/ui/plain.ts`, holds a `PLAIN` map. `GLOSSARY` in `web/lib/format.ts` stays for back-compat, and `Term` switches to reading `PLAIN`.

| Key | Visible label (first use) | Visible label (after) | Tooltip (exact) |
| --- | --- | --- | --- |
| `ITB` (policy) | Canada's defence-contract rule (ITB) | the ITB rule | Industrial and Technological Benefits: a defence company that wins a big federal contract must do business in Canada equal to the contract's value. Simplified for this demo. |
| `obligation` | What Northgate owes Canada | owes Canada | The full contract value, $500M, that Northgate must match with Canadian business. It's a promise, not a bill. |
| `ITB credit` | Canada work credit (ITB) | credit | How the government counts Northgate's Canadian business toward the $500M. Not cash. |
| `obligation_met_pct` | % of what Northgate owes | % of what's owed | Credit earned so far ÷ $500M. |
| `SMB` / `SME` (one term everywhere) | small business (SMB) | small business | Small or medium-sized business. Demo rule: under 500 employees. Official ITB line: 250 full-time staff, or 500 with affiliates. |
| `SMB target` | Small-business target | small-business target | 15% of what's owed ($75M) must involve small businesses. |
| `SME share` | Went to small businesses | to small businesses | Share of matched work value that went to small businesses. |
| multiplier 1×/2×/5×/10× | counts 1× / counts double (2×) / counts 5× / counts 10× | same | Some work counts extra toward what's owed: small-business work on the contract 2×, the company's cash for eligible training 5×, Indigenous workforce development 10×. |
| `CCV` | Canadian content | Canadian content | The share of a job's value made in Canada. Only that share earns credit. |
| `CGP` | Security-cleared (Controlled Goods) | security-cleared | Controlled Goods Program: federal registration a shop needs before it may handle controlled defence parts. |
| `controlled` (badge text stays "Controlled") | Controlled part | controlled | A controlled defence part. Only security-cleared shops may make it. Muster never stores drawings; it matches on basic job details only. |
| `CWB W47.1` | Welding certification (CWB W47.1) | welding certification | Canadian Welding Bureau company certification for structural welding. The shop is certified, it needs a qualified supervisor and approved procedures, and each welder passes a test for their own ticket. |
| `CPCSC L1` | Cyber-security self-check (CPCSC L1) | cyber self-check | Canadian Program for Cyber Security Certification, level 1: 13 controls, self-assessed, no public registry. |
| `AS9100` | Aerospace quality certificate (AS9100) | AS9100 | Quality standard for aerospace and defence suppliers. |
| `ISO9001` | Quality certificate (ISO 9001) | ISO 9001 | Baseline quality-management certificate. |
| `NADCAP` | Special-process accreditation (Nadcap) | Nadcap | Aerospace accreditation for processes such as heat treating and coatings. |
| `prime` | defence company (the "prime") | defence company | The company that won the government contract. Here: Northgate Land Systems, which is fictional. |
| `route` / `routed` / `assigned` | match / matched | matched | Muster offers each job to one qualified shop. There is no bidding. |
| `blocked` | stuck | stuck | No qualified shop has free capacity for this job yet. |
| `tagged` | read by Claude | read by Claude | Claude read each parts-list line to find its process, material and the certificates it needs. |
| `score` | Match 94/100 | match | How well the shop fits: right machines, distance, how soon it can start, and credit earned. |
| `direct` / `indirect` | Work on this contract / Other eligible activity | same | Direct = making parts for this contract. Indirect = other eligible activity, such as training. |
| `synthetic` (chip stays "Synthetic") | Synthetic demo shop | Synthetic | Made up for this demo. Only synthetic shops receive demo offers. |
| `discovered` / public | Real shop · public data | real shop | Found in public data (Statistics Canada ODBus, company websites). Public data — unverified — not affiliated. Never sent work. |
| `fixtures` / `Live API` | Demo data / Live | same | Demo data replays saved engine answers. Live calls the running engine. |
| `h/week` | hours a week | hrs/wk | none |
| `NAICS` | Industry code | hidden in Story mode | North American Industry Classification System code. |
| `TP-01` | Training plan TP-01 (small, secondary) | TP-01 | none |

**Words we stop using on screen:** "obligation" on its own, "ITB obligation", "SMB target" on its own, "SME share", "CCV", "routed", "tagged", "fixtures", "Program: Northgate work package", "PRIME SIDE", "SHOP SIDE", "Claude (cached)" (per row), "Score", "ITB value", "keyword rules".

**Fix while here.** `GLOSSARY.SME` currently says "under 250 employees". CLAUDE.md §4's demo rule is "under 500", with the official line at 250 FTE (500 with affiliates). Use the `PLAIN.SMB` tooltip above.

---

## 3. Navigation: one numbered story, current step highlighted, "Next step →" everywhere

### 3.1 Layout (replaces today's nav plus stepper plus context strip)

**Row 1: header (64 px), `web/components/shell/app-header.tsx`**
- Left: the Muster logo, then the tagline "Defence work for small Canadian shops" (hidden below 1024 px).
- Right, in order:
  - **Story mode** switch (§6)
  - **Shops directory** (`/network`)
  - **Phone app** (`/m`; the label was "Phone view")
  - Activity bell
  - Mode pill, reading **"Demo data"** or **"Live"**
  - **Start over** (was "Reset demo"; same `reset()` call, `aria-label="Start over (reset the demo)"`)
- The "PRIME / SHOP" group labels are removed from the nav.

**Row 2: story bar (48 px), `web/components/shell/program-context-bar.tsx`, rewritten**
- Left: the numbered steps: `1 Parts list · 2 Where the work goes · 3 Credit earned · 4 Fix the welder gap · 5 The shop's side`.
- Right: the **promise meter**, "Credit so far **$57.5M** of $500M" with a 120-px mini bar and "11.5%". It reads `useDemo().ledger`.
  - Before matching, it shows "Northgate owes Canada **$500M** of business".
  - After funding, it animates to $67.1M / 13.4% on whatever page you are on.
- On `/shops/syn-012` the bar gets a teal tint and the step-5 pill reads "5 The shop's side". The steps stay visible, so viewers still know where they are in the story.
- On `/network` and `/shops/pub-*` no step is highlighted. A small label on the left reads "Extra · Shops directory · not part of the 5-step story".

### 3.2 Step state rules (fixes the backwards and double-highlight bugs)

State comes only from `pathname` plus `useDemo().stage`, never from component-local state.

| Step | "Current" when | "Done" when | Href |
| --- | --- | --- | --- |
| 1 Parts list | `/program` and stage ∈ {empty, uploaded} | stage ≥ uploaded | `/program` |
| 2 Where the work goes | `/program` and stage ≥ routed | stage ≥ routed | `/program#map` |
| 3 Credit earned | `/scorecard` | stage ≥ routed | `/scorecard` |
| 4 Fix the welder gap | `/gaps` | stage = funded | `/gaps` |
| 5 The shop's side | `/shops/<demoShopId>` | stage = funded | `/shops/<demoShopId>` |

- **Exactly one** pill is "current", or none, and only on the page it names.
- Current style: filled **slate-900** background with white text (neutral, not brand red).
- Done style: green check (existing `assigned` tokens).
- Not-yet style: outline.
- **No red anywhere in the stepper.**
- `aria-current="step"` goes on the current pill.

**Nav highlight fix.** `/shops/pub-*` highlights **Shops directory**, never the step-5 pill.

### 3.3 `NextStep` (persistent "Next step →")

Every story page ends its banner (§5.0) with **one** primary button, and repeats it at the bottom of the page. It is **not sticky**: at 1280×720 the toast stack sits bottom-right beside the Fund row (demo-script checklist item 9).

| Page / state | Next-step button | Action |
| --- | --- | --- |
| `/` any state | **Start the demo** (stage empty), or **Continue the demo →** | See §4 |
| `/program`, empty | **Load Northgate's parts list** | `uploadParts()` |
| `/program`, uploaded | **Match jobs to shops →** | `route()` |
| `/program`, routed/funded | **See the credit Northgate earned →** | `/scorecard` |
| `/scorecard` | **Fix the 4 stuck jobs →** (after funding: **See the shop's side →**) | `/gaps` / `/shops/syn-012` |
| `/gaps`, before funding | **↓ Fund the training below**, which scrolls to and focuses the TP-01 Fund button (it does **not** fund) | scroll |
| `/gaps`, funded | **See the shop's side →** | `/shops/syn-012` |
| `/shops/syn-012` | **Open the shop's phone →** | `/m/shops/syn-012` (keeps `?mode`) |
| `/network` | **Back to the story →** | the first step that isn't done, else step 5 |

Every internal link built by these components **preserves `?mode=` and `?story=`** when they are present. Add a `withParams(href)` helper in `web/lib/ui/steps.ts`.

---

## 4. Landing page `/`: explain it in 3 panels, then one button

**File:** `web/app/page.tsx`. It no longer redirects, which **also fixes the `?mode` loss**, because the store reads `?mode` on the client. It renders `web/components/landing/landing-view.tsx`.

**Layout at 1280×720 (everything above the fold)**
- **H1 (40 px):** "Defence contracts, turned into work for small Canadian shops."
- **Sub (18 px):** the §1 sentence.
- **Three panels in a row** (they stack below 768 px). Each has a large lucide icon, a bold title and a body of 2 lines at most:
  1. `Landmark` icon.
     - **Title:** "Big defence companies owe Canada business."
     - **Body:** "Win a $500M contract, and you must do $500M of business in Canada. Work with small businesses counts double."
     - **Caption:** "Canada's ITB rule, simplified for this demo"
  2. `Factory` icon.
     - **Title:** "Muster finds small shops that can make the parts."
     - **Body:** "It reads the parts list, checks each shop's machines and certificates, and offers each job to one qualified shop. No bidding."
  3. `HardHat` icon.
     - **Title:** "Short of qualified welders? The defence company pays to train them."
     - **Body:** "Training counts 5× toward what it owes, and the stuck work goes ahead."
- **Flow diagram** (§7.1), compact variant, under the panels.
- **Primary button (56 px, brand):** **Start the demo**
  - Sub-caption: "Loads Northgate's 40-part list and matches it to shops · about 5 seconds"
- **Secondary text links:** "Skip to the shop's side →" (`/shops/syn-012`) · "Browse 108 shops →" (`/network`) · "Open the phone app →" (`/m`)
- **Honesty line (13 px, muted):** "Northgate Land Systems is fictional. Demo shops are synthetic. Simplified ITB rules for demo. Real shops: public data — unverified — not affiliated."

**"Why now" strip (optional, P2; below the fold, each fact with a source link)**
- "$81.8B more for defence over five years" (Budget 2025)
- "70% of defence buying to go to Canadian firms by 2035" (Defence Industrial Strategy, Feb 2026)
- "National Defence signed 59,102 contracts over $10K worth $82.9B, Jan 2021–Jun 2026" (Proactive Publication, open.canada.ca, OGL). The figures come from `data/processed/national/dnd_contracts_summary.json`: `headline.contracts`, `headline.total_value` and `as_of`.
- **Do not** cite the Job Bank welder outlook here. "Very limited" describes job prospects for welders, not a shortage (demo-script wording rule).

**"Start the demo" behaviour** (`RunDemoButton`, §9 Agent A)
1. `stage === "empty"`: `await uploadParts()`, then `await route()`, then `router.push(withParams("/program#map"))`.
2. `stage === "uploaded"`: `await route()`, then push.
3. `stage ∈ {routed, funded}`: the label becomes **Continue the demo →** and pushes to the next step that isn't done. A small **Start over** link calls `reset()`.
- While busy, the button shows a spinner and the existing `busy` text: "Reading the parts list…" and then "Matching jobs to shops…".
- On error it uses the existing toast. Nothing here changes store logic; the button only calls existing `useDemo()` methods.

**Video.** The landing page can replace the 0:00–0:37 title card. The voiceover is unchanged; only the ON SCREEN cell changes (integrator edit, §9.3).

---

## 5. Per-screen rewrites

### 5.0 The `StoryBanner` pattern (every story page)

A single card directly under the story bar, above everything else on the page, with the full width of the content column. It holds four lines:

1. **Eyebrow:** "Step 2 of 5 · Where the work goes". On the shop side it is teal and reads "Step 5 of 5 · The shop's side".
2. **Summary (20 px, semibold, ≤ 2 lines):** the key number, **in words**.
3. **"Look at:"** (15 px, muted, prefixed with an `Eye` icon): the one thing to notice.
4. **Right-aligned:** the `NextStep` button (§3.3).

It is always visible, in Story mode and in detail mode alike. The old page `SectionHeader` title stays below it as a smaller H1 using the new titles.

**Empty states perform the prerequisite in one click.** `EmptyState` gains an `action={<RunDemoButton upTo="routed" />}` usage. It replaces every "Go to Program" or "Route the parts list first" link:
- Scorecard, empty: **Title** "No credit yet: nothing has been matched." **Body** "Load Northgate's parts list and match it to shops, and the credit appears here." **Button** **Load and match the parts list** (does both, then stays on `/scorecard`).
- Gaps, empty: **Title** "Nothing is stuck yet: nothing has been matched." Same body pattern, same button (stays on `/gaps`).
- Shop, empty: **Title** "Northgate hasn't sent offers yet." **Button** **Load and match Northgate's parts list** (stays on the shop).
- Shop "after" states need funding, which is **never** automatic. If the shop page is opened routed but unfunded, the readiness card's own link reads "See how Northgate can fund this →" (`/gaps`).

### 5.1 `/program`, step 1 (empty, uploaded)

**Page H1:** "Northgate's parts list" (was "Program: Northgate work package"; the eyebrow "Route" is removed).

**Banner, empty**
- **Summary:** "Northgate Land Systems (a fictional defence company) owes Canada $500M of business. Its first parts list is ready to load."
- **Look at:** "Each line is one part Northgate needs made in Canada."
- **Next:** **Load Northgate's parts list**

**Banner, uploaded**
- **Summary:** "40 parts worth $42.7M. Claude read every line to find the process, material and certificates each part needs."
- **Look at:** "5 are controlled parts. Only security-cleared shops may make them."
- **Next:** **Match jobs to shops →**

**Upload card**
- Main button: "Load Northgate demo parts list (40 lines)" becomes **"Load Northgate's parts list (40 parts)"**.
- The CSV dropzone and column names collapse behind a text link, **"Use your own parts list (CSV)"**. It is hidden in Story mode.

**Stats after upload:** "40 parts · $42.7M of work · 5 controlled (security-cleared shops only)".

**Toast** (string built in `store.tsx`, integrator one-liner, §9.3): "Claude (cached) 40 · keyword rules 0" becomes **"Claude read all 40 lines"**. If some lines used keyword rules: **"Claude read 38 lines · 2 read by keyword rules"**.

### 5.2 `/program`, step 2 (routed, funded)

**Banner**
- **Summary:** "**36 of 40 jobs** are matched to **22 small Canadian shops**: $36.1M of work, 90% of it to small businesses. **4 welding jobs are stuck.**"
  - The 22 is `new Set(assignments.map(a => a.shop_id)).size`. It is derived for display, not a new engine number.
- **Look at:** "The map: each line runs from Northgate's plant in London, ON to the shop making the part."
- **Next:** **See the credit Northgate earned →**. Secondary link: "Why are 4 stuck? →" (`/gaps`).

**Order below the banner:** Big numbers, then the Map (full width), then the Jobs table.

**Big numbers.** Story mode shows 3 cards. Detail mode keeps today's 5, relabelled.

| Card | Value | Sub |
| --- | --- | --- |
| Jobs matched | **36** of 40 | to 22 small Canadian shops |
| Jobs stuck | **4** | no qualified welders free · **See the fix →** |
| Work kept in Canada | **$36.1M** | 90% to small businesses (counts double) |
| *(detail only)* Controlled parts | **5 of 5** | all to security-cleared shops |
| *(detail only)* Went to small businesses | **90%** | their work counts double |

**Map.** Title "Where the work goes"; subtitle "Northgate's plant in London, ON and the 22 shops making its parts."

Legend strip in words: "**Solid green line**: job matched · **Dashed purple line**: controlled part, security-cleared shop · **Grey dot**: shop with no job yet · **Amber dot**: shop that could take a stuck job if it had the certification". Include the last item only if the map already draws it.

**Jobs table**
- **Title:** "The 40 jobs".
- **Subtitle:** "Read by Claude · each job offered to one qualified shop, no bidding". This replaces the per-row "Claude (cached)" chips; tag source is shown once, as demo-script 0:53 requires.
- **Story mode shows 6 rows,** in this order:
  - The 4 **stuck** rows (NG-031…034), with their reason in plain words, e.g. "Stuck: both certified welding shops are full (18 and 16 hrs/wk free, 40 needed)".
  - **NG-004** (the controlled job), pinned.
  - The largest matched job.
  - Button: **"Show all 40 jobs"**.
- **Columns:**

  | Old | New |
  | --- | --- |
  | ID | Job (NG-004 small, description large; part number hidden in Story mode) |
  | Shop | Matched shop (+ Synthetic chip) |
  | Score | Match (e.g. "79/100") |
  | Value | Work value |
  | ITB credit | Credit toward $500M |
  | multiplier chip | "counts double" or "counts 1×" (text chip, not "ITB credit 2x") |

- **Column-header tooltip on "Credit toward $500M":** "Work value × Canadian content × 2 for small businesses. That's why credit can be bigger than the work. Credit isn't cash."

**"Why?" popover** (`why-popover.tsx`). Keep the Controlled badge, Synthetic label, CGP badge and **top three reasons** (demo-script 1:19).
- **Title:** "Why Tessellate Precision Machining?"
- **Three plain checks** (✓ icon, green): "✓ Has the right machines: 5-axis milling and aerospace quality certificate (AS9100)" · "✓ Security-cleared (Controlled Goods): required for this part" · "✓ Small business: its work counts double"
- **Line:** "Match **93/100**". Behind "How the match is scored": "Right machines 93 · Distance 60 · Can start soon 42 · Credit earned 100".
- **Credit line:** "Credit: $2.81M of work × 90% Canadian content × 2 (small business) = **$5.06M**". Exact dollars go in the `title` tooltip.
- **Controlled footnote (keep):** "Drawings are never stored in Muster. It matches on basic job details only."

### 5.3 `/scorecard`, step 3 "Credit earned"

**Page H1:** "Credit earned" (was "ITB Scorecard"). Keep the chip "Simplified ITB rules for demo". The rules-version chip `rules demo-2026-09-26` moves into details.

**Banner**
- **Summary:** "Northgate owes Canada $500M of business. This first parts list earns **$57.5M of credit: 11.5% of what it owes.**"
- **After funding:** "Training and the 3 unstuck jobs lifted Northgate to **$67.1M: 13.4% of what it owes.**"
- **Look at:** "The 'counts double' bar: small-business work earns twice the credit."
- **Next:** **Fix the 4 stuck jobs →**. After funding: **See the shop's side →**.

**Order:**
1. Credit explainer strip (§1 text, `Info` icon, blue-50 background)
2. Big meter
3. "How one job earns credit"
4. "What each kind of work counts for" chart
5. Small-business target
6. Details

**Big meter** (`obligation-meter.tsx`)
- **Label:** "What Northgate owes Canada"
- **Value:** "**$57.5M** of $500M"
- **Right side:** "**11.5%**"
- **Caption:** "From this one parts list. Northgate's full contract will bring many more." This stops 11.5% reading as failing.
- **After funding,** green chips under the bar: "**+$480K** from training (counts 5×)" · "**+$9.1M** from 3 jobs that were stuck ($5.1M of work)".
- **The percentage stays in the same place.** Reserve the chip row's height at all times (`min-h`) so nothing reflows. This fixes the persona "layout jumped" bug.

**"How one job earns credit"** (`worked-example.tsx`). It moves directly under the meter and is always visible.
- Four tiles: "$2.81M work" × "90% Canadian content" × "2 (small business)" = "$5.06M credit".
- Caption: "Every number on this page is built this way."

**Chart** (`multiplier-chart.tsx`)
- **Title:** "What each kind of work counts for" (was "Credit by multiplier").
- **Bars:** "Regular work · counts 1×" · "Small-business work · counts double (2×)" · "Training · counts 5×" · "Indigenous workforce training · counts 10×".
- **Empty bars:** "Nothing yet · see step 4" (was "No credit yet · unlock via training"). Only the training bar links to `/gaps`. The 10× row gets no link, so four red links no longer compete.
- **Animation ≤ 400 ms.** Bars render at final width immediately when `prefers-reduced-motion` or when Story mode loads with `?capture=1`. This fixes the chart that was still empty at 1.5 s.

**Small-business target** (`smb-meter.tsx`)
- **Label:** "Small-business target"
- **Value:** "**$27.3M** of $75M (36%)". After funding: $31.9M (43%).
- **Caption:** "Rule: 15% of what's owed must involve small businesses."
- The basis note "CCV of SME work before multipliers (assumption)" becomes "Counts small-business work before the 2× bonus (assumption)", keeping `AssumptionTag`.

**Details** (collapsed in Story mode; one `Details` per item):
- **"Work on this contract vs other activity"** (credit split, direct and indirect), with a 1-line note: "Extra credit can be kept for up to 10 years (simplified)."
- **"Every credit entry (36)"**: the ledger table.
- Rules-version chip.

### 5.4 `/gaps`, step 4 "Fix the welder gap"

**Page H1:** "Fix the welder gap" (was "Gaps & Training"). The subtitle paragraph is replaced by the banner.

**Banner, before funding**
- **Summary:** "**4 welding jobs ($6.6M) are stuck.** The shops with certified welding are full, and the others don't have the certification. **Training 4 welders at Tallowfield Fabricating unsticks 3 of them.**"
- **Look at:** "The training card: what Northgate pays, and what it gets back."
- **Next:** **↓ Fund the training below** (scrolls; §3.3)

**Banner, after funding**
- **Summary:** "Northgate funded 4 welder training seats. **3 stuck jobs ($5.1M of work) can go ahead;** 1 is still stuck."
- **Next:** **See the shop's side →**

**Order, before funding:**
1. **Training hero card (TP-01)**, full width, **Fund button above the fold at 1280×720**
2. "4 stuck welding jobs" compact list
3. "Another option" (TP-02, collapsed in Story mode)

**Training hero card** (`suggestion-card.tsx`, `variant="hero"`)
- **Eyebrow:** "The fix · Training plan TP-01"
- **Title (24 px):** "4 welder training seats at Tallowfield Fabricating (Woolwich)"
- **Sub:** `packageTitle(pkg)`, i.e. "Qualify 4 welders (FCAW/GMAW) under CSA W47.1 at Tallowfield Fabricating (Woolwich)", plus "The company also needs a qualified supervisor and approved procedures."
- **Three-step equation** (big tiles, left to right, arrows between):
  1. "**Northgate pays $96K**" · "4 seats × $24K incl. stipend" `AssumptionTag`
  2. "**Counts as $480K credit**" · "training counts 5×"
  3. "**Unsticks 3 jobs**" · "$5.1M of work → +$9.1M credit"
- **Line (muted):** "Who pays? Northgate, from its own budget. It earns credit toward what it owes, not cash back."
- **Partner:** "Conestoga College (example, not affiliated)"
- **Button:** **Fund training** (label unchanged).
- The "Shop requested · 9:44 PM" badge stays, top-right of the card.
- **Details** ("Rules behind this"): "Eligible training type: welder certification for Canadian citizens or permanent residents (ITB model terms §7.5.1)", "Training credit is capped at 25% of what's owed", and "ITB is run by the Defence Investment Agency since July 16, 2026".

**Stuck jobs list** (`blocked-job-card.tsx`, `variant="compact"`). One row per job:
- "**NG-031** · Hull bracket weldment · $1.7M · Stuck: both certified welding shops are full (18 and 16 hrs/wk free, 40 needed)"
- The chip "Unsticks with TP-01" shows on the 3 it fixes.
- The "Shops failing each check" grid goes behind **"Why no shop can take it"**. It becomes words, and zero counts are omitted: "26 don't do this welding process · 9 can't fit the part size · 28 lack the certification · 10 are full".
- **Stat cards** reduce to 2 in Story mode: "Stuck jobs **4** · $6.6M" and "Unstuck by training **0**". "Top reason" becomes the banner text.

**Fund moment** (`fund-moment.tsx`). The **headline stays exactly** "$96K training → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)" (engine `result.headline`).
- **Add a caption under it:** "$5.1M of work that was stuck can now go ahead. Credit isn't cash: small-business work counts double, and training counts 5×."
- **Replace the small "+1.9 pts"** with the before/after bar (§7.2): "**11.5% → 13.4%** of what Northgate owes", about 32 px tall.
- **Keep** "Stuck jobs 4 → 1". Add "Still stuck: **NG-034**. The only certified shop that fits is full."
- **Remove** the visible exact dollars "was $57,541,498 / +$9,602,400". Keep them in `title`.
- **Counter:** fixed width (`tabular-nums` plus `min-w-[12ch]`) so it never reflows.
- "SMB target progress" becomes "Small-business target: 36% → 43%".

### 5.5 `/shops/syn-012`, step 5 "The shop's side"

**Page H1:** the shop name plus a "Synthetic demo shop" chip. The story bar is teal.

**Banner, before funding** (teal)
- **Summary:** "This is what **Tallowfield Fabricating**, a synthetic small shop in Woolwich, sees: **2 job offers from Northgate worth $1.7M**, and one certification that would win 3 more."
- **Look at:** "The top card: what one step would unlock."
- **Next:** **Open the shop's phone →**

**Banner, after funding**
- **Summary:** "**Northgate paid to train 4 of Tallowfield's welders.** The 3 jobs that were stuck ($5.1M) are now offered to Tallowfield. They start once the welders qualify."
- **Look at:** "3 new offers, marked New, and 4 welders in training."

**Order:** readiness hero, then offer inbox, then 4 stats, then certifications, then capabilities.

**Readiness hero**
- **Before funding.** Heading kept verbatim for the demo: "**Get CWB W47.1 → qualify for 3 more jobs worth $5.1M**".
  - Plain line under it: "Welding certification from the Canadian Welding Bureau: the company is certified, and each welder passes a test. Northgate can pay for the welder training."
  - Link: "See how Northgate can fund this →" (`/gaps`).
- **After funding.** The card shows the next item (ISO 9001). **Never show the CWB message after funding** (demo-script rule).

**Offer inbox** (`offer-inbox.tsx`)
- **Title:** "Job offers from Northgate" (was "Offer inbox")
- **Sub:** "No bidding: each job was offered only to you."
- Buttons keep **Accept**. New offers keep the "New" chip.

**Stats** (4)
- "Offers from Northgate **$1.7M** · 2 jobs"
- "Why Northgate wants you: **$3.1M credit** · your work counts double toward what it owes" (was "ITB credit it earns the prime")
- "One step away **$5.1M** · 3 more jobs"
- "Welders in training **0**". After funding: **4** · "paid by Northgate".

**Certifications** (`certifications-card.tsx`)
- **Title:** "Certificates"
- **Story mode shows only:** certificates held, plus certificates required by this shop's offers or one-step jobs. The rest collapse into one line: "5 more not held · show". "Unknown" becomes "Not held". The illustrative-date note stays.
- **Fix the counter** so it is computed from the rows actually listed ("1 of 3 needed in place"), and the lit dot equals the count.
- **Hide NAICS** in Story mode. Detail mode shows it as "Industry code".

### 5.6 `/network` and `/shops/pub-*`, the "Shops directory" (extra)

**Page H1:** "Canada's hidden supply base"

**Banner** (no step)
- **Summary:** "**108 shops in southwestern Ontario:** 30 synthetic demo shops that receive the demo's offers, and **78 real manufacturers found in public data** (unverified, not affiliated, never sent work)."
- **Look at:** "Filter to real shops to see who's already out there."
- **Next:** **Back to the story →**

**Search, first control, full width:** placeholder "Is your shop here? Search by name or city".

**Filters:** "Demo shops (synthetic) · 30" · "Real shops · discovered from public data · 78". The exact phrase "Discovered from public data" stays in the second filter for the demo-script click.

**Stats.** Story mode shows "Small businesses **N**" and "Security-cleared (Controlled Goods) **N**". "Weekly capacity 2,548 h" is detail only, relabelled "Weekly shop hours (demo shops)".

**Certificate pills**
- Show **only held or stated** certificates.
- Public shops add muted text "Others not listed". Never show grey not-held pills on real companies.
- Add a one-line legend above the table: "Green: held (demo data) · Blue: stated on the company's website (unverified)".

**Discovered profile** (`/shops/pub-*`)
- **Nav:** Shops directory is highlighted.
- **"Claim this profile"** opens a `Dialog`: "Coming soon. Shops will claim and verify their own profile. Nothing is collected in this demo." It collects no email and has no form fields.
- **Sources:** file paths such as `data/processed/candidates.csv` move behind a "Sources" disclosure.
- Keep the "Public data — unverified — not affiliated" badge and "Not onboarded: no offers" line exactly.

**P2.** A pin map of the 78 public shops above the table, reusing `shop-map.tsx` in read-only mode with a grey pin style.

### 5.7 Global chrome

- **Mode pill:** "Demo mode · fixtures" becomes **"Demo data"**, and "Live API" becomes **"Live"**.
  - The popover body drops "FastAPI" and the localhost URL behind a small "Advanced" disclosure.
  - Body text: "Demo data replays saved answers, so nothing can break on camera. Live uses the running engine."
- **Footer:** unchanged credits ("Simplified ITB rules for demo · Public data unverified · Not affiliated · Data: Statistics Canada ODBus (OGL)"), with the §1 short sentence prepended.
- **Phone width (390 px) on desktop routes:**
  - The story bar scrolls horizontally, with the current pill auto-scrolled into view.
  - The promise meter drops to its own line.
  - "Phone app" stays visible as an icon.
  - On the shop page, the offer inbox comes before the stat cards.

---

## 6. Story mode

**Purpose.** A single switch that turns every screen into narrative plus big numbers for the video and for judges. Detail is always one click away.

**State**
- File: `web/lib/ui/story-mode.tsx`, exporting `StoryModeProvider` and `useStoryMode(): { story: boolean; setStory(v: boolean): void }`.
- **Default ON.**
- The URL `?story=0` or `?story=1` overrides the default and is persisted.
- Persisted in `localStorage["muster.ui.story"]`, with every read and write in try/catch. It renders correctly if storage throws.
- It sets `data-story="on|off"` on `<html>` for CSS hooks.
- The provider is mounted in `web/app/layout.tsx` inside `DemoProvider`.

**Toggle**
- A header switch labelled "Story mode".
- Tooltip: "Story mode hides detail tables so the story is easy to follow. Turn it off to see everything."
- Keyboard shortcut `S` (ignored while an input is focused).

**`Details` component** (`web/components/muster/details.tsx`)
- Props: `<Details summary="Show all 40 jobs" storyHidden>`.
- In Story mode: collapsed, showing a `ChevronDown` button with the summary text.
- In detail mode: open by default, still collapsible.
- `storyHidden={false}` means "collapsed but visible in both modes".

**What Story mode hides or collapses** (nothing in this list is removed from the app)

| Screen | Collapsed behind `Details` in Story mode |
| --- | --- |
| Program | CSV dropzone and column list; stat cards 4–5; table rows beyond the 6 pinned; part numbers; the "How the match is scored" breakdown |
| Scorecard | credit split (direct and indirect); ledger (36 rows); rules-version chip; banked note |
| Gaps | "Why no shop can take it" grids; TP-02 ("Another option"); "Rules behind this" |
| Fund moment | "Where the new credit comes from" breakdown table (the headline, caption, bar and 4 → 1 stay) |
| Shop | not-held certificate rows; NAICS; capabilities card; fixture role email |
| Network | weekly-capacity stat; per-row process list beyond 3 items; sources on profiles |

**Never hidden in Story mode.** The labels in §10.2: Synthetic, Fictional, Public data — unverified — not affiliated, example (not affiliated), Simplified ITB rules for demo, `AssumptionTag`, and the footer.

---

## 7. Visual explanations

**7.1 `FlowDiagram`** (`web/components/landing/flow-diagram.tsx`; used on `/` and optionally at the top of `/gaps` in its compact form)
- Four nodes left to right, connected by arrows, in HTML and CSS flex (no chart library). They stack vertically below 640 px.
  1. **Northgate** (fictional defence company) · "owes Canada $500M of business"
  2. **Muster** · "reads the parts list, checks shops, offers each job to one shop"
  3. **Small Canadian shops** · "36 jobs · 22 shops" (live from `useDemo()` once routed; before that, "qualified local shops")
  4. **Welder training** · "4 seats, paid by Northgate → 3 stuck jobs go ahead"
- A curved return arrow runs from node 4 back to node 3, labelled "unsticks work".
- **Status colour, icon and text are always together** (WCAG 1.4.1). The palette is neutral slate, brand only on node 2, and green on the return arrow.
- `role="img"` with an `aria-label` repeating the §1 sentence.

**7.2 `BeforeAfterBar`** (`web/components/muster/before-after-bar.tsx`; used in the Fund moment and the Scorecard meter)
- One horizontal track on a **0–100% of $500M** scale. It is honest, with no zoomed axis.
- A slate segment for "before" (11.5%) and a green segment for the added credit (to 13.4%).
- Labels: left, "Before: $57.5M (11.5%)"; right, "After: $67.1M (13.4%)"; centre callout, "+$9.6M credit".
- Animation ≤ 600 ms. Under reduced motion, render the final state.

**7.3 `CreditEquation`**: the four-tile "work × Canadian content × counts double = credit" component. It is used in `worked-example.tsx` and the Why popover (compact).

**7.4 Map (existing).** It moves up and gets the plain legend (§5.2). No new map work beyond the P2 Network pins.

---

## 8. Copy deck (exact strings)

Put desktop strings in **`web/lib/ui/copy.ts`** as a flat `COPY` object, keyed as below. Components import from there. The `/m` strings in `web/lib/app/strings.ts` are **not** touched tonight (§8.9).

### 8.1 Global

| Key | String |
| --- | --- |
| `app.sentence` | Big defence companies owe Canada business equal to their contracts. Muster sends that work to small Canadian shops, and when shops are short of qualified welders, the defence company pays to train them. |
| `app.tagline` | Defence work for small Canadian shops |
| `app.creditExplainer` | Credit isn't cash. It's how the government counts Northgate's Canadian business toward the $500M it owes. Small-business work counts double. Training counts 5×. |
| `nav.step1` … `nav.step5` | Parts list · Where the work goes · Credit earned · Fix the welder gap · The shop's side |
| `nav.directory` | Shops directory |
| `nav.phone` | Phone app |
| `nav.startOver` | Start over |
| `nav.startOver.aria` | Start over (reset the demo) |
| `nav.story` | Story mode |
| `nav.story.tip` | Story mode hides detail tables so the story is easy to follow. Turn it off to see everything. |
| `bar.promise.empty` | Northgate owes Canada **{obligation}** of business |
| `bar.promise` | Credit so far **{credit}** of {obligation} · {pct} |
| `bar.extra` | Extra · Shops directory · not part of the 5-step story |
| `mode.demo` / `mode.live` | Demo data / Live |
| `mode.body` | Demo data replays saved answers, so nothing can break on camera. Live uses the running engine. |
| `banner.lookAt` | Look at: |
| `details.show` / `details.hide` | Show {what} / Hide {what} |
| `run.start` | Start the demo |
| `run.start.sub` | Loads Northgate's 40-part list and matches it to shops · about 5 seconds |
| `run.continue` | Continue the demo → |
| `run.loadAndMatch` | Load and match the parts list |
| `busy.upload` | Reading the parts list… |
| `busy.route` | Matching jobs to shops… |
| `busy.fund` | Funding training… |
| `busy.reset` | Starting over… |
| `honesty` | Northgate Land Systems is fictional. Demo shops are synthetic. Simplified ITB rules for demo. Real shops: public data — unverified — not affiliated. |

The `busy.*` strings map onto the existing `BUSY` values. The store keeps its own text until the integrator's one-liner (§9.3). Until then, components display `COPY.busy.*` based on which action they started.

### 8.2 Landing `/`

| Key | String |
| --- | --- |
| `landing.h1` | Defence contracts, turned into work for small Canadian shops. |
| `landing.p1.title` / `.body` / `.caption` | Big defence companies owe Canada business. / Win a $500M contract, and you must do $500M of business in Canada. Work with small businesses counts double. / Canada's ITB rule, simplified for this demo |
| `landing.p2.title` / `.body` | Muster finds small shops that can make the parts. / It reads the parts list, checks each shop's machines and certificates, and offers each job to one qualified shop. No bidding. |
| `landing.p3.title` / `.body` | Short of qualified welders? The defence company pays to train them. / Training counts 5× toward what it owes, and the stuck work goes ahead. |
| `landing.link.shop` / `.dir` / `.phone` | Skip to the shop's side → / Browse 108 shops → / Open the phone app → |

### 8.3 Program

| Key | String |
| --- | --- |
| `program.h1` | Northgate's parts list |
| `program.b1.empty` | Northgate Land Systems (a fictional defence company) owes Canada $500M of business. Its first parts list is ready to load. |
| `program.b1.empty.look` | Each line is one part Northgate needs made in Canada. |
| `program.b1.uploaded` | 40 parts worth $42.7M. Claude read every line to find the process, material and certificates each part needs. |
| `program.b1.uploaded.look` | 5 are controlled parts. Only security-cleared shops may make them. |
| `program.b2` | **{assigned} of {jobs} jobs** are matched to **{shops} small Canadian shops**: {value} of work, {smePct} of it to small businesses. **{blocked} welding jobs are stuck.** |
| `program.b2.look` | The map: each line runs from Northgate's plant in London, ON to the shop making the part. |
| `program.next.load` / `.match` / `.credit` / `.why` | Load Northgate's parts list / Match jobs to shops → / See the credit Northgate earned → / Why are {blocked} stuck? → |
| `program.upload.button` | Load Northgate's parts list (40 parts) |
| `program.upload.csv` | Use your own parts list (CSV) |
| `program.toast.tagged` | Claude read all {n} lines |
| `program.stat.matched` / `.sub` | Jobs matched / to {shops} small Canadian shops |
| `program.stat.stuck` / `.sub` | Jobs stuck / no qualified welders free · See the fix → |
| `program.stat.value` / `.sub` | Work kept in Canada / {smePct} to small businesses (counts double) |
| `program.stat.controlled` / `.sub` | Controlled parts / all to security-cleared shops |
| `program.map.title` / `.sub` | Where the work goes / Northgate's plant in London, ON and the {shops} shops making its parts. |
| `program.map.legend` | Solid green line: job matched · Dashed purple line: controlled part, security-cleared shop · Grey dot: shop with no job yet |
| `program.table.title` / `.sub` | The {jobs} jobs / Read by Claude · each job offered to one qualified shop, no bidding |
| `program.table.showAll` | Show all {jobs} jobs |
| `program.col.*` | Job · Matched shop · Match · Work value · Credit toward $500M |
| `program.col.credit.tip` | Work value × Canadian content × 2 for small businesses. That's why credit can be bigger than the work. Credit isn't cash. |
| `program.chip.double` / `.single` | counts double / counts 1× |
| `program.stuck.reason` | Stuck: {reason} (engine reason, with "CWB W47.1" → "certified", "h/week" → "hrs/wk") |
| `why.title` | Why {shop}? |
| `why.check.machines` | Has the right machines: {capabilities} |
| `why.check.cgp` | Security-cleared (Controlled Goods): required for this part |
| `why.check.sme` | Small business: its work counts double |
| `why.match` / `.scoring` | Match {score}/100 / How the match is scored |
| `why.factors` | Right machines {a} · Distance {b} · Can start soon {c} · Credit earned {d} |
| `why.credit` | Credit: {value} of work × {ccv} Canadian content × {mult} ({multLabel}) = **{credit}** |
| `why.controlled` | Drawings are never stored in Muster. It matches on basic job details only. |

### 8.4 Scorecard

| Key | String |
| --- | --- |
| `score.h1` | Credit earned |
| `score.b` | Northgate owes Canada $500M of business. This first parts list earns **{credit} of credit: {pct} of what it owes.** |
| `score.b.funded` | Training and the 3 unstuck jobs lifted Northgate to **{credit}: {pct} of what it owes.** |
| `score.b.look` | The "counts double" bar: small-business work earns twice the credit. |
| `score.next` / `.funded` | Fix the {blocked} stuck jobs → / See the shop's side → |
| `score.meter.label` | What Northgate owes Canada |
| `score.meter.value` | **{credit}** of {obligation} |
| `score.meter.caption` | From this one parts list. Northgate's full contract will bring many more. |
| `score.chip.training` / `.jobs` | +{training} from training (counts 5×) / +{jobsCredit} from {n} jobs that were stuck ({jobsValue} of work) |
| `score.example.title` / `.caption` | How one job earns credit / Every number on this page is built this way. |
| `score.chart.title` | What each kind of work counts for |
| `score.chart.rows` | Regular work · counts 1× / Small-business work · counts double (2×) / Training · counts 5× / Indigenous workforce training · counts 10× |
| `score.chart.empty` | Nothing yet · see step 4 |
| `score.smb.label` / `.value` / `.caption` | Small-business target / **{achieved}** of {target} ({pct}) / Rule: 15% of what's owed must involve small businesses. |
| `score.smb.basis` | Counts small-business work before the 2× bonus (assumption) |
| `score.details.split` / `.split.note` | Work on this contract vs other activity / Extra credit can be kept for up to 10 years (simplified). |
| `score.details.ledger` | Every credit entry ({n}) |
| `score.empty.title` / `.body` | No credit yet: nothing has been matched. / Load Northgate's parts list and match it to shops, and the credit appears here. |

### 8.5 Gaps and Fund

| Key | String |
| --- | --- |
| `gaps.h1` | Fix the welder gap |
| `gaps.b` | **{n} welding jobs ({value}) are stuck.** The shops with certified welding are full, and the others don't have the certification. **Training 4 welders at {shop} unsticks {k} of them.** |
| `gaps.b.look` | The training card: what Northgate pays, and what it gets back. |
| `gaps.next.fund` | ↓ Fund the training below |
| `gaps.b.funded` | Northgate funded 4 welder training seats. **{k} stuck jobs ({jobsValue} of work) can go ahead;** {left} is still stuck. |
| `gaps.next.shop` | See the shop's side → |
| `gaps.hero.eyebrow` | The fix · Training plan {id} |
| `gaps.hero.title` | {seats} welder training seats at {shopShort} ({town}) |
| `gaps.hero.sub2` | The company also needs a qualified supervisor and approved procedures. |
| `gaps.eq.pay` / `.pay.sub` | Northgate pays {cost} / {seats} seats × {perSeat} incl. stipend |
| `gaps.eq.credit` / `.credit.sub` | Counts as {credit} credit / training counts 5× |
| `gaps.eq.unstick` / `.unstick.sub` | Unsticks {k} jobs / {jobsValue} of work → +{jobsCredit} credit |
| `gaps.whoPays` | Who pays? Northgate, from its own budget. It earns credit toward what it owes, not cash back. |
| `gaps.fund.button` | Fund training (unchanged) |
| `gaps.rules.title` | Rules behind this |
| `gaps.rules.body` | Eligible training type: welder certification for Canadian citizens or permanent residents (ITB model terms §7.5.1). Training credit is capped at 25% of what's owed. ITB is run by the Defence Investment Agency since July 16, 2026. |
| `gaps.list.title` | {n} stuck welding jobs |
| `gaps.list.fixChip` | Unsticks with {id} |
| `gaps.list.why` | Why no shop can take it |
| `gaps.why.items` | {process} don't do this welding process · {size} can't fit the part size · {certs} lack the certification · {cap} are full (zero counts omitted) |
| `gaps.other.title` | Another option |
| `gaps.stat.stuck` / `.unstuck` | Stuck jobs / Unstuck by training |
| `gaps.empty.title` | Nothing is stuck yet: nothing has been matched. |
| `fund.caption` | {jobsValue} of work that was stuck can now go ahead. Credit isn't cash: small-business work counts double, and training counts 5×. |
| `fund.bar` | **{before} → {after}** of what Northgate owes |
| `fund.stuck` | Stuck jobs {before} → {after} |
| `fund.stillStuck` | Still stuck: **{job}**. The only certified shop that fits is full. |
| `fund.smb` | Small-business target: {before} → {after} |

`perSeat` is `cost / seats`, which gives $24K from the fixture's $96K and 4 seats. It is labelled with `AssumptionTag`, per `data/rules/training_costs.json`.

### 8.6 Shop (syn-012)

| Key | String |
| --- | --- |
| `shop.b` | This is what **{shop}**, a synthetic small shop in {town}, sees: **{n} job offers from Northgate worth {value}**, and one certification that would win {k} more. |
| `shop.b.look` | The top card: what one step would unlock. |
| `shop.b.funded` | **Northgate paid to train {seats} of {shopShort}'s welders.** The {k} jobs that were stuck ({jobsValue}) are now offered to {shopShort}. They start once the welders qualify. |
| `shop.b.funded.look` | {k} new offers, marked New, and {seats} welders in training. |
| `shop.next` | Open the shop's phone → |
| `shop.ready.cwb.plain` | Welding certification from the Canadian Welding Bureau: the company is certified, and each welder passes a test. Northgate can pay for the welder training. |
| `shop.ready.fundLink` | See how Northgate can fund this → |
| `shop.inbox.title` / `.sub` | Job offers from Northgate / No bidding: each job was offered only to you. |
| `shop.stat.offers` / `.sub` | Offers from Northgate / {n} jobs |
| `shop.stat.why` / `.sub` | Why Northgate wants you / {credit} credit · your work counts double toward what it owes |
| `shop.stat.reach` / `.sub` | One step away / {k} more jobs |
| `shop.stat.training` / `.sub` | Welders in training / paid by Northgate |
| `shop.certs.title` | Certificates |
| `shop.certs.counter` | {held} of {needed} needed in place |
| `shop.certs.more` | {n} more not held · show |
| `shop.certs.notHeld` | Not held |
| `shop.empty.title` | Northgate hasn't sent offers yet. |

### 8.7 Network and discovered profile

| Key | String |
| --- | --- |
| `net.h1` | Canada's hidden supply base |
| `net.b` | **{total} shops in southwestern Ontario:** {syn} synthetic demo shops that receive the demo's offers, and **{pub} real manufacturers found in public data** (unverified, not affiliated, never sent work). |
| `net.b.look` | Filter to real shops to see who's already out there. |
| `net.next` | Back to the story → |
| `net.search` | Is your shop here? Search by name or city |
| `net.filter.syn` / `.pub` | Demo shops (synthetic) · {syn} / Real shops · discovered from public data · {pub} |
| `net.legend` | Green: held (demo data) · Blue: stated on the company's website (unverified) |
| `net.othersNotListed` | Others not listed |
| `net.stat.capacity` | Weekly shop hours (demo shops) |
| `pub.claim.dialog` | Coming soon. Shops will claim and verify their own profile. Nothing is collected in this demo. |
| `pub.sources` | Sources |

### 8.8 Tooltips

Tooltips are exactly the "Tooltip" column of §2, keyed `plain.<KEY>.tip`.

### 8.9 Phone app `/m`: same language, after the merge (P2, not tonight)

**Keep as is.** `/m` already says "Demo data" / "Live", "No bidding", and "offers need a reply". Its tabs (Today · Offers · Certs · Grow) are kept.

**Deferred.** These are post-merge edits to `web/lib/app/strings.ts` and `web/components/mobile/offer/strings.ts`, owned by the phone lane. Each changes a string the demo script quotes, so the integrator updates the script in the same commit.

| Current `/m` string | Aligned string |
| --- | --- |
| "Northgate earns $1.68M ITB credit (2x SME) if you accept." | "Northgate earns $1.68M Canada work credit (ITB) if you accept: small-business work counts double." |
| "$96K → $480K ITB credit (5x)" | "$96K → $480K credit (training counts 5×)" |
| Glance card "obligation met", "SMB progress" | "of what Northgate owes", "small-business target" |
| Cert chips "CGP", "CWB W47.1" | first use per screen "Security-cleared (CGP)", "Welding certification (CWB W47.1)" |

---

## 9. Implementation plan (5 parallel agents, no shared files)

### 9.0 Ground rules

1. **Read-only for everything outside your own files.** Do not change engine code, `data/**`, `web/lib/data/store.tsx`, `web/lib/api/**`, `web/lib/app/**` or `web/components/mobile/**`.
   - `mode-switcher.tsx` changes only its two label strings plus the Advanced disclosure. This is Agent A's edit, made after the phone merge has landed on `main`.
2. **Test only in `?mode=fixtures`** with engine requests to `:8000` blocked. Never click Load, Match, Fund or Start over against the live engine someone is demoing from.
3. **Agent A lands the primitives first.** The target is 45 minutes, in one commit using the APIs below. The other agents code against these signatures from minute 0 and use local stubs until A merges.
4. **Gates before every push:** `cd web && npm run build && npm run lint`, `make fixtures-check` (8/8), and the §9.4 checks.
   - The integrator also runs live `make demo-check` (8/8).
5. Every new status visual uses colour, icon and text together, and respects `prefers-reduced-motion`.
6. Desktop layout works at 1280×720 and 1920×1080, and has no horizontal page scroll at 390 px.

### 9.1 Primitives API (Agent A publishes; others import)

```ts
// web/lib/ui/plain.ts
export type PlainKey = "ITB" | "obligation" | "ITB_CREDIT" | "SMB" | "SMB_TARGET" | "CCV" | "CGP" | "CONTROLLED"
  | "CWB_W47.1" | "CPCSC_L1" | "AS9100" | "ISO9001" | "NADCAP" | "PRIME" | "MATCH" | "STUCK" | "TAGGED"
  | "SCORE" | "DIRECT" | "INDIRECT" | "SYNTHETIC" | "DISCOVERED" | "MULTIPLIER" | "NAICS"
export const PLAIN: Record<PlainKey, { first: string; label: string; tip: string }>
export function certPlain(type: string): { first: string; label: string; tip: string } // falls back to CERT_LABEL

// web/lib/ui/copy.ts
export const COPY: Record<string, string>                     // keys from §8
export function c(key: string, vars?: Record<string, string | number>): string // "{x}" interpolation; **bold** → <strong> via <Rich/>
export function Rich({ text }: { text: string }): JSX.Element // renders **…** as <strong>, nothing else

// web/lib/ui/steps.ts
export type StepKey = "parts" | "matches" | "credit" | "gap" | "shop"
export const STEPS: { key: StepKey; n: 1|2|3|4|5; label: string }[]
export function currentStep(pathname: string, stage: Stage, demoShopId: string | null): StepKey | null
export function stepDone(key: StepKey, stage: Stage, anyAccepted: boolean): boolean
export function nextStep(pathname: string, stage: Stage, demoShopId: string | null): { label: string; href?: string; action?: "upload" | "route" | "scrollFund" }
export function withParams(href: string): string              // keeps ?mode and ?story from window.location

// web/lib/ui/story-mode.tsx
export function StoryModeProvider({ children }: { children: React.ReactNode }): JSX.Element
export function useStoryMode(): { story: boolean; setStory(v: boolean): void }

// web/components/muster/*
<StoryBanner step={2} tone="prime" | "shop" | "extra" summary={<Rich text=…/>} lookAt="…" next={<NextStep … />} />
<NextStep label="…" href="/scorecard" />  |  <NextStep label="…" onClick={…} busy={bool} />
<Details summary="Show all 40 jobs" storyHidden={true}>…</Details>
<RunDemoButton upTo="uploaded" | "routed" navigateTo?="/program#map" label?="…" size?="lg" | "xl" />
<BeforeAfterBar before={0.115} after={0.134} beforeLabel="…" afterLabel="…" delta="+$9.6M credit" />
<CreditEquation value={2812000} ccv={0.9} multiplier={2} credit={5061600} compact? />
<Term k="CGP" first? />   // updated: reads PLAIN; `first` renders PLAIN.first; always sets title={tip}
```

### 9.2 Ownership

| Agent | Owns (create or edit) | Delivers | Depends on |
| --- | --- | --- | --- |
| **A · Shell & primitives** | `web/lib/ui/{plain,copy,steps,story-mode}.ts(x)` (new); `web/components/muster/{story-banner,next-step,details,run-demo-button,before-after-bar,credit-equation}.tsx` (new); `web/components/muster/{term,empty-state,index}.tsx`; `web/components/shell/{app-header,program-context-bar,app-footer,chrome-gate}.tsx`; `web/app/layout.tsx`; `web/lib/format.ts` (GLOSSARY.SME fix only); `web/components/shell/mode-switcher.tsx` (labels only, post-merge); `web/scripts/ux-check.mjs` (new, §9.4) | §2 PLAIN, the full §8 COPY (all agents' keys, drafted from this doc), §3 nav/story bar/step rules, §6 Story mode, §7.2–7.3 components, §5.7 chrome, nav-highlight fix, `ux-check` | none; lands first |
| **B · Landing & Program** | `web/app/page.tsx`; `web/components/landing/{landing-view,flow-diagram}.tsx` (new); `web/components/program/*` (`program-view`, `upload-card`, `jobs-table`, `rows.ts`, `why-popover`, `program-map`); `web/app/program/page.tsx` | §4, §5.1, §5.2, §7.1 | A |
| **C · Scorecard** | `web/components/scorecard/*`; `web/app/scorecard/page.tsx` | §5.3; chart animation ≤ 400 ms; no layout jump after funding | A |
| **D · Gaps & Fund** | `web/components/gaps/*` (not the engine headline string); `web/app/gaps/page.tsx` | §5.4: hero card above the fold, compact stuck list, fund caption and bar, NG-034 line, fixed-width counter, scroll target `id="fund-TP-01"` for `nextStep` | A |
| **E · Shop & Directory** | `web/components/shop/*`; `web/app/shops/**`; `web/app/network/page.tsx` | §5.5, §5.6: readiness hero first, cert counter fix, held-only pills, claim dialog, sources disclosure, 390-px order | A |

**Collisions to avoid**
- Only A edits `muster/index.ts`. Others import by file path until A's export lands.
- Only A writes `copy.ts`. Others propose missing keys in their PR description, and A adds them. For speed, an agent may add keys under its own prefix (`program.*`, `score.*`, `gaps.*`, `shop.*`, `net.*`) in a **separate** file, `web/lib/ui/copy-<agent>.ts`, which A merges into `COPY`.

### 9.3 Integrator-only edits (after the agents merge)

1. `web/lib/data/store.tsx` makes two string-only changes, and only after the phone merge:
   - the tag-summary text becomes "Claude read all {n} lines"
   - the `BUSY` labels become the §8.1 `busy.*` strings
   - No logic changes.
2. `docs/demo-script.md` gets its ON SCREEN cells updated:
   - Nav names: "ITB Scorecard" → "3 Credit earned", "Gaps & Training" → "4 Fix the welder gap", "Shop view" → "5 The shop's side", "Network" → "Shops directory".
   - "Reset demo" → "Start over"; "Demo mode · fixtures" / "Live API" → "Demo data" / "Live"; "Phone view" → "Phone app".
   - "Load Northgate demo parts list (40 lines)" → "Load Northgate's parts list (40 parts)"; "Route jobs" → "Match jobs to shops".
   - The filter becomes "Real shops · discovered from public data".
   - The optional landing-page title card goes at 0:00.
   - **The voiceover words do not change,** except where they quote a changed on-screen string.
3. CLAUDE.md §13 log line.

### 9.4 Acceptance criteria

**Automated** (`web/scripts/ux-check.mjs`, Playwright, `?mode=fixtures`, `:8000` blocked, 1280×720). The script visits `/`, runs Start the demo, then visits `/program`, `/scorecard` and `/gaps`, clicks Fund training (fixtures only), then visits `/shops/syn-012`, `/network` and `/shops/pub-001`. At each stop it asserts:

1. `[data-story-banner]` is visible, and its bounding box bottom is ≤ 720 px.
2. Exactly one `[aria-current="step"]` on story pages; none on `/network` and `/shops/pub-*`. No element in the story bar has a computed colour equal to the brand red.
3. **Bare-acronym check:** visible text matching `\b(ITB|SMB|SME|CCV|CGP|CWB|CPCSC|NAICS)\b` is allowed only:
   - inside an `abbr` / `Term`
   - immediately inside parentheses after a plain label
   - in the allow-list: "Simplified ITB rules for demo", the fund headline, `TP-\d+`, `NG-\d+`, "CSA W47.1" inside `packageTitle`
   - The check fails and lists offenders otherwise.
4. The strings "Demo mode · fixtures", "Claude (cached)" (in table rows), "PRIME SIDE", "SHOP SIDE", "Program: Northgate work package", "Gaps & Training" and "ITB Scorecard" do not appear in Story mode.
5. **Numbers unchanged.** These texts appear:
   - Program: 36, 4, $36.1M, 90%, 22
   - Scorecard: $57.5M, 11.5%, 36%. After funding: $67.1M, 13.4%, +$480K, +$9.1M.
   - Gaps: $96K, $480K, $5.1M, $9.1M, and the exact fund headline string.
6. `/?mode=fixtures` stays on `/` with the mode pill reading "Demo data". After Start the demo, the URL still contains `mode=fixtures`.
7. `/gaps` before funding: the `Fund training` button's bottom edge is ≤ 720 px.
8. Scorecard after funding: the 13.4% element's `getBoundingClientRect().top` is unchanged ±2 px from the pre-funding 11.5% element (no layout jump). The multiplier-chart 2× bar is at final width by 600 ms.
9. At 390 px width: `scrollWidth <= innerWidth` on every page, and the current step pill is inside the viewport.
10. The labels below (§10.2) are present on their screens in **both** Story modes.

**Human "5-second test", one per screen.** Show a person with no background a 1280×720 screenshot for 5 seconds, hide it, then ask the question. Pass if 3 of 3 testers answer correctly (teammates who haven't seen the redesign, or a fresh-context agent given only the screenshot).

| Screen | Question | Passing answer contains |
| --- | --- | --- |
| `/` | What does this product do? | defence work goes to small Canadian shops (training welders is a bonus) |
| `/program` empty | What will happen if you click the button? | loads a defence company's parts list |
| `/program` routed | How did it go? | most jobs (36/40) found a shop; 4 are stuck |
| `/scorecard` | Is Northgate done? What counts double? | no: 11.5% from this one list; small-business work counts double |
| `/gaps` before | Why are jobs stuck, and what's the fix? | not enough qualified or free welders; pay to train 4 welders |
| Fund moment | What did $96K buy? | $480K credit plus 3 jobs back on |
| `/shops/syn-012` | Whose screen is this, and what's in it for them? | the small shop's; job offers, plus one certification unlocks more |
| `/network` | What's this list? | real Ontario manufacturers (and demo shops); not contacted |

---

## 10. What NOT to change

### 10.1 Numbers, data, behaviour

- **No engine, fixture, API or rules change.**
  - Every figure stays: 40 jobs, $42.7M, 36/4, 22 shops, $36.1M, 90%, 5 controlled, $57.5M (11.5%), SMB $27.3M of $75M (36.4%), $6.6M stuck, $96K → $480K, 3 jobs = $5.1M of work → $9.1M credit, $67.1M (13.4%), SMB 42.5%, NG-034 still stuck.
  - Derived display values (22 shops, $24K per seat) come from existing data and are labelled as before.
- **Fund-moment headline**, verbatim from the engine: "$96K training → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)". Add under it; never rewrite it.
- **Button labels the video depends on:** **Fund training** and **Accept**. The phone's Accept, Decline and Ask are unchanged.
- **URLs:** `/program`, `/scorecard`, `/gaps`, `/shops/syn-012`, `/network`, `/shops/pub-*`, `/m/**`. Only the labels change.
- **`useDemo()` / `store.tsx` logic**, the fixtures flow, and the `muster.app.v1` localStorage sync. The only `store.tsx` changes are the §9.3 strings, made by the integrator.
- **Funding is never automatic.** Start the demo stops at "routed".
- **No drawings or attachment field** anywhere. No personal names; trainees stay "Seat 3 of 4 · TP-01". No new data collection (the claim dialog collects nothing).

### 10.2 Labels required by CLAUDE.md §4–§5 and the demo script (visible in both Story modes)

- "**Simplified ITB rules for demo**" (Scorecard chip, footer, fund card, `/m` footer)
- "**Fictional**" on Northgate. The story bar and landing say "Northgate Land Systems (fictional defence company)".
- "**Synthetic**" on every synthetic shop (chip text stays "Synthetic").
- "**Public data — unverified — not affiliated**" on every real shop, plus "Not onboarded: not offered work".
- "**example (not affiliated)**" on training partners (Conestoga College).
- `AssumptionTag` on every non-policy number ($96K cost, $24K per seat, +80 hrs/wk, the SMB basis).
- Footer: "Data: Statistics Canada ODBus (Open Government Licence)".
- Controlled-goods footnote: "Muster never stores drawings".

### 10.3 Wording rules

- **W47.1 is a company certification.** Say "Qualify 4 welders (FCAW/GMAW) under CSA W47.1" (`packageTitle`) or "4 welder training seats". **Never "certify 4 welders."**
- Say "qualified welders" or "a shortage of qualified welders". Never "the welder shortage", and never cite the Job Bank "very limited" outlook as shortage evidence.
- Multipliers: the policy "will provide" / "may receive". Never "Canada now gives".
- Never "100× return", "free money" or "taxpayer-funded". Northgate pays for training from its own budget and earns credit, not cash.
- Never show the CWB readiness message after funding. The shop's next step is then ISO 9001.
- Never frame a real (discovered) company as a customer, partner, or shop receiving offers.
