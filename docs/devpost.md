# Devpost submission text: Muster

**Tagline:** Muster turns defence contracts into work and workers for small Canadian factories.

---

## Inspiration

Canada is spending $81.8B on defence and targets 70% of acquisitions going to Canadian firms (MLT Aikins). Under the Industrial and Technological Benefits (ITB) policy, every major defence contractor owes Canada business activity equal to 100% of its contract value, with 2x credit for direct small-business work, 5x for eligible skills and training, and 10x for Indigenous workforce development (ISED ITB overview).

Yet the two sides of that obligation can't find each other. Primes can't find qualified small shops: each prime runs its own siloed supplier portal. And the shops that could do the work are short on certified welders; CME's September 2026 report says lower vacancies haven't solved Ontario manufacturing's workforce challenge. We wanted a tool where a prime's obligation becomes a shop's opportunity.

## What it does

Muster is **two-sided**. Primes pay; shops use it free.

- **Route:** a prime uploads a parts list. Muster tags each line (processes, material, envelope, required certifications, controlled or not), filters shops on hard rules, scores the rest, and assigns each job to a qualified small Canadian shop. Controlled jobs only go to Controlled Goods Program-registered shops, and every assignment shows its top 3 reasons.
- **Credit:** a live ITB ledger. Credit = value × Canadian content (CCV) × multiplier. Direct vs indirect, SME 2x, SMB share vs target, and % of obligation met.
- **Train:** when no shop can take a job (missing certified workers or capacity), Muster proposes an ITB-eligible training package (model terms §7.5.1 categories). "Funding" it adds a pending-training certification and capacity, re-routes, unblocks the job, and earns 5x credit (10x for Indigenous workforce development).
- **Comply:** every shop shows its certifications (CGP, CPCSC Level 1, ISO 9001, AS9100, Nadcap, CWB W47.1) with source, date verified, status and expiry.

**The shop side:** a shop sees defence job offers it would never have found, accepts or declines them, sees a readiness card ("Get CWB W47.1 → qualify for N more jobs worth $X"), and sees its welders in training on the prime's money.

**Demo scenario** (fictional prime Northgate Land Systems, $500M contract, SMB target 15%, synthetic shops): a 40-line, ~$42.7M work package routes as **36 assigned ($36.1M, 90% to SMEs), 4 blocked** (all 4 blocked jobs need CWB W47.1 welding). The obligation meter reads 11.5% and SMB-target progress 36.4%. Funding welder certification (TP-01): **$96K training → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)** — those 3 jobs are worth $5.1M of work; the obligation meter moves to 13.4% and SMB progress to 42.5%.

## How we built it

- **Frontend:** Next.js 16 (App Router, TypeScript), Tailwind + shadcn/ui, react-leaflet for the routing map, Recharts for the ITB scorecard. Falls back to checked-in fixtures with a visible "Demo mode" badge if the API is down.
- **Engine:** Python 3.12, FastAPI, Pydantic/SQLModel, SQLite.
- **Assignment:** Google OR-Tools CP-SAT maximizes total match score subject to one shop per job and each shop's weekly capacity; a greedy fallback handles the hardest jobs (fewest eligible shops) first.
- **Tagging:** Claude turns free-text parts-list lines into strict JSON (process tags, material, envelope, tolerance, required certs, controlled). Responses are cached by input hash and committed, with a keyword-rules fallback so the demo never depends on the network.
- **Data:** the base list of candidate shops comes from Statistics Canada's Open Database of Businesses (Open Government Licence), filtered by manufacturing NAICS codes (3327, 3323, 3321 and others) plus keywords. The demo itself runs on 30 labelled synthetic shops.
- **Rules:** simplified ITB rules (100% obligation, CCV, multipliers, SMB target, training categories) live in versioned JSON with a source for each value. Training costs are labelled assumption.
- **Quality gates:** pytest for the engine (including "a controlled job is never eligible for a non-CGP shop"), and a `demo_check.py` that walks all 8 demo steps against the live API or the fixtures.

## Challenges we ran into

- **Making the numbers real enough to matter.** Per-vehicle quantities made the obligation meter barely move. We switched to fleet-lifetime quantities, so a 40-line package is ~$42.7M and funding training visibly moves the meter.
- **Open data coverage.** ODBus only includes cities that publish business open data. Our southwestern Ontario ingest returned Kitchener (103) and Hamilton (12), so we used clearly labelled synthetic shops for the demo.
- **Compliance without overreach.** Technical data for controlled goods is itself controlled, so we designed Muster to never store drawings and match on metadata only.
- **Parallel build against a contract.** Two lanes built the engine and web at once against a shared API contract and fixtures.

## Accomplishments that we're proud of

- A full loop in one demo: route → credit → blocked by the welder shortage → fund training → jobs unblock → the shop accepts the offer and sees its welders in training.
- Every number on screen is traceable: credit = value × CCV × multiplier, every assignment explains itself, and every certification shows source and date.
- Honest labelling throughout: fictional prime, synthetic shops, "example, not affiliated" partners, "Simplified ITB rules for demo", assumptions flagged.

## What we learned

- The ITB policy already rewards exactly the behaviour Canada needs (SME work 2x, training 5x, Indigenous workforce development 10x); the missing piece is operational tooling.
- The worker shortage and the supplier-discovery problem are the same problem seen from two sides.
- In a compliance-heavy domain, what you *don't* store (drawings) matters as much as what you do.

## What's next

- **Discover (weeks 1–4):** 3 primes or Tier 1s say "we'd pilot", 15 shop interviews, and the Defence Investment Agency ITB team reviews the concept.
- **Pilot (months 2–4):** Route + Credit with one prime's existing suppliers; 1 paid pilot or LOI.
- **Network (months 4–8):** 50–100 verified shops; Train module with one college and one Indigenous-governed institution; CGP registration filed.
- **Expand (months 8–12):** a second prime, the Comply module, European and SAFE partners.
- **Outreach order:** DIA ITB team → CME → Waterloo EDC → Conestoga Skilled Trades Campus → London primes → CADSI and BDC.

## Built with

`next.js` `react` `typescript` `tailwindcss` `shadcn-ui` `leaflet` `react-leaflet` `recharts` `python` `fastapi` `pydantic` `sqlmodel` `sqlite` `or-tools` `cp-sat` `claude` `anthropic-api` `pytest` `statistics-canada-odbus`

## Disclaimers

- **Northgate Land Systems is fictional.** It does not represent any real company or contract.
- **Demo shops are synthetic** and labelled "Synthetic" in the data and UI. Any real company shown is labelled "Public data — unverified — not affiliated". No real company is a customer or partner.
- **Training partners are examples, not affiliated** (e.g. "Conestoga College (example, not affiliated)").
- **Simplified ITB rules for demo.** Credit calculations, SMB progress basis and training costs are simplifications or assumptions, not official ITB determinations. Eligibility of any training credit must be confirmed with the Defence Investment Agency.
- Muster **never stores drawings** or technical data. It has not yet registered with the Controlled Goods Program and would do so before handling any technical data.
- Data: Statistics Canada Open Database of Businesses, Open Government Licence – Canada.
