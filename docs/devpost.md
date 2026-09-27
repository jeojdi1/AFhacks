# Devpost submission text: Muster

**Tagline:** Muster turns defence contracts into work and workers for small Canadian factories.

---

## Inspiration

Budget 2025 adds $81.8B for defence over five years, and the February 2026 Defence Industrial Strategy targets 70% of defence acquisitions going to Canadian firms by 2035. On July 16, 2026, the day ITB authority moved to the Defence Investment Agency, Ottawa announced a nearly $2B armoured-vehicle deal built in London, Ontario, drawing on 600+ Canadian suppliers (PM release). Under the Industrial and Technological Benefits (ITB) policy, every major defence contractor must do business in Canada equal to 100% of its contract value, and the updated policy gives 2x credit for direct small-business work, 5x for cash spent on eligible skills and training (capped at 25% of the obligation, model terms §7.5.4.1), and 10x for Indigenous workforce development (ISED ITB overview).

Yet the two sides of that obligation can't find each other. Primes can't find qualified small shops: each prime runs its own siloed supplier portal. And the shops that could do the work are short on CWB-qualified welders: not welders in general (Job Bank rates Ontario's general welder outlook "very limited"), but welders qualified to CSA W47.1 at CWB-certified shops. In CWB's 2024 industry survey, 47% named a shortage of qualified workers as their most pressing issue, and CME's September 2026 report says lower vacancies haven't solved Ontario manufacturing's workforce challenge. We wanted a tool where a prime's obligation becomes a shop's opportunity.

## What it does

Muster is **two-sided**. Primes pay; shops use it free.

- **Route:** a prime uploads a parts list. Muster tags each line (processes, material, envelope, required certifications, controlled or not), filters shops on hard rules, scores the rest, and assigns each job to a qualified small Canadian shop. Controlled jobs only go to Controlled Goods Program-registered shops, and every assignment shows its top 3 reasons.
- **Credit:** a live ITB ledger. Credit = value × Canadian content (CCV) × multiplier. Direct vs indirect, SME 2x, SMB share vs target, and % of obligation met.
- **Train:** when no shop can take a job (missing certified workers or capacity), Muster proposes an ITB-eligible training package (model terms §7.5.1 categories). "Funding" it adds a pending-training certification and capacity, re-routes, unblocks the job, and earns 5x credit (10x for Indigenous workforce development).
- **Comply:** every shop shows its certifications (CGP, CPCSC Level 1, ISO 9001, AS9100, Nadcap, CWB W47.1) with source, date verified, status and expiry.

**Four roles, each with its own desk.** A landing page explains Muster in three panels; `/signin` ("Who are you today?") offers four demo accounts: the defence company (Northgate Land Systems, fictional), the supplier (Tallowfield Fabricating, synthetic), the training partner (a regional college, example, not affiliated) and the trainee (a pseudonymous seat, "Seat 3 of 4"). Demo sign-in only: no real authentication. Northgate's desk has **Find suppliers** and a **Supplier map**; Tallowfield's has **Find work** (its offers, jobs one certificate away, and open federal defence tenders).

**The shop side, on the phone** (`/m`): a shop sees defence job offers it would never have found, each offered only to that shop with the credit the prime earns, and accepts or declines with a reason; the prime sees each reply live on its laptop. The shop sees a readiness card ("Get CWB W47.1 → qualify for N more jobs worth $X"), taps "Ask Northgate to fund this", and after funding sees its welders in training on the prime's money. The prime's own phone view shows accepts, declines and funding requests, plus supplier certifications that put credit at risk; each trainee gets an anonymous seat card.

**The phone is a real phone.** `make demo` serves the web app with a same-origin engine proxy and prints the phone URL; `/phone` on the laptop shows a QR code. Any phone on the same Wi-Fi opens `/m`, picks one of the four roles, and shares the laptop's engine, so an accept on the phone toasts on the laptop within seconds. For a busy demo, the phone's **Fill with demo activity** and **Simulate shops responding** controls play labelled, scripted shop replies that never touch the presenter's shop or the fund moment.

**Supplier search on a graph database.** Northgate types "CWB welding near London" or "welding near London with past defence contracts". Muster turns that into process, certificate, distance and defence-history filters and runs one Cypher query on **Neo4j** (4,490 nodes, 5,808 edges), with the same answer from an in-memory graph when Neo4j is down. The Supplier map walks the same graph.

**Real public data, honestly labelled:** 58,965 National Defence contracts worth $82.9B (2021 to mid-2026, proactive disclosure; Ontario vendors hold 34% of the value going to vendors in Canada), 2,946 manufacturers from StatCan ODBus, 919 open CanadaBuys tender notices (376 defence-related), Job Bank trade outlooks, and 78 real southwestern Ontario shops across 12 cities (39 list welding) discovered from company websites. Real shops are labelled "Public data — unverified — not affiliated", are never routed or offered work, and their National Defence history is a company-name match, not confirmed by the company. The routing demo itself runs on 30 synthetic shops.

**Demo scenario** (fictional prime Northgate Land Systems, $500M contract, SMB target 15%, synthetic shops): a 40-line, ~$42.7M work package routes as **36 assigned ($36.1M, 90% to SMEs), 4 blocked** (all 4 blocked jobs need CWB W47.1 welding). The obligation meter reads 11.5% and SMB-target progress 36.4%. Funding the qualification of 4 welders under CSA W47.1 (TP-01; $96K = 4 new-welder training seats at $24K all-in, assumption): **$96K training → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)** — those 3 jobs are worth $5.1M of work; the obligation meter moves to 13.4% and SMB progress to 42.5%.

## How we built it

- **Frontend:** Next.js 16 (App Router, TypeScript), Tailwind + shadcn/ui, react-leaflet for the routing map, Recharts for the ITB scorecard. Falls back to checked-in fixtures with a visible "Demo data" pill (vs. "Live") if the API is down.
- **Engine:** Python 3.12, FastAPI and Pydantic, 29 JSON endpoints; demo state persisted to SQLite so it survives a restart, with a demo seed and a scripted shop-activity simulator (`POST /demo/seed`, `POST /demo/simulate/tick`) for a busy live demo.
- **Assignment:** Google OR-Tools CP-SAT maximizes total match score subject to one shop per job and each shop's weekly capacity; a greedy fallback handles the hardest jobs (fewest eligible shops) first.
- **Tagging:** Claude turns free-text parts-list lines into strict JSON (process tags, material, envelope, tolerance, required certs, controlled). Responses are cached by input hash and committed, with a keyword-rules fallback so the demo never depends on the network.
- **Graph:** a capability graph over shops, processes, certifications, regions, Northgate's jobs, DND vendors and ODBus manufacturers, loaded into **Neo4j** (Cypher, point-distance index) with an identical in-memory fallback; tests check both engines return the same results. Read views are cached per state revision.
- **Data:** Statistics Canada's Open Database of Businesses (2,946 manufacturers, NAICS 331–336), National Defence proactive-disclosure contracts (58,965 contracts), CanadaBuys open tenders and Job Bank outlooks, all under the Open Government Licence; ITB obligation totals from ISED's web pages (Government of Canada website terms); 78 real shops from public company websites (facts only, unverified, not affiliated, never routed). Entity linking matches shops, ODBus sites and DND vendors by name and location. The routing demo itself runs on 30 labelled synthetic shops.
- **Phone app:** a mobile-first `/m` route set (four-role picker; shop Today, Offers, Certs, Grow; defence company; college; trainee seat card) on the same engine, reached over Wi-Fi through a same-origin `/engine` proxy, so an accept on the phone shows up on the prime's laptop in seconds.
- **Rules:** simplified ITB rules (100% obligation, CCV, multipliers, SMB target, training categories) live in versioned JSON with a source for each value. Training costs are labelled assumption.
- **Quality gates:** 419 pytest tests for the engine (including "a controlled job is never eligible for a non-CGP shop" and Neo4j-vs-memory search parity), and a `demo_check.py` that walks all 8 demo steps against the live API or the fixtures.

## Challenges we ran into

- **Making the numbers real enough to matter.** Per-vehicle quantities made the obligation meter barely move. We switched to fleet-lifetime quantities, so a 40-line package is ~$42.7M and funding training visibly moves the meter.
- **Open data coverage.** ODBus only includes cities that publish business open data: our national ingest found 2,946 manufacturers, all in Ontario, British Columbia and Alberta, and none in Waterloo, Cambridge, Woolwich or London. So we added 78 real shops from public company websites (labelled public, unverified, not affiliated) and ran the routing demo on clearly labelled synthetic shops.
- **Linking public records without overclaiming.** DND vendor names, ODBus sites and company websites don't share an ID. We match on normalized name plus location, keep a confidence level, and label every match "name match, unverified".
- **Compliance without overreach.** Controlled technical data is itself a controlled good, so we designed Muster to never store drawings and match on metadata only.
- **Parallel build against a contract.** Two lanes built the engine and web at once against a shared API contract and fixtures.

## Accomplishments that we're proud of

- A full loop in one demo: route → credit → blocked for lack of CWB-qualified welders → the shop asks on its phone → the prime funds training → jobs unblock → the shop accepts the offer and sees its welders in training.
- Every number on screen is traceable: credit = value × CCV × multiplier, every assignment explains itself, and every certification shows source and date.
- Honest labelling throughout: fictional prime, synthetic shops, "example, not affiliated" partners, "Simplified ITB rules for demo", assumptions flagged.

## What we learned

- The ITB policy already rewards exactly the behaviour Canada needs (SME work 2x, training 5x, Indigenous workforce development 10x); the missing piece is operational tooling.
- The worker shortage and the supplier-discovery problem are the same problem seen from two sides.
- In a compliance-heavy domain, what you *don't* store (drawings) matters as much as what you do.

## What's next

- **Monday:** incorporate; request a concept review from the Defence Investment Agency ITB team; ask CME Defence and Waterloo EDC for shop introductions.
- **Discover (first 30 days):** 15 shop interviews, 3 primes or Tier 1s say "we'd pilot", and the DIA ITB team reviews the concept.
- **Pilot (by day 90):** one prime pilot LOI; Route + Credit with that prime's existing suppliers.
- **Network (months 4–8):** 50–100 verified shops; Train module with one college and one Indigenous-governed institution; CGP registration filed.
- **Expand (months 8–12):** a second prime, the Comply module, European and SAFE partners.
- **Outreach order:** DIA ITB team → CME Defence → Waterloo EDC → a regional college (e.g. Conestoga, example, not affiliated) → London primes → CADSI and BDC. We have emailed 55 organisations.
- **Known gaps we'd close first:** the 25% cap on training credit is not yet modelled in the demo ledger, sign-in is demo-only, and none of the public shops has claimed its profile yet.

## Built with

`next.js` `react` `typescript` `tailwindcss` `shadcn-ui` `leaflet` `react-leaflet` `recharts` `python` `fastapi` `pydantic` `sqlite` `or-tools` `cp-sat` `neo4j` `cypher` `claude` `anthropic-api` `pytest` `statistics-canada-odbus` `open-government-data`

## Disclaimers

- **Northgate Land Systems is fictional.** It does not represent any real company or contract.
- **Demo shops are synthetic** and labelled "Synthetic" in the data and UI. Any real company shown is labelled "Public data — unverified — not affiliated". No real company is a customer or partner.
- **Training partners are examples, not affiliated** (e.g. "Conestoga College (example, not affiliated)").
- **Simplified ITB rules for demo.** Credit calculations, SMB progress basis and training costs are simplifications or assumptions, not official ITB determinations. Eligibility of any training credit must be confirmed with the Defence Investment Agency.
- Muster **never stores drawings** or technical data. It has not yet registered with the Controlled Goods Program and would do so before handling any technical data.
- **Demo sign-in is not real authentication**: four fictional accounts, one shared demo state. Simulated shop activity is scripted and labelled.
- Data: Statistics Canada Open Database of Businesses, National Defence proactive disclosure (contracts over $10K), CanadaBuys open tender notices and ESDC Job Bank, all under the Open Government Licence – Canada; ISED ITB pages under the Government of Canada website terms; company websites for facts only. National Defence matches are by company name and not confirmed by the companies.
