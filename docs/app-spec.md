# Shieldworks phone app: build spec (tonight + next 4 weeks)

Owner: Head of Product. Written 2026-09-26. Status: **approved for tonight's build**.
Inputs: three independent product plans (S1–S12, F1–F12, M1–M12), the research summaries (shop-jtbd, mobile-floor, prime-side, workforce-app, marketplaces, canada-fit), CLAUDE.md §1/§3/§4/§5, docs/api.md v0.1, and the code as of 2026-09-26.

Evidence labels: **VERIFIED** means a primary or official source was checked by the research lanes on 2026-09-26. **INFERRED** means vendor or secondary material, or our reading of a primary text. **UNKNOWN** means not established. Every rule shown in the UI carries its source URL, or an `assumption` tag.

---

## 0. Scoring (every distinct feature across the three plans)

Scale 1–5. For **Risk**, 5 means it is safe for the existing demo path and 1 means it changes demo numbers or needs new infrastructure.

| # | Feature (plan ids) | Useful to users | Demo impact | Evidence | Risk (5 = safe) | Total | Decision |
|---|---|---|---|---|---|---|---|
| A | Installable phone shell, touch sizes, `/m` routes (S5, F3, M1) | 4 | 5 | 5 | 5 | **19** | Tonight T1 |
| B | Shop "Today" home (S1, F1, M4 tile) | 5 | 5 | 4 | 4 | **18** | Tonight T2 |
| D | Compliance wallet with real renewal rules and work at risk (S3, F4, M3) | 5 | 4 | 5 | 4 | **18** | Tonight T4 |
| E | Readiness roadmap, "Ask the prime to fund", W47.1 wording fix (S4, F5, M4) | 4 | 5 | 5 | 4 | **18** | Tonight T5 |
| C | Offer card with persisted Accept/Decline/Ask (S2, F1, M2) | 5 | 5 | 4 | 3 | **17** | Tonight T3 |
| F | Prime activity feed and desktop bell (F2 feed, M5) | 4 | 5 | 3 | 4 | **16** | Tonight T6 |
| G | Weekly one-tap capacity check-in (S6, M11 part) | 4 | 3 | 4 | 4 | **15** | Tonight T7 |
| H | Trainee seat card, pseudonymous (S9, F10, M6) | 3 | 4 | 3 | 5 | **15** | Tonight T8 |
| I | CanadaBuys defence tender radar (S12, F7, M7) | 3 | 3 | 4 | 5 | **15** | Stretch X1 (web only) |
| R | One-tap Re-route after a decline (F2) | 4 | 5 | 3 | 2 | 14 | Stretch X2, then roadmap |
| K | FR/EN (S11, F8, M9) | 3 | 3 | 4 | 3 | 13 | Roadmap wk 2; tonight all `/m` copy goes through `t()` |
| L | SMS/email alerts, push after install, digest (S7, M11) | 5 | 3 | 4 | 1 | 13 | Roadmap wk 1 |
| N | Claim your shop / verification ladder (S10, F11, M10) | 4 | 2 | 4 | 2 | 12 | Roadmap wk 2 |
| O | ITB evidence pack (F9, M8) | 5 | 2 | 4 | 1 | 12 | Roadmap wk 4 |
| P | Canada coverage view + regional labour strip (F12) | 2 | 3 | 4 | 3 | 12 | Roadmap wk 4 |
| J | Ledger on v6 ITB rules: deemed 100% CCV, 25% training cap (F6, M8) | 3 | 3 | 4 | 1 | 11 | Roadmap wk 2 (changes every headline number; never before the freeze) |
| M | Job milestones and cash view (S8) | 4 | 2 | 3 | 2 | 11 | Roadmap wk 3 |
| Q | Offline outbox via service worker, field-visit mode (M12) | 3 | 1 | 4 | 2 | 10 | Roadmap wk 3 (tonight: localStorage outbox only) |

Why this cut:
- The rubric has no technical judging. What wins is a believable two-sided loop that a judge can see on a phone in about 70 seconds.
- T1–T8 all reuse data the engine already computes: reasons, credit, readiness, packages and certification dates. The engine only gains **additive write endpoints and new read endpoints**. No existing response, fixture or demo number changes.
- Anything that moves a headline number (J, R), needs outside infrastructure (L, N) or needs a service worker (Q) waits until after the freeze.

---

## 1. Thesis

A small-shop owner, quality lead or trainee will open Shieldworks on their phone only if, within 60 seconds, it answers "what needs me tonight, what lapses next and what it costs, and what is one step away and who pays". Each answer they give (accept, decline with a reason, ask for funding, confirm capacity) must reach the prime in seconds, with no bidding, no stored drawings and no new portal login.

---

## 2. Tonight's build (T1–T8, plus stretch X1–X2)

### 2.0 Ground rules for every agent

1. **Additive only.** Do not change the shape or values of any existing endpoint response or any existing `data/fixtures/*.json`. The one exception is the single illustrative date in T4 (§2.4). `make fixtures-check` and live `make demo-check` must stay **8/8** after every commit.
2. **Prerequisite (human decision, 5 min).** The working tree has uncommitted engine and web changes from the performance lane: `engine/app.py`, `gaps.py`, `pipeline.py`, `state.py`, the new `cache.py` and `graph.py`, `web/lib/data/store.tsx` and `web/components/shell/mode-switcher.tsx`. Commit or stash them before Agent E starts. **Nobody edits `web/lib/data/store.tsx` or `mode-switcher.tsx` tonight.** Everything reads the store through `useDemo()`.
3. **Guardrails** (CLAUDE.md §4–§5) apply on every screen:
   - No drawing or attachment field anywhere. Controlled jobs say the technical data package moves only through the prime's own channel.
   - Synthetic shops show "Synthetic". Public shops show "Public data — unverified — not affiliated".
   - Dates a shop enters are "shop-declared", never "verified". Synthetic dates are "illustrative".
   - No personal names: trainees appear as "Seat 3 of 4 · TP-01".
   - Every non-policy number shown carries `AssumptionTag`.
   - The footer credits (ODBus / OGL, "Simplified ITB rules for demo") appear in the `/m` layout too.
4. **Mobile baseline** (applies to T1–T8):
   - Works at 360, 390 and 430 px with **no horizontal page scroll** (`scrollWidth <= innerWidth`).
   - Body text is at least 16 px, which also stops iOS zooming into inputs.
   - Tap targets are at least 48 px, and primary actions are 56 px with 8–12 px gaps.
   - Sticky bars are padded with `env(safe-area-inset-bottom)`.
   - Status always uses colour, icon and text together (WCAG 1.4.1).
   - Respect `prefers-reduced-motion`.
   - No swipe-only actions.
   - Native `<input type="date">`.
   - Every `localStorage` access is wrapped in try/catch.
5. **Both modes work.**
   - **Live mode:** the web talks to the engine.
   - **Fixture mode:** actions are stored in `localStorage` key `muster.app.v1`, and a `storage` event syncs them across tabs. A phone-sized window and a laptop window in the same browser therefore see each other's actions without an engine, which is the video fallback.
6. **Gates before any push:** `npm run build`, `npm run lint`, `make test`, `make fixtures-check` (8/8), live `make demo-check` (8/8), and the `/m` smoke check in §2.10.

### 2.1 T1: Installable phone shell (`/m`), manifest, touch sizes

**User story.** As a shop owner who quotes at 10 PM on my phone, I want Shieldworks on my home screen, opening straight to what needs me, with buttons I can hit wearing gloves, and no app store or new password.

**Screens and routes**

- **`/m`** is a role picker with three big cards:
  - "Shop: Tallowfield Fabricating (synthetic)" → `/m/shops/syn-012`
  - "Prime: Northgate supplier development" → `/m/prime`
  - "Trainee: Seat 3, TP-01" → `/m/trainee/TP-01?seat=3`
  - The last choice is remembered in localStorage.
  - Below the cards is a "Other shops with offers" list, built from `useDemo().assignments` and grouped by `shop_id`.
  - That list and the **Demo version** panel (mode switch, seed, simulation) sit inside a **Presenter tools** section, closed by default. `/m?presenter=1` opens it and keeps it open for that tab (`?presenter=0` clears it). **Fill with demo activity** asks for confirmation ([Cancel] [Reset for everyone]) before it seeds.
- **`web/app/m/layout.tsx`**:
  - one column, `max-w-[430px] mx-auto`
  - on desktop, a thin border and rounded corners so the page reads as a phone frame in the video
  - compact `MHeader`: back arrow, title, shop label chip, mode badge ("Live" or "Demo data")
  - `FreshnessStamp`: "Updated 9:42 PM" plus a Refresh button, inside an `aria-live="polite"` region
  - `OfflineBanner`: "Offline · showing 9:42 PM data · 2 actions waiting"
  - `MFooter` with the data credits
- **Shop routes** get a sticky bottom tab bar: **Today · Offers · Certs · Grow**. Prime and trainee routes have no tab bar.
- **Desktop chrome is hidden under `/m`.** A new `ChromeGate` client component in the root layout skips `AppHeader`, `ProgramContextBar` and `AppFooter` when `usePathname().startsWith("/m")`.
- **Manifest.** `web/app/manifest.ts` (Next 16 `MetadataRoute.Manifest`):
  - `id: "/"`, `name: "Shieldworks"`, `short_name: "Shieldworks"`
  - `start_url: "/m?src=pwa"`, `display: "standalone"`
  - `theme_color` and `background_color` from the brand tokens
  - icons at 192, 512 and maskable 512
  - `shortcuts`: Offers → `/m/shops/syn-012/offers`, Certs → `/m/shops/syn-012/certs`
- **Root layout** exports `viewport = { themeColor, viewportFit: "cover", width: "device-width", initialScale: 1 }` and `metadata.appleWebApp = { capable: true, title: "Shieldworks", statusBarStyle: "default" }`.
- **Icons** are generated with `next/og` `ImageResponse`: `app/apple-icon.tsx` and static route handlers `app/icons/[size]/route.tsx` with `dynamic = "force-static"`. No new npm dependencies.
- **`IosInstallHint`** appears only when all three hold:
  - the device is an iPhone or iPad
  - `!matchMedia("(display-mode: standalone)").matches`
  - the user has already opened one offer
  It shows three illustrated steps (Share → Add to Home Screen → Open), can be dismissed, and remembers the dismissal. It never relies on `beforeinstallprompt`.
- **Button sizes.** `web/components/ui/button.tsx` gains two sizes:
  - `touch`: `h-12 gap-2 px-4 text-base`
  - `touch-lg`: `h-14 gap-2 px-5 text-base font-semibold`
- **Desktop link.** `AppHeader` gets a "Phone view" link to `/m`. Agent P owns that file (§2.9).

**Shared foundation (Agent S writes it first; everyone else codes against it).** All of this lives in `web/lib/app/`:

- `types.ts`: every type in §2.3–§2.8.
- `today.ts`: `appToday(): Date`. It uses `NEXT_PUBLIC_MUSTER_TODAY` (YYYY-MM-DD) when set, otherwise `new Date()`. It also exports `daysBetween(a, b)` and `addBusinessDays(d, n)`.
- `api.ts`: `appFetch(path, init)` against `useDemo().apiUrl`. It parses `{"detail"}` errors into a thrown `AppApiError { status, detail }`.
- `actions-store.tsx`: `AppActionsProvider` and `useAppActions()` (interface below). It is mounted in the root layout inside `DemoProvider`, so both desktop and `/m` can read it.
- `shop-bundle.ts`: `useShopBundle(shopId)`, which returns:
  ```ts
  { detail: ShopDetailResponse | null, jobsById: Record<string, Job>, assignmentsById: Record<string, Assignment>,
    certs: CertWithDates[],           // live: detail.certifications; fixtures: detail + expiries from data/processed/shops_synthetic.json
    actions: ShopActions,             // slice of useAppActions() for this shop
    loading: boolean, error: string | null, updatedAt: string | null, refresh(): Promise<void> }
  ```
  It calls `useDemo().getShop(id)`. In fixture mode, non-demo shops have no `expires_at` in the fixtures, so it merges certification dates from `data/processed/shops_synthetic.json` (imported as JSON at build time, the same way fixtures are).
- `strings.ts`: a `t(key, vars?)` helper with an English dictionary only. All `/m` copy goes through it, so French (roadmap wk 2) can be dropped in later.

```ts
// web/lib/app/actions-store.tsx
export interface AppActions {
  ready: boolean
  decisions: Record<string, OfferDecisionRec>            // key `${shopId}:${jobId}`
  fundingRequests: Record<string, FundingRequestRec>      // key package_id
  capacity: Record<string, CapacityCheckin>               // key shop_id
  declaredCerts: Record<string, Record<string, CertDeclaration>> // shop_id → cert_type
  events: AppEvent[]                                      // newest last
  routedAt: string | null
  pending: number                                         // outbox size
  lastSyncAt: string | null
  decideOffer(shopId: string, jobId: string, input: DecisionInput): Promise<OfferDecisionRec | null>
  requestFunding(shopId: string, requirement: string): Promise<FundingRequestRec | null>
  confirmCapacity(shopId: string, input: CapacityInput): Promise<CapacityResult | null>
  declareCertExpiry(shopId: string, certType: string, expiresAt: string, certNumber?: string): Promise<CertDeclaration | null>
}
```

**Actions-store behaviour**

- **Live mode:**
  - Each action is a POST to the endpoints in §2.3–§2.7, carrying an `idempotency_key` (`crypto.randomUUID()`).
  - On success, merge the response.
  - On a **network** error, queue the call in the `muster.app.v1.outbox` localStorage key, apply it optimistically, and show "Will send". Flush the outbox on `online`, on `visibilitychange` to visible, and at startup.
  - On a 4xx, revert and show a toast with `detail`.
  - Poll `GET /programs/northgate/events?since=<last_seq>` every 3 s while the document is visible, and re-fetch `GET /programs/northgate/actions` whenever new events arrive.
- **Fixture mode:**
  - Apply the action locally and append a locally built `AppEvent` with the same shape as the engine's.
  - Persist to `muster.app.v1` and listen for `storage` events.
  - Set `routedAt` the first time `useDemo().stage` becomes `routed`.
- **Both modes:**
  - When `useDemo().stage` becomes `empty` (reset) or `uploaded`, clear decisions, requests and events. Keep capacity and certificate declarations, which belong to the shop rather than the program.
  - Mirror `accepted`/`declined` into `useDemo().setOfferStatus()` so the desktop offer inbox agrees. Known limitation: an undo cannot clear the desktop overlay tonight.

**Mobile behaviour.** This feature *is* the mobile layer. Tested at 360, 390 and 430 px, in iOS Safari (installed to the Home Screen) and in Android Chrome, using `next build && next start`, not dev mode.

**Engine endpoints.** None for T1 itself. Agent E extends CORS (§2.3) so a phone on the LAN can reach the engine.

**Data changes and fixtures.** None.

**Acceptance criteria**
- `/m` and every child route render with no desktop header or footer, no console errors, and no horizontal scroll at 360 px.
- The manifest is served at `/manifest.webmanifest` with valid icons: Chrome DevTools Application › Manifest shows no errors.
- On iOS, Add to Home Screen then launch opens standalone at `/m` with no browser chrome.
- `Button size="touch-lg"` measures at least 56 px tall.
- Desktop pages are pixel-identical apart from the new header link.
- `useAppActions()` works in both modes. A decision made in one tab shows up in a second tab within 1 s in fixture mode, and within 4 s in live mode.

### 2.2 T2: Shop "Today" home

**User story.** As a shop owner checking my phone at 9 PM, I want one screen that shows what needs a decision, what is about to lapse and what it costs, and what is one step away, in that order.

**Screens and routes**

- **`web/app/m/shops/[id]/page.tsx`** renders `TodayView`. It is one column of `AttentionCard`s: a whole-card tap target at least 64 px tall, with one big number, one verb and a chevron.
- **Fixed priority order:**
  1. **Offers needing a reply:** "2 offers need a reply · soonest reply by Thu Oct 1". Tapping opens `/m/shops/[id]/offers`.
     - Count offers whose status is `offered` and whose decision is `null` or `question`.
     - `reply_by = addBusinessDays(routedAt, 5)`, tagged `assumption: set by the prime; demo uses 5 business days`.
  2. **Renewals** in stage `urgent`, `window_open` or `lapsed`, from `renewalFor()` in T4, one card each: "CGP · file renewal by Oct 17 · NG-004 · $2.8M work · $5.06M Northgate credit at risk". Tapping opens `/m/shops/[id]/certs#CGP`.
  3. **Capacity check-in** if there is no check-in in the last 7 days: "Confirm free hours for the next 4 weeks". Tapping opens the T7 sheet.
  4. **One step away**, from `readiness[0]`: "Get CWB W47.1 → 3 more jobs · $5.1M". Tapping opens `/m/shops/[id]/grow/CWB_W47.1`. If funding has already been requested: "Funding requested Sep 26 · awaiting Northgate".
  5. **Workers in training** (funded packages): "4 welders in training · +80 h/wk welding (assumption)". Tapping opens the trainee link for seat 1.
- **When nothing needs attention:** "You're clear. Next check-in Monday."
- **Before the program is routed:** "Northgate hasn't sent offers yet" (an `EmptyState`).
- **Header strip:** the shop name, the label chip, and 3 compact stats below the cards (offers value, accepted hours vs capacity, certifications counting).
- **Pure logic** lives in `web/lib/app/attention.ts`:
  `buildAttention(bundle, renewals, today): AttentionItem[]`, where
  `AttentionItem = { kind: "offers"|"renewal"|"capacity"|"readiness"|"training", ref_id: string|null, title: string, detail: string, due_at: string|null, value_cad: number|null, href: string, tone: "action"|"warn"|"danger"|"info" }`.

**Mobile behaviour**
- The top 3 cards are visible without scrolling at 390 × 844.
- There is pull-to-refresh where the browser supports it, and always a visible Refresh button.
- Later, use `navigator.setAppBadge(count)` behind a feature check, once installed.

**Engine.** None. It reads `GET /shops/{id}` and the actions slice.

**Fixtures.** None.

**Acceptance criteria**
- **Fixtures, routed:** `/m/shops/syn-012` shows "2 offers need a reply", a capacity card and "Get CWB W47.1 → 3 more jobs · $5.1M". There are no renewal cards, because syn-012's CPCSC L1 is `ok` until 2027-09-06.
- **After funding TP-01:** it shows "5 offers need a reply" (NG-021, NG-022, NG-031, NG-032, NG-033) and "4 welders in training". The readiness card is gone or shows the next item.
- `/m/shops/syn-001` shows the CGP renewal card with NG-004 and its credit at risk. This depends on T4's data change.
- After accepting both offers, the offers card disappears, and the order of the remaining cards does not change.

### 2.3 T3: Offer card v2, decide in 60 s, and the prime hears it

**User story.** As an owner or estimator, I want each offer to answer "can we do it, is it worth it, what's the catch" on one phone screen. I want to Accept, Decline with a reason, or Ask the prime, and have Northgate actually see my answer.

**Screens and routes**

- **`/m/shops/[id]/offers`** lists `OfferListCard`s: newest unanswered first, then answered ones greyed with a status chip. Each card shows the description, the value (largest type), hours per week, a reply-by chip and a decision chip.
- **`/m/shops/[id]/offers/[jobId]`** shows `OfferCard` top to bottom:
  1. Part number, description, material chip, process chips, fleet-lifetime quantity, "unit price as given", **total value** and **hours per week** (the two largest numbers), and distance to site (from `Assignment.distance_km`).
  2. "Why you": the 3 `reasons[]` as a check list.
  3. **"Can we do it?"** (`FitChecklist`), computed by `web/lib/app/fit.ts` → `fitChecklist(job, shop, certs, acceptedLoadHours): FitItem[]`:
     - process ✓ (`job.process_tags ⊆ shop.processes`)
     - material ✓
     - envelope ✓ (sorted-dimension comparison, as in docs/api.md)
     - each required certification ✓/✗ with its status (the counting statuses are `verified`, `declared` and `pending_training`)
     - controlled → CGP ✓
     - capacity: "Your load after accepting: 46 / 200 h/wk"
  4. The strip "**No bidding.** Northgate offered this job only to you. **Northgate earns $1.68M ITB credit (2x SME) if you accept.** Simplified ITB rules for demo."
  5. "Payment terms: set by the prime. Not in demo data" (`assumption`). No invented net-N terms.
  6. The drawings line:
     - Controlled jobs: "Drawings are never stored in Shieldworks. After you accept, Northgate releases the technical data package through its own controlled channel once your CGP registration is confirmed."
     - Other jobs: "Drawings are released by Northgate after acceptance, outside Shieldworks."
  7. A "Send to estimator" button uses the Web Share API with the deep link and a plain-text summary with no geometry, falling back to copying the link.
- **Sticky `DecisionBar`** with three `touch-lg` buttons:
  - **Accept**: Sonner toast "Accepted · Undo" lasting 10 s. Undo sends `decision: "undo"`.
  - **Decline**: opens `DeclineSheet` with reason chips: No capacity · Price too low · Tooling/process · Schedule · Not our process · Other, plus an optional note of at most 280 characters.
  - **Ask Northgate**: opens `AskSheet` with templated questions: Lead time · Material supply · First-article inspection requirement · Split the quantity. No free-text thread.
- **After a decision** the bar turns into a status row: "Accepted Sep 26, 9:41 PM", or "Declined: no capacity", or "Question sent: lead time". A secondary button allows a change.

**Mobile behaviour**
- The card must be readable in about 5 seconds.
- No swipe-to-accept.
- Undo replaces a confirmation modal.
- Reason chips replace typing.
- Offline decisions show a "Will send" chip until the outbox flushes.

**Engine: new endpoints.** These are additive and each is a `CONTRACT:` commit. Logic lives in a new `engine/shopside.py`, and `engine/app.py` only wires the routes.

`POST /shops/{shop_id}/offers/{job_id}/decision`
```json
// request
{ "decision": "accepted" | "declined" | "question" | "undo",
  "reason_code": "capacity" | "price" | "tooling" | "schedule" | "not_our_process" | "other" | null,
  "question_code": "lead_time" | "material_supply" | "first_article" | "quantity_split" | null,
  "note": "string ≤ 280 chars" | null,
  "idempotency_key": "uuid" }
// 200 response
{ "decision": { "shop_id": "syn-012", "job_id": "NG-022", "decision": "declined",
                "reason_code": "capacity", "question_code": null, "note": null,
                "at": "2026-09-26T21:41:07Z", "idempotency_key": "…" },
  "assignment_status": "declined",
  "event": { /* Event, see below */ } }
```

**Decision rules**
- **Errors:**
  - 400 `{"detail":"Route the program first"}` when the program is not routed.
  - 404 for an unknown shop.
  - 404 `{"detail":"Job 'NG-099' is not offered to shop 'syn-012'"}`.
  - 400 when `declined` is sent without `reason_code`, or `question` without `question_code`.
  - 400 for an unknown code.
- **Effects:**
  - `accepted` and `declined` set `state.assignments[job_id]["status"]` (already in the `assignment.status` enum).
  - `question` leaves the status `offered`.
  - `undo` sets the status back to `offered` and deletes the decision.
- **Idempotency:** the same `idempotency_key` returns the stored response and emits no new event.
- **The ledger is unchanged.** A declined job still counts as routed tonight. The prime UI says "Declined · counted as routed until re-routed (demo)". Re-routing is stretch X2.

`GET /shops/{shop_id}/actions`: everything the shop has told Shieldworks.
```json
{ "shop_id": "syn-012",
  "routed_at": "2026-09-26T21:30:00Z" | null,
  "decisions": [ /* OfferDecision[] */ ],
  "funding_requests": [ /* FundingRequest[] (T5) */ ],
  "capacity": { /* CapacityCheckin (T7) */ } | null,
  "declared_certs": [ /* CertDeclaration[] (T4) */ ] }
```

`GET /programs/{program_id}/actions`: the same lists across all shops (no `shop_id` key, `capacity` is a list), used by the prime feed and the Gaps badge.

`GET /programs/{program_id}/events?since=0&limit=100`
```json
{ "program_id": "northgate", "last_seq": 7,
  "events": [ { "seq": 7, "ts": "2026-09-26T21:41:07Z",
                "kind": "offer_declined",
                "shop_id": "syn-012", "shop_name": "Tallowfield Fabricating Ltd.",
                "job_id": "NG-022", "package_id": null,
                "value_cad": 777600.0, "credit_cad": 1415232.0,
                "message": "Tallowfield Fabricating Ltd. declined NG-022: no capacity",
                "payload": { "reason_code": "capacity" } } ] }
```

**Events**
- `kind` is one of: `routed | offer_accepted | offer_declined | offer_question | offer_undo | funding_requested | package_funded | capacity_confirmed | cert_declared`.
- Events are emitted by the new endpoints, plus two hooks in `app.py`:
  - after `POST /route` succeeds → `routed` (this is how `routed_at` is known)
  - after `POST /fund` succeeds → `package_funded`, with `credit_cad = credit_added`
- The events read goes through `_read` with cache key `("events", since, limit)`.

**CORS.** Extend `allow_origin_regex` to cover private LAN hosts (`192.168.*`, `10.*`, `172.16–31.*`) on any port, so a real phone can reach the engine during a demo. Never use `*`.

**Data changes (`engine/state.py`).** The `State` dataclass gains fields with empty defaults. `from_json` already ignores unknown keys, so older databases still load.
```python
offer_decisions: dict[str, dict]           # "shop:job" → OfferDecision (+ "_response" for idempotency)
funding_requests: dict[str, dict]          # package_id → FundingRequest
capacity_checkins: dict[str, dict]         # shop_id → CapacityCheckin
cert_declarations: dict[str, dict]         # shop_id → {cert_type: CertDeclaration}
events: list[dict]                         # Event, seq starts at 1
idempotency: dict[str, dict]               # idempotency_key → stored response
```

**Lifecycle**
- Reset → everything is empty (the fresh `State`).
- Upload → clear `offer_decisions`, `funding_requests`, `events` and `idempotency`. Keep capacity and certificate declarations.
- Route → clear `offer_decisions` and `funding_requests`, then append `routed`.

**Fixtures.** `scripts/build_app_fixtures.py` runs the engine in-process (FastAPI `TestClient` with a temporary `MUSTER_DB`) through reset → upload → route → decisions → request → fund. It writes example responses to `data/fixtures/app/`: `decision_accept_NG-021.json`, `decision_decline_NG-022.json`, `shop_actions_syn-012.json`, `program_actions.json`, `events.json`, `funding_request_TP-01.json`, `capacity_syn-012.json`, `cert_declare_syn-012_CPCSC_L1.json`, and its own `index.json`. **Do not touch `data/fixtures/index.json`.** The web fixture mode does not read these files; they are the contract examples and test goldens.

**docs/api.md.** Add "§6 Shop actions and events (additive, v0.2)" with the shapes above.

**Acceptance criteria**
- In live mode, Accept on the phone makes `GET /programs/northgate/assignments` show `"status":"accepted"` for NG-021, and the laptop's `ActivityBell` (T6) shows a toast within 4 s.
- Declining NG-022 with "No capacity" shows in the prime feed as "declined NG-022: no capacity".
- Retrying the same `idempotency_key` produces no duplicate event.
- `pytest engine/tests/test_shopside.py` covers every error case, idempotency, undo, reset/upload/route clearing, and "the ledger is unchanged after a decline".
- Existing fixtures are byte-identical, and demo-check is 8/8 in both modes.

### 2.4 T4: Compliance wallet with real renewal rules, tied to work at risk

**User story.** As an owner or quality manager, I want every certification to show when it expires, the real deadline to act, what to do, and which of my jobs and whose credit depend on it, so a lapse never silently kills work.

**Screens and routes**

- **`/m/shops/[id]/certs`** shows one `CertRow` per certification, sorted by soonest deadline. Collapsed, a row shows:
  - the certification name
  - a status chip: verified / declared / unknown / pending training, plus "illustrative" for synthetic shops and "shop-declared" for dates the shop entered
  - a stage badge: OK / Window open / Urgent / Lapsed / Date unknown
  - a big "days left" number
- **Expanded** (and when opened via `#CGP`), a row adds:
  - `CountdownBar` shading the act-by window
  - expiry date and act-by date
  - the official action text, with a source link (opens externally)
  - "**At risk if it lapses:** NG-004 · $2.8M work · $5.06M Northgate credit". For CGP, the jobs at risk are this shop's assigned **controlled** jobs. For other types, they are assigned jobs whose `required_certs` include the type.
  - a registry link: CGP directory, CWB certified-company directory, or IAF CertSearch
  - the note "A wall certificate alone isn't proof; primes check the registry" (CWB, VERIFIED)
- **"Add expiry date"** opens `AddExpirySheet`: a native date input plus an optional certificate number. It calls `declareCertExpiry`, and the row then reads "shop-declared · not yet used for routing". It is never "verified".
- **Pure logic** in `web/lib/app/renewals.ts`:
  ```ts
  export function renewalFor(cert: CertWithDates, ctx: { today: Date; shopId: string;
    jobsById: Record<string, Job>; assignments: Assignment[] }): Renewal
  // Renewal = { cert_type, status, expires_at: string|null, act_by: string|null, days_left: number|null,
  //   stage: "ok"|"window_open"|"urgent"|"lapsed"|"unknown", action: string, consequence: string|null,
  //   source_url: string, registry_url: string|null, flag: "verified"|"assumption",
  //   jobs_at_risk: string[], value_at_risk_cad: number, credit_at_risk_cad: number, date_basis: "illustrative"|"shop-declared"|"registry" }
  ```
- **Stage rules.**
  - `act_by = expires_at − act_by_days`.
  - The stage is:
    - `lapsed` when today > expires_at
    - `urgent` when today ≥ act_by − 30
    - `window_open` when today ≥ act_by − remind_days
    - `ok` otherwise
    - `unknown` when there is no date
  - A certification with status `unknown` never shows a stage; it shows "Not held" instead.

**New file `data/rules/renewals.json`** (owned by Agent C). Only the values below. Anything not sourced gets `"flag": "assumption"`.

| cert_type | act_by_days | remind_days | Rule text shown | Source |
|---|---|---|---|---|
| `CGP` | 90 (VERIFIED) | 60 (assumption) | "Registration lasts up to 5 years. File renewal at least 90 days before expiry. Processing takes up to 32 business days. If it lapses you must re-register from scratch." | canada.ca CGP renew page (modified 2025-05-08); register page (modified 2026-03-11) |
| `CPCSC_L1` | 0 | 60 (assumption) | "Annual self-assessment against 13 controls using the official tool. Always shop-declared; there is no public registry." | PSPC news 2026-04 |
| `AS9100` | 90 (assumption: recertification audit before expiry) | 60 (assumption) | "Certificate up to 3 years with annual surveillance audits." | p-r-i.org certification policy |
| `ISO9001` | 90 (assumption) | 60 (assumption) | "3-year certification cycle with annual surveillance (assumption: same cycle as AS9100). Check on IAF CertSearch." | iafcertsearch.org (lookup only) |
| `NADCAP:*` | 90 (assumption) | 60 (assumption) | "Read the expiry off the certificate (typically 12–24 months). Shieldworks does not compute merit tiers." | PRI Nadcap getting-started |
| `CWB_W47.1` | null | null | "Company certification kept current through CWB audits. Check the CWB certified-company directory." | cwbgroup.org W47.1 page |
| `CWB_WELDER_TICKET` (used by T8 only) | 0 | 90 | "Valid 2 years while continuously employed by a CWB-certified company. Check test from 90 days before to 90 days after expiry; after that, a full retest. May lapse after 3 months without using the process (confirm on the welder's card)." | cwbgroup.org welder-qualification-testing (3-month rule: INFERRED) |

**Data change (the only change to existing data tonight).** In `scripts/build_fixtures.py` `build_shops()`, override one date:
- `syn-001` (Tessellate Precision Machining, Kitchener) **CGP `expires_at = "2027-01-15"`**
- note: "Synthetic shop: self-declared (illustrative date, inside the CGP renewal window for the demo)"

Then run `make fixtures`. Expected diff: that certificate in `data/processed/shops_synthetic.json` only, because `shops.json` carries only `cert_summary`. Confirm with `make fixtures-check` 8/8 and live demo-check 8/8. Expiry is not a routing filter, so no numbers move.

Resulting demo line (today 2026-09-26): **"CGP · Urgent · file renewal by Oct 17 (21 days) · processing up to 32 business days · NG-004 · $2.8M work · $5.06M Northgate credit at risk."**

**Engine: new endpoint (additive).**

`POST /shops/{shop_id}/certifications/{cert_type}`
```json
// request
{ "expires_at": "2027-04-30", "cert_number": "string ≤ 40" | null, "idempotency_key": "uuid" }
// 200
{ "declaration": { "shop_id": "syn-012", "type": "CPCSC_L1", "expires_at": "2027-04-30",
                   "cert_number": null, "status": "declared", "declared_at": "2026-09-26T21:50:00Z",
                   "note": "Shop-declared; not used for routing until reviewed" },
  "event": { /* Event kind cert_declared */ } }
```
- **Errors:** 400 for an unknown `cert_type` (the enum in docs/api.md §1); 400 for an invalid date or a date more than 10 years out; 404 for an unknown shop.
- It is stored in `cert_declarations` only. It **does not** change `state.shops` or routing.

**Mobile behaviour**
- Rows collapse to a chip plus countdown.
- Registry and source links open in a new tab.
- Camera capture of certificates is roadmap (wk 3), with the banner "Certificates only. Never photograph drawings or technical data."

**Acceptance criteria**
- `/m/shops/syn-001/certs` shows CGP as **Urgent** with act-by 2026-10-17, NG-004 at risk, and a working canada.ca link.
- The syn-012 wallet shows CPCSC L1 as **OK** until 2027-09-06 (renews 2027-09-06, `illustrative`). Other types show "Not held".
- Adding a date to a certification persists across reload in both modes and shows "shop-declared".
- Every rule row shows its source link or `AssumptionTag`.
- Unit tests for `renewalFor` (a plain TS test file run by `node --test` via `tsx` if available; otherwise a `scripts/check_renewals.mjs` assertion script) cover every stage boundary.

### 2.5 T5: Readiness roadmap, "Ask Northgate to fund this", and the W47.1 wording fix

**User story.** As an owner, when Shieldworks says "Get CWB W47.1 → 3 more jobs, $5.1M", I want to see what that actually takes (steps, stated time and cost, who pays) and ask the prime to fund it with one tap.

**Screens and routes**

- **`/m/shops/[id]/grow`** lists the readiness items, each with a "Qualified / One gap" tier chip.
- **`/m/shops/[id]/grow/[req]`** is `ReadinessStepper`:
  - Header: "Unlocks NG-031 · NG-032 · NG-033 · $5.1M · +80 welding h/wk (assumption)".
  - Steps come from **`data/rules/readiness_steps.json`** (owned by Agent R). Each step is `{label, detail, source_url, time_stated|null, cost_stated|null, flag}`.
  - **`CWB_W47.1`** is a *company* certification. Its steps:
    - a qualified welding supervisor (CWB written and verbal exams)
    - an approved welding procedure specification per process
    - an engineer depending on division (Division 1 full-time, Division 2 retained, Division 3 none)
    - every production welder tested for the processes and positions used (FW/S/T tickets)
    - periodic CWB audits
    - "Test centres set their own dates and fees" (no invented costs)
  - **`CGP`**: free · up to 32 business days for complete applications · designated official · security plan.
  - **`CPCSC_L1`**: free annual self-assessment, 13 controls, link to the official tool.
  - `AS9100` and `ISO9001`: steps only, with **no cost figures**. Consultant estimates are INFERRED and not shown.
- **"Who pays" block:**
  - The linked package (`training[]` entry, plus the `gaps.suggestions` item by `package_id`): "Northgate can fund the welder qualifications: $96K → $480K ITB credit (5x)", tagged `assumption`.
  - "May also be eligible: Canada-Ontario Job Grant: up to $10K per trainee; employers under 100 staff pay at least 1/6. Verify eligibility; stacking with prime funding not confirmed", with a link. Stacking is UNKNOWN.
- **Primary CTA "Ask Northgate to fund this"** (`touch-lg`, thumb zone):
  - It calls `requestFunding(shopId, requirement)` and the chip then reads "Requested Sep 26 · awaiting Northgate".
  - After the prime funds the package, the chip reads "Funded · 4 welders in training" and links to the trainee card.
- **Wording fix (web only tonight).** `web/lib/app/copy.ts` exports `packageTitle(pkg)`. For `gap.kind === "cert"` with `cert_unlock === "CWB_W47.1"` it returns "Qualify 4 welders (FCAW/GMAW) under CSA W47.1 at Tallowfield Fabricating (Woolwich)". Company certification also needs a qualified supervisor and approved WPSs. It is used on `/m`, and in `web/components/gaps/suggestion-card.tsx` in place of `pkg.title`.
  - The engine and fixture strings stay as they are until after the freeze (roadmap wk 1, `CONTRACT:`).
  - Update the spoken line in `docs/demo-script.md`: "certify 4 welders" → "qualify 4 welders under W47.1". That is a doc edit by the integrator, not an agent.
- **Desktop Gaps page:**
  - `suggestion-card.tsx` shows a **"Shop requested · 9:44 PM"** badge (colour, icon and text) when `useAppActions().fundingRequests[pkg.id]` exists.
  - `gaps-view.tsx` sorts requested packages first.
  - The Fund button, headline and animation are untouched.

**Engine: new endpoint (additive).**

`POST /shops/{shop_id}/funding-requests`
```json
// request
{ "requirement": "CWB_W47.1", "idempotency_key": "uuid" }
// 200
{ "request": { "package_id": "TP-01", "shop_id": "syn-012", "requirement": "CWB_W47.1",
               "status": "requested", "at": "2026-09-26T21:44:00Z" },
  "event": { /* Event kind funding_requested, value_cad = unblocks_value_cad, credit_cad = est_credit_cad */ } }
```
- It finds the package in `state.packages` where `shop_id` matches and `gap.requirement == requirement`.
- **Errors:**
  - 400 if the program is not routed.
  - 404 `{"detail":"No training package for CWB_W47.1 at shop 'syn-012'"}`.
  - 409 `{"detail":"Training package 'TP-01' is already funded"}`.
  - A repeat request returns the existing one (200, no new event).
- `status` in the `actions` reads is derived: `funded` when `state.packages[pid].status == "funded"`.

**Mobile behaviour**
- A vertical stepper, one step per row, with external-link icons.
- A single primary CTA.
- The request status appears as a chip.

**Acceptance criteria**
- Tapping the CTA on the phone makes TP-01 on the laptop's `/gaps` show "Shop requested" within 4 s (live) or 1 s (fixture tabs), sorted first.
- Clicking Fund on the laptop runs the existing moment unchanged, and the phone chip becomes "Funded".
- No step shows a cost or time unless it has a `source_url`.
- The TP-01 title reads "Qualify 4 welders … under CSA W47.1" on both `/m` and `/gaps`.

### 2.6 T6: Prime activity feed (phone) and desktop bell

**User story.** As Northgate's supplier-development lead, walking a shop floor, I want my phone (and the laptop) to tell me who accepted, who declined and why, who asked for funding, and which supplier certifications put credit at risk.

**Screens and routes**

- **`/m/prime`** has three sections:
  1. **`GlanceCard`** from `useDemo().ledger`: obligation met (%), SMB progress vs the 15% target, and training credit. It fits above the fold at 390 px and is labelled "Simplified ITB rules for demo".
  2. **Activity**, from `useAppActions().events`, newest first, as `ActivityItem` rows at least 64 px tall with one verb each:
     - `offer_accepted`: "Tallowfield accepted NG-021 · +$1.68M credit" → View.
     - `offer_declined`: "Tallowfield declined NG-022: no capacity · counted as routed until re-routed (demo)" → "Re-route". The button is disabled with "coming soon" unless X2 ships.
     - `offer_question`: "Tallowfield asked about lead time on NG-021" → "Reply by email". This is a `mailto:` to the shop's `contact_role_email`, subject only.
     - `funding_requested`: "Tallowfield asked you to fund CWB W47.1 · $96K → $480K credit" → "Review in Gaps" (`/gaps`).
     - `package_funded`: "TP-01 funded → 3 jobs unblocked · +$9.1M credit".
     - `capacity_confirmed`: "Tallowfield: 40 h/wk free · accepted 46 h/wk · over by 6 h".
  3. **Supplier status:** for every shop with an assignment, compute `renewalFor()` over its certifications and list stages `urgent`, `window_open` and `lapsed` with the credit at risk: "Tessellate Precision (synthetic) · CGP renewal due Oct 17 · NG-004 · $5.06M credit at risk". Tapping opens `/m/shops/syn-001/certs#CGP`.
     - Live mode: `GET /shops/{id}` per assigned shop, about 22 calls, cached.
     - Fixture mode: dates come from `shops_synthetic.json` through `useShopBundle`'s helper, exported as `certsForShop(id)`.
- **`web/lib/app/feed.ts`**: `feedItems(events, ledger, supplierRenewals): FeedItem[]`, a pure function.
- **Desktop `ActivityBell`** (`web/components/shell/activity-bell.tsx`), added to `AppHeader`:
  - a bell icon with an unread count
  - a popover listing the last 10 events
  - a Sonner toast for each new event while the page is open. This is the laptop half of the two-sided demo moment.
  - `AppHeader` also gets the "Phone view" link to `/m`.

**Mobile behaviour**
- Read-first, one button per card.
- No Web Push tonight. Polling or storage-event updates run only while visible.

**Engine.** Uses `GET /programs/{id}/events` and `GET /programs/{id}/actions` from T3. Nothing new.

**Acceptance criteria**
- With the phone window on `/m/shops/syn-012/offers/NG-021` and the laptop on `/program`: tap Accept, and the laptop toast "Tallowfield Fabricating Ltd. accepted NG-021 (+$1.68M credit)" appears within 4 s (live) or 1 s (fixtures).
- `/m/prime` lists the syn-001 CGP risk line.
- After reset, both the feed and the bell are empty.

### 2.7 T7: Weekly one-tap capacity check-in

**User story.** As a floor lead or owner, I want Shieldworks to ask once a week how many hours I actually have free, answerable in one tap, so I only get offers I can staff and the prime knows when I'm full.

**Screens.** `CapacitySheet` (`web/components/mobile/today/capacity-sheet.tsx`) opens from the Today card and from a "Confirm capacity" row on the Grow tab.
- Title: "Free hours per week, next 4 weeks?"
- One chip row per process the shop runs (from `shop.processes`): **0 · 20 · 40 · 80 · 120+**.
- A "Same as last time ✓" chip.
- A horizon toggle: 4 / 8 / 12 weeks.
- After submitting:
  - "Confirmed Sep 26 · 40 h/wk free".
  - If the accepted load is above the free hours: a warning card "You're 6 h/wk over on accepted work. Consider declining an offer or asking Northgate to split the quantity" (links to offers).
  - Fine print: "Routing still uses your profile capacity; confirmed capacity feeds routing in the next release."

**Engine: new endpoint (additive).**

`POST /shops/{shop_id}/capacity`
```json
// request
{ "hours_week": 40, "by_process": { "welding": 40, "sheet_metal": 0, "painting": 0 } | null,
  "horizon_weeks": 4 | 8 | 12, "idempotency_key": "uuid" }
// 200
{ "capacity": { "shop_id": "syn-012", "hours_week": 40, "by_process": { "welding": 40 },
                "horizon_weeks": 4, "confirmed_at": "2026-09-26T21:52:00Z",
                "used_in_routing": false },
  "accepted_load_hours": 46, "offered_load_hours": 46, "over_by_hours": 6,
  "event": { /* capacity_confirmed */ } }
```
- `hours_week` is either given or the sum of `by_process`.
- **Errors:** 400 if `hours_week` is below 0 or above 2000, if a key in `by_process` is not a `process_tag`, or if `horizon_weeks` is not 4, 8 or 12.
- `accepted_load_hours` is the sum of `hours_week` over this shop's assignments with status `accepted`. `offered_load_hours` is the sum over all its assignments.
- It does **not** modify `capacity_hours_week` or routing tonight.

**Mobile behaviour.** Chips only, no typing, answerable in under 5 seconds, works on a shared floor tablet.

**Acceptance criteria**
- A check-in hides the Today capacity card for 7 days.
- The over-capacity warning appears when accepted hours exceed the free hours.
- The prime feed shows the `capacity_confirmed` line.
- Demo numbers are unchanged after a check-in.

### 2.8 T8: Trainee seat card (pseudonymous)

**User story.** As a welder in a prime-funded seat, I want to see my program stage, my next step, what my ticket will need to stay valid, and which real jobs it helps unlock at my shop, without Shieldworks ever showing my name.

**Screens and routes**

- **`/m/trainee/[packageId]?seat=3`** (web only):
  - Header: "Seat 3 of 4 · TP-01 · Tallowfield Fabricating (synthetic)".
  - `SeatStepper` shows the stages nominated → eligibility attested → enrolled → started → test booked → passed → ticket issued. In the demo, the current stage is "enrolled" after funding, with an `assumption` tag.
  - The provider shows as "Conestoga College (example, not affiliated)", from `recipient_example`.
  - An "Add test date to calendar" `.ics` download (`web/lib/app/ics.ts`, about 30 lines). The example date is funding date + 6 weeks, tagged `assumption`.
  - `TicketPreview` shows process, class (FW/S/T), position, and the `CWB_WELDER_TICKET` rule text from `renewals.json` with its source link.
  - The `PathToWork` block reads: "Your ticket helps unlock 3 hull-stowage jobs at your shop: NG-031 · NG-032 · NG-033 ($5.1M)". It uses `fundResults["TP-01"].unblocked_jobs`, or `package.blocked_job_ids`.
  - Eligibility note: "Personal certification credit applies to Canadian citizens and permanent residents. Your shop records a yes/no attestation only; Shieldworks stores no ID documents" (ITB model terms §7.5.1).
- **Before funding:** "This seat isn't funded yet. Your shop has asked Northgate" if a request exists, otherwise just "This seat isn't funded yet."
- **Links:** Today's training card and the Grow "Funded" chip link to seat 1. The `/m` role picker links to seat 3.

**Mobile behaviour.** Designed for a personal phone: one scroll, a large stepper, a shareable private link, and no personal data fields.

**Engine.** None. It reads `useDemo().gaps`, `useDemo().fundResults` and `GET /shops/{id}` `training[]`.

**Acceptance criteria**
- Before funding it shows "not funded yet". After funding TP-01 it shows the stage, the `.ics` download (which opens in the iOS Calendar), and the 3 jobs.
- No name field exists anywhere.
- Every date carries `AssumptionTag`.

### 2.9 Stretch (only once T1–T8 pass every gate, and not after 5:30 AM)

- **X1: Tender radar, web only.**
  - `/m/tenders` reads `data/processed/tenders_defence.json` (25 sample notices).
  - Header: "62 defence-buyer manufacturing notices still open (CanadaBuys, retrieved 2026-09-26)".
  - Region chips, and a "Closes in N days" badge computed from `appToday()`.
  - Tapping a notice opens a CanadaBuys search for `solicitation_number`, because `url` is null in the sample.
  - OGL–Canada attribution.
  - Adds a 5th tab only if it fits at 360 px; otherwise a link from Today.
- **X2: Re-route**, `POST /programs/{id}/jobs/{job_id}/reroute`, body `{ "exclude_shop_ids": ["syn-012"] }`.
  - It picks the best eligible shop with remaining capacity using the existing `Context.evaluate` and `score`, and replaces the assignment. The response is `{assignment, previous_shop_id, credit_delta_cad, event}`, or `{"blocked": true, "reason"}`.
  - It **changes the ledger**, so it ships only if demo-check still passes on the untouched flow, and only with tests. Otherwise it stays on the roadmap.

### 2.10 File ownership (parallel agents, no shared files)

| Agent | Starts | Owns (creates or edits) | Must not touch |
|---|---|---|---|
| **E: engine and contract** | t0 | `engine/shopside.py` (new), `engine/state.py` (new fields only), `engine/app.py` (new routes, route/fund event hooks, CORS regex), `engine/tests/test_shopside.py`, `scripts/build_fixtures.py` (the syn-001 CGP date only) and the regenerated `data/processed/shops_synthetic.json`, `scripts/build_app_fixtures.py`, `data/fixtures/app/*`, `docs/api.md` §6 | anything in `/web`; existing fixture files other than the regenerated shops file |
| **S: shell and foundation** | t0 (types and hooks committed by t0 + 60 min) | `web/app/manifest.ts`, `web/app/apple-icon.tsx`, `web/app/icons/[size]/route.tsx`, `web/app/layout.tsx`, `web/components/shell/chrome-gate.tsx`, `web/app/m/layout.tsx`, `web/app/m/page.tsx`, `web/components/mobile/shell/*` (bottom-tabs, m-header, m-footer, freshness-stamp, offline-banner, ios-install-hint), `web/components/ui/button.tsx`, `web/lib/app/{types,today,api,actions-store,shop-bundle,strings}.ts(x)` | `store.tsx`, `mode-switcher.tsx`, any existing page component |
| **O: offers** | t0 + 60 | `web/app/m/shops/[id]/offers/**`, `web/components/mobile/offer/*` (offer-list-card, offer-card, fit-checklist, decision-bar, decline-sheet, ask-sheet), `web/lib/app/fit.ts` | desktop `components/shop/*` |
| **T: Today and capacity** | t0 + 60 | `web/app/m/shops/[id]/page.tsx`, `web/components/mobile/today/*` (today-view, attention-card, capacity-sheet), `web/lib/app/attention.ts` | — |
| **C: wallet** | t0 + 60 | `data/rules/renewals.json`, `web/lib/app/renewals.ts` (+ its test), `web/app/m/shops/[id]/certs/page.tsx`, `web/components/mobile/wallet/*` (cert-row, countdown-bar, stage-badge, add-expiry-sheet) | `components/shop/certifications-card.tsx` |
| **R: readiness and trainee** | t0 + 60 | `data/rules/readiness_steps.json`, `web/lib/app/{readiness,copy,ics}.ts`, `web/app/m/shops/[id]/grow/**`, `web/app/m/trainee/**`, `web/components/mobile/{grow,trainee}/*`, **plus** `web/components/gaps/suggestion-card.tsx` (badge and `packageTitle` only) and `web/components/gaps/gaps-view.tsx` (sort only) | Fund button, headline, animation, `fund-moment.tsx` |
| **P: prime feed** | t0 + 60 | `web/app/m/prime/page.tsx`, `web/components/mobile/prime/*` (glance-card, activity-item, supplier-status), `web/lib/app/feed.ts`, `web/components/shell/activity-bell.tsx`, `web/components/shell/app-header.tsx` (bell and "Phone view" link) | `program-context-bar.tsx`, scorecard components |
| **I: integrator** (a human or the lead session) | t0 + 4 h | runs every gate, the smoke script and the demo rehearsal; edits `docs/demo-script.md` and `docs/pitch.md` wording (W47.1); CLAUDE.md §13 log | — |

**Interface contracts between agents** (so nobody waits):
- T and P import `renewalFor` from C's `renewals.ts`, using the signature in §2.4. Until C lands, stub it locally with an identical signature that returns `stage: "unknown"`.
- O, T, C, R and P import only from `web/lib/app/*` (S) and `useDemo()`.

**`/m` smoke check** (the integrator adds `scripts/smoke_mobile.mjs`, or runs it by hand in headless Chrome at 390 × 844):
- Visit `/m`, `/m/shops/syn-012`, `/offers`, `/offers/NG-021`, `/certs`, `/grow`, `/grow/CWB_W47.1`, `/m/prime`, `/m/trainee/TP-01?seat=3` and `/m/shops/syn-001/certs`.
- On each: 0 console errors, `scrollWidth <= innerWidth`, and every `button` and `a[role=button]` at least 44 × 44 px.

**Suggested timeline** (relative; hard stop for new work at 7:00 AM, 2.5 h before the 9:30 freeze):

| Time | Work |
|---|---|
| t0 → t0 + 1 h | S and E |
| t0 + 1 h → t0 + 4 h | O, T, C, R and P in parallel; E finishes the endpoints, tests and `api.md` |
| t0 + 4 h → t0 + 5 h | Integrate, gates, fix |
| t0 + 5 h | Stretch only if everything is green |
| last 90 min | Record the phone segment |

### 2.11 Demo segment (about 70 s, inserted after "Shop view" in docs/demo-script.md)

Laptop on `/program` or `/gaps`, and a 390 px phone window on `/m/shops/syn-012`, side by side.

1. The phone shows "2 offers need a reply · Get CWB W47.1 → 3 more jobs, $5.1M".
2. Tap NG-021. The offer card shows "No bidding · offered only to you · Northgate earns $1.68M credit" and a green "Can we do it?" checklist. Tap **Accept**. The laptop toasts "Tallowfield accepted NG-021 (+$1.68M credit)".
3. Decline NG-022 with "No capacity". The prime feed shows the reason.
4. On the Grow tab, open CWB W47.1: the company checklist, then "Ask Northgate to fund this". The laptop's `/gaps` card TP-01 shows **"Shop requested"**. Click **Fund** (the existing moment, unchanged). The phone's Today shows "4 welders in training" and 3 new offers.
5. The phone opens `/m/prime`: "Tessellate Precision · CGP renewal due Oct 17 · $5.06M credit at risk". Tap it to see the wallet row and its canada.ca source.
6. Show the trainee link for 3 s: "Seat 3 of 4 · your ticket helps unlock 3 jobs at your shop."

---

## 3. Roadmap (next 4 weeks, after the hackathon)

| Week | Build | Notes |
|---|---|---|
| 1 | **Alerts that reach owners** (L): SMS or email by default with CASL consent, sender ID and STOP/ARRET; magic-link deep links to one card; Sunday digest; push only after install, requested from a tap, Declarative Web Push on iOS 18.4+ | Tables `notification_prefs`, `consent_log`, `push_subscriptions` and `outbound_queue`; `GET/PUT /shops/{id}/alerts`, `POST /push/subscribe`, `POST /auth/magic-link`; VAPID keys in env only |
| 1 | **Re-route** (X2) if it wasn't shipped; **W47.1 wording** moved into `engine/gaps.py` and `build_fixtures.py` with a `CONTRACT:` fixture regeneration | Update the pitch and demo-script copy together |
| 1 | **Capacity feeds routing**: confirmed capacity becomes `capacity_hours_week`; profiles unconfirmed for more than 30 days are down-ranked and marked "capacity unconfirmed" on Network and in the why-popover; block-release weeks for apprentices | Needs time-sliced capacity in `assign.py` |
| 2 | **Claim your shop** (N): code to a role-based address on the shop's own domain, or an automated call; per-field confirm cards with source chips; ladder Discovered → Claimed → Business-matched → Certs checked → Proven; heavy data deferred until the first accepted offer | Never demo a real company claiming its profile |
| 2 | **Ledger on v6 ITB terms** (J): SMB direct at 70% CCV or more is deemed 100% (§7.3.3.2.2); 25% training cap with a headroom meter (§7.5.4.1); 10x tied to Indigenous workforce-development purpose; holdback % per program; region split; clause tooltips; footer "ITB administered by the DIA since 2026-07-16" | Changes every headline number: regenerate fixtures, demo_check targets and the pitch; check clause numbers against the v6 PDF |
| 2 | **FR/EN** (K): French dictionary for `/m`, `?lang=fr`, `fr-CA` number formats, `html lang`, bilingual tender titles; machine translation labelled "traduction automatique – à réviser" | — |
| 3 | **Offline for real** (Q): Serwist service worker (keep `turbopack.root`), IndexedDB outbox, `navigator.storage.persist()` after install, field-visit mode for prime supplier-development staff | Background Sync is Chromium-only |
| 3 | **Job milestones and cash** (M): PO → material → first-article → ship → invoiced → paid; photo capture only on non-controlled jobs, with a server-side hard reject when `controlled=true`; expected-cash strip | Feeds the evidence pack |
| 3 | **Certificate photo capture**: `capture=environment`, canvas re-encode to strip EXIF, "declared + photo", never "verified" | Banner: "Certificates only" |
| 3 | **Tender radar with matching** (I): `GET /tenders?province=&tags=`, full daily CSV, UNSPSC → process-tag map labelled as a keyword match | — |
| 4 | **ITB evidence pack** (O): register in the column order of ISED's 2020 annual-report template, Part C/D/E roll-ups, per-transaction evidence (PO, shipping, proof of payment, SMB basis), completeness %, draft `.xlsx` "finalize on your Protected B system"; the shop's CCV stays private | — |
| 4 | **Trainee seats for real**: tokenised `GET /seats/{id}`, coordinator updates, a `WelderTicket` object separate from company W47.1, ticket expiry feeding shop eligibility | Minimal data under PIPEDA |
| 4 | **Canada coverage view** (P): `/canada` region rows (ISED employment share, NAICS 3327 counts, Shieldworks coverage, RDA), and a Job Bank labour-market strip on gap cards | Fix CLAUDE.md §11's table citation (33-10-1095-01) through the human owner |

---

## 4. What we deliberately won't build (and why)

- **Bidding, reverse auctions or marketplace-set prices.** Shops leave networks that pit them against each other and control the customer relationship (Paperless Parts 2018 report; forum threads). "Offered only to you, no bidding" is the whole promise.
- **Drawing or technical-data storage, upload or preview.** Technical data is a controlled good. A lapsed CGP or a leaked file ends the product. The technical data package moves only through the prime's own channel.
- **Free-text chat between shop and prime.** Free text invites technical-data leaks and needs moderation. "Ask Northgate" uses templated questions, and replies go through email.
- **Native App Store / Play apps.** A PWA gets install, badges, camera and (after install) push on iOS 16.4+ and Android without store review. iOS 26 opens Home Screen sites as web apps by default.
- **Push-first notifications.** Native push opt-in is only about half (Airship 2025: iOS about 49%, Android about 59.5%), and iOS web push needs an install. SMS or email is the default channel (roadmap).
- **Automatic "verified" status** from photos, wall certificates or self-entry. CWB says a wall certificate is not proof. Verified needs a dated manual registry check.
- **Scraping** Canada's Business Registries, CADSI, IAQG OASIS or the CGP/CWB directories (CLAUDE.md §5). We link out and record the date checked.
- **Computed Nadcap merit tiers or invented renewal costs.** No primary source; consultant figures are INFERRED.
- **Personal names, ID documents, citizenship proof.** Only a yes/no attestation held by the shop (ITB §7.5.1 needs citizen/PR status only for the personal-certification category).
- **Financing, FastPay or payments.** Out of scope, regulated, and not our wedge.
- **Swipe-to-accept.** Accidental accepts on a shop floor. Tap plus undo instead.
- **Claims we can't source:** "98% SMS open rate", "first responder wins 42%", Airship "44.5% iOS" (that is the Media vertical only), "CAN/ASC-EN 301 549 is legally binding on vendors" (it is voluntary), and a general welder shortage in Kitchener–Waterloo–Barrie (Job Bank outlook is "Very limited"; the gap is welders qualified under a W47.1 shop, INFERRED).

---

## 5. Sources (all accessed 2026-09-26 by the research lanes unless noted)

**Shop behaviour and marketplaces**
- Xometry Workcenter mobile (push, offers, photo/status capture), GlobeNewswire 2025-10-09. VERIFIED. https://www.globenewswire.com/news-release/2025/10/09/3164221/0/en/xometry-launches-new-workcenter-experience-empowering-manufacturing-partners-to-accept-jobs-and-manage-work-on-the-go.html
- Xometry next-gen Workcenter (job review more than 60% faster and acceptance about 15% higher in early testing; company figures, web release), 2026-09-08. VERIFIED as a company claim. https://www.globenewswire.com/news-release/2026/09/08/3357744/0/en/xometry-unveils-its-next-gen-workcenter-experience-streamlining-how-manufacturing-partners-find-evaluate-and-accept-jobs.html
- Xometry: an outdated profile limits job eligibility, 2026-09-02. VERIFIED. https://www.xometry.com/resources/shop-tips/optimize-your-xometry-profile/
- Xometry payouts net-40, FastPay. VERIFIED. https://www.xometry.com/get-work/
- Paperless Parts American Job Shop Competitive Report (2018; a competitor's opinion). VERIFIED. https://www.paperlessparts.com/wp-content/uploads/2021/09/American-Job-Shop-Competitive-Report.pdf
- Hobby-Machinist Xometry thread (favouritism, no recourse). VERIFIED (forum). https://www.hobby-machinist.com/threads/xometry.97225/
- Owners quote at night: Tempus Tools blog, 2026-07-06. INFERRED (vendor). https://tempustools.com/blog/why-quote-speed-matters-more-than-price-in-fabrication
- Informal RFQ triage: CDO Advisors, 2026-08-25. INFERRED (vendor). https://www.cdoadvisors.com/ai/ai-quote-automation/
- Explanations raise recommendation acceptance: Cramer et al. 2008, UMUAI 18(5), doi:10.1007/s11257-008-9051-3. VERIFIED via summary.
- Protolabs Network 10-minute partner application. VERIFIED. https://www.hubs.com/become-a-manufacturing-partner/
- ICN Gateway how-it-works and FAQ. VERIFIED. https://gateway.icn.org.au/how-it-works · https://gateway.icn.org.au/faq
- SAP Business Network Supplier app, 3.4★ ("far to complicated for registration"). VERIFIED. https://apps.apple.com/us/app/sap-business-network-supplier/id1604643590
- SAP Ariba Procurement app, 2.8/5 from 70 ratings. VERIFIED. https://apps.apple.com/us/app/sap-ariba-procurement/id1451570638
- MaintainX offline mode (4.9★ field-app benchmark). VERIFIED. https://help.getmaintainx.com/offline-mode
- Thomasnet supplier badging. VERIFIED. https://help.thomasnet.com/supplier-badging
- Google Business Profile verification. VERIFIED. https://support.google.com/business/answer/7107242

**SME adoption, workforce and capacity**
- CFIB 2025, SMEs' digital transformation journey (10% fully integrated; barriers: skills 51%, time 49%). VERIFIED. https://www.cfib-fcei.ca/hubfs/research/reports/2025/SMEs%20Digital%20transformation%20journey-Final-EN-2025%201.pdf
- BDC, "Canada's defence boom is creating a three-speed SME divide", 2026-06-18 (21% at full capacity; 30% with significant recruiting difficulty). VERIFIED. https://www.bdc.ca/en/articles-tools/blog/canada-defence-boom-is-creating-a-three-speed-sme-divide
- StatCan, manufacturing workers aged 55+ at 24.2% (2022), published 2026-06-24. VERIFIED. https://www150.statcan.gc.ca/n1/pub/36-28-0001/2026006/article/00004-eng.htm
- StatCan apprenticeship outcomes (19.9% certify within program duration, 30.9% discontinue), 2025-12-11. VERIFIED. https://www150.statcan.gc.ca/n1/daily-quotidien/251211/dq251211e-eng.htm
- Pew 2022 via canadatelecoms.ca, 2023-01-19 (smartphone ownership 98% at ages 18–29, 72% at 50+). VERIFIED. https://canadatelecoms.ca/news/canadians-among-global-leaders-in-internet-usage-and-smartphone-ownership-pew-research-center-study-shows/
- Job Bank welders, Kitchener–Waterloo–Barrie outlook "Very limited" (updated 2025-12-10). VERIFIED. https://www.jobbank.gc.ca/marketreport/outlook-occupation/23261/geo27236
- Skilled Trades Ontario, welder trade (3 levels). VERIFIED. https://www.skilledtradesontario.ca/trade-information/welder/
- Canada-Ontario Job Grant (up to $10K per trainee; employers under 100 staff pay at least 1/6; modified 2026-08-31). VERIFIED. https://www.ontario.ca/page/canada-ontario-job-grant-cojg
- CCI Defence Procurement Readiness Program ($1,400). VERIFIED. https://defenceprocurement.ca/

**Compliance rules used in the wallet and readiness steps**
- CGP renew or terminate (renew at least 90 days before expiry; up to 32 business days; a lapse means re-registering), modified 2025-05-08. VERIFIED. https://www.canada.ca/en/public-services-procurement/services/industrial-security/controlled-goods/about-program/renew-or-terminate-registration.html
- CGP register (no cost, 32 business days, up to 5 years, designated official, security plan), modified 2026-03-11. VERIFIED. https://www.canada.ca/en/public-services-procurement/services/industrial-security/controlled-goods/about-program/register.html
- CGP public registry (updated daily; opt-outs exist). VERIFIED. https://www.canada.ca/en/public-services-procurement/services/industrial-security/controlled-goods/find-individuals-organizations-registered-program.html
- Controlled goods: technical data. VERIFIED. https://www.canada.ca/en/public-services-procurement/services/industrial-security/controlled-goods.html
- CPCSC Level 1 (13 controls, annual self-assessment, available since 2026-04-01), PSPC 2026-04. VERIFIED. https://www.canada.ca/en/public-services-procurement/news/2026/04/canadian-program-for-cyber-security-certification-level-1.html
- CWB welder qualification testing (2 years while employed at a certified company; check test ±90 days). VERIFIED. The 3-month non-use rule is INFERRED from card text. https://www.cwbgroup.org/services/certification/welder-qualification-testing
- CSA W47.1 company certification (supervisor, WPS, engineer by division, tested welders, audits). VERIFIED. https://www.cwbgroup.org/services/certification/company-certification/csa-w471-fusion-welding-of-steel
- CWB welding supervisor qualification. VERIFIED. https://www.cwbgroup.org/services/certification/company-certification/welding-supervisor-qualification
- CWB validating certification (a wall certificate is not proof). VERIFIED. https://www.cwbgroup.org/services/public-safety/validating-certification
- CWB certified-company directory. https://www.cwbgroup.org/directory/certified-companies
- PRI AS9100 certification policy (up to 3 years, annual surveillance). VERIFIED. https://www.p-r-i.org/registrar/resources/general-policies-and-procedures/certification
- IAF CertSearch. VERIFIED. https://www.iafcertsearch.org/

**ITB policy**
- ISED ITB page (multipliers 1x/2x/5x/10x; ITB to the DIA on 2026-07-16), modified 2026-08-05. VERIFIED. https://ised-isde.canada.ca/site/ised/en/procurement-services/defence-and-marine-procurement/industrial-and-technological-benefits-itb
- ITB Model Terms (§7.5.1 training categories and citizen/PR; §7.5.3 5x/10x; §7.5.4.1 25% cap; §7.3.3.2.2 SMB deemed 100%; §16 records). VERIFIED from a summarizer extract; check clause numbers against the v6 PDF. https://ised-isde.canada.ca/site/ised/en/procurement-services/defence-and-marine-procurement/industrial-and-technological-benefits-itb/itb-toolkit/itb-model-terms-and-conditions
- ITB verification (POs, shipping and proof of payment; CCV checked with the shop confidentially), modified 2026-07-29. VERIFIED. https://ised-isde.canada.ca/site/ised/en/procurement-services/defence-and-marine-procurement/industrial-and-technological-benefits-itb/itb-toolkit/what-expect-verification
- Norton Rose Fulbright on the updated ITB terms ($1M SMB cap removed), June 2026. VERIFIED. https://www.nortonrosefulbright.com/en-ca/knowledge/publications/7155d315/updated-itb-terms-and-conditions-key-changes-and-implications-for-canadian-defence-contractors

**Mobile platform**
- WebKit, Web Push for Home Screen web apps (iOS 16.4+, user gesture, manifest). VERIFIED. https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- WebKit Badging API. VERIFIED. https://webkit.org/blog/14112/badging-for-home-screen-web-apps/
- WebKit Declarative Web Push (iOS 18.4+). VERIFIED. https://webkit.org/blog/16535/meet-declarative-web-push/
- Apple, open as web app (iOS 26). VERIFIED. https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios
- caniuse, Background Sync (Chromium only). VERIFIED. https://caniuse.com/background-sync
- Next.js 16 PWA and offline guides, bundled at `web/node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` and `offline-support.md` (v16.3.6). VERIFIED locally.
- WCAG 2.2 (SC 2.5.8 target size, SC 1.4.1 use of colour). VERIFIED. https://www.w3.org/TR/WCAG22/
- Material 3 touch targets (48 dp). VERIFIED. https://m3.material.io/foundations/designing/structure
- Airship 2025 push benchmarks (native; iOS about 49%, Android about 59.5%; no web-push figure, so that rate is UNKNOWN). VERIFIED. https://growth.airship.com/rs/313-QPJ-195/images/Airship-2025-Push-Notification-Benchmarks-EN.pdf
- CRTC CASL FAQ (consent, sender ID, unsubscribe). VERIFIED. https://crtc.gc.ca/eng/com500/faq500.htm

**Canada fit and open data**
- ISED, State of Canada's Defence Industry 2026 (employment: ON 35%, QC 26%). VERIFIED. https://ised-isde.canada.ca/site/ised/en/research-and-business-intelligence/industry-sector-intelligence/manufacturing-industries/aerospace-and-defence/state-canadas-defence-industry
- ISED Canadian Industry Statistics, NAICS 3327 (QC 722 of 2,478 employer establishments). VERIFIED. https://ised-isde.canada.ca/app/ixb/cis/businesses-entreprises/3327
- CanadaBuys tender notices open data (OGL–Canada, daily, bilingual). VERIFIED. https://open.canada.ca/data/en/dataset/6abd20d4-7a1c-4b38-baa2-9525d0bb2fd2
- Repo `data/processed/tenders_defence.json` (retrieved 2026-09-26; 919 open notices, 376 defence-related, 62 defence-buyer manufacturing goods notices still open). VERIFIED locally.
- Defence Industrial Strategy (inventory of anticipated procurements). VERIFIED. https://www.canada.ca/en/department-national-defence/corporate/reports-publications/industrial-strategy/security-sovereignty-prosperity.html
- Quebec Charter of the French language s.52.1. VERIFIED via summary. https://www.legisquebec.gouv.qc.ca/en/version/cs/C-11?code=se:52_1

**Credibility follow-ups for the human owner** (not edited by agents):
- CLAUDE.md §11's ISED ITB links now redirect, because ITB moved to the DIA.
- CLAUDE.md §11 cites StatCan table 33-10-1097-01 where 33-10-1095-01 is meant.
- The pitch and demo script say "certify 4 welders to CWB W47.1". W47.1 is a company certification, so it should say "qualify 4 welders under the shop's W47.1".
