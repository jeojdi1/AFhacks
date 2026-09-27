## Inspiration

- **Nov 2025:** Budget 2025 commits **$81.8B to defence over five years**.
- **Feb 2026:** The Defence Industrial Strategy sets a goal of **70% of defence buying going to Canadian firms by 2035**. Small and medium businesses make up **92% of defence firms**.
- **2026:** Under the updated ITB policy, a prime must do business in Canada equal to **100% of its contract value**. It can earn **2x credit** for direct small-business work and **5x** for cash spent training workers.
- **June 2026:** Marconi Technologies becomes the **first Canadian firm to win a contract under the EU's €150B SAFE** defence program (radios for Poland).
- **July 2026:** Germany's **TKMS** is picked to build **up to 12 submarines**, and the deal *"will be subject to Canada's modernised Industrial and Technological Benefits Policy."* Ottawa also announces a **~$2B armoured-vehicle deal built in London, Ontario**, drawing on **600+ Canadian suppliers**.
- **Sept 23, 2026:** CME says manufacturers are *"still struggling to find people… everything from welders to mechatronics to electrical technicians."*

Canada is going international by selling into Europe and buying from allies, but the rule doesn't change. **A German submarine builder will still owe Canada 100% of its contract value in Canadian business**, and so will every other prime. That work has to land in Canadian shops.

The money is there, the rules reward small shops and training, and the shops exist. But BDC says it plainly: *"We do not expressly match businesses with defence contractors."* Nobody connects the two sides.

## The problem

Primes can't find qualified small shops. Small shops never see the work, and when they do, they're often **one qualification short**. It isn't that Canada lacks welders: Job Bank rates Ontario's welder outlook "very limited." What's scarce is **welders qualified to the Canadian Welding Bureau's standard at a certified shop**, and re-qualifying one takes weeks, not years.

So a job no shop can take is really a training opportunity, and the ITB policy pays **5x** for exactly that training.

## What we built

**Shieldworks** routes defence work to small Canadian shops and pays for the training that unblocks it.

1. **Route:** The prime uploads a parts list. Claude reads each line, and a solver assigns each job to one qualified shop, with reasons shown.
2. **Credit:** A live ITB ledger updates as jobs are assigned:

$$\text{credit} = \text{value} \times \text{Canadian content} \times \text{multiplier}$$

3. **Train:** When no shop can take a job, Shieldworks suggests a training package. Funding it unblocks the job.
4. **Shop side:** Shops accept offers on their phone and see "get this qualification → 3 more jobs." They then see their welders in training.

In the demo, 40 jobs route as **36 assigned and 4 blocked** (no qualified welders). The prime funds $96K of training:

$$96\text{K} \times 5 = 480\text{K credit}$$

Three jobs unblock (+$9.1M credit), and the obligation meter jumps with one click. We **never store drawings**, and controlled jobs only go to Controlled Goods Program shops.

## How we built it

- **Engine:** Python, FastAPI, Google OR-Tools for assignment, and Claude to read parts lists (cached, with a fallback).
- **Web and phone:** Next.js, Tailwind, and Leaflet maps. Any phone on the Wi-Fi joins the live demo with a QR code.
- **Search:** A Neo4j graph of shops, certifications and past defence contracts.
- **Data:** Real open government data, including 58,965 National Defence contracts, 2,946 manufacturers, and 78 real Ontario shops (labelled unverified).
- **Process:** We wrote a playbook and the API contract first, then ran parallel Claude Code agents with 432 tests and overnight audit → fix → verify cycles.

## Challenges

- **We lost a laptop Saturday night.** One person ran both the engine and the frontend with parallel agents.
- **The credit meter didn't move.** Single-order prices were too small to matter, so we priced parts over the whole vehicle fleet, the way real work packages are.
- **Open data had holes.** The StatCan list missed Waterloo, Cambridge and London, so we added real shops from public websites.
- **Our own pitch was wrong.** Fact-checking killed "welder shortage" and several unsourced claims.
- **Too much jargon.** We rewrote the app and video in plain language.

## What we learned

- The policy already pays for the right behaviour. What's missing is the tooling.
- The worker shortage and the supplier problem are the same problem.
- The honest version of a pitch is the stronger one.

## What's next

We'll ask the Defence Investment Agency's ITB team for a concept review and run 15 shop interviews in 30 days, then one prime pilot. We've already emailed 55 shops, colleges and industry groups.

*The demo prime is fictional, the demo shops are synthetic, and the ITB rules are simplified.*
