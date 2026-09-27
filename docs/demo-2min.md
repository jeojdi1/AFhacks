# Shieldworks 2-minute demo

The live-demo part of the pitch. **The deck already covers the problem, why now, the business model and next steps**, so this is product only: one line in, show it, then hand back to the deck. Put it after the "How Shieldworks closes the loop" slide and before "Real data today. A pilot next."

**About 2:00 spoken, all on the laptop (about 10 clicks).** Rehearsed end to end on a production build (laptop 1280×720, live engine; the laptop-only shop step was rehearsed separately): every label below was read off the screen, 0 console errors. Plain words: say "qualified welders" and "security-cleared shops", not certificate codes. The screens already say "fictional", "Synthetic" and "Simplified ITB rules for demo", so don't read disclaimers out loud.

The one thing to land: **a big company's parts list turns into signed work at a small shop, including the jobs nobody could take until the training was funded.**

## Before you start (1 minute, every take)

1. Reset: `make reset-demo` (or `curl -X POST http://127.0.0.1:8000/demo/reset`).
2. Laptop: open `http://<laptop>:3000/program`, click **"Enter the demo"** on the notice, then **"Start over"** in the header. Then open `http://<laptop>:3000/program?notice=1`: the **"This is a demo of Shieldworks"** screen comes back over the empty parts-list page. Leave it up; it's your first beat. (It shows once per browser session on its own; `?notice=1` brings it back for every retake.)
3. Phone (optional, not needed for the laptop-only run below): to show the shop app too, pick one:
   - **Real phone (best on stage):** on the laptop open `/phone`, scan the QR code with your phone (same Wi-Fi), then pick **Tallowfield Fabricating**. You land on the shop's **Today** screen. Tap **"Enter the demo"** on the phone's notice now, before you go on stage.
   - **Fallback:** a narrow Chrome window (390 px wide) at `/m/shops/syn-012` beside the laptop window.
4. Close any leftover toasts. Laptop on screen, phone in your hand (or mirrored).

## Run of show

| Time | Do (exact clicks) | Say (word for word) |
| --- | --- | --- |
| **0:00–0:15** Demo notice | Laptop shows **"This is a demo of Shieldworks"**: four items marked **"Enforced in this demo"** (no drawings, controlled jobs to cleared shops only, no personal information, **"AI suggests, rules decide"**) and six marked **"Planned · not active in demo"** (private AI, two-factor sign-in, each company sees only its own data, encryption, hosted in Canada, audit trail). Click **"Enter the demo"**. | Quick note first: everything here is made-up demo data. In production it all sits behind a full security layer: hosted in Canada, encrypted, two-factor sign-in, and each company sees only its own data. We never store drawings, even here. And the AI only reads the parts list: every match, security check and credit number is plain rules, same answer every time. |
| **0:15–0:38** Send the work | Laptop on `/program` (empty). Click **"Load Northgate's parts list (40 parts)"**, then **"Match jobs to shops →"**. The map draws the jobs; the banner reads **"36 of 40 jobs are matched to 22 Canadian shops (19 of them small businesses)… 4 welding jobs are stuck."** | Here's Northgate, a big defence company, with a forty-two-million-dollar parts list. One click, and every part goes to a qualified local shop: thirty-six of forty jobs, ninety percent of the money to small businesses. Secret parts only go to security-cleared shops. |
| **0:38–0:50** Credit | Story bar step **3 "Credit earned"**. Point at the meter: **"$57.5M of $500M" · 11.5%**, and the small-business bar that counts double. | And Northgate watches its credit fill up live: eleven and a half percent of what it owes, with small-business work counting double. |
| **0:50–1:12** Unblock | Story bar step **4 "Fix the welder gap"**. Top card: **"4 welder training seats at Tallowfield Fabricating (Woolwich)"**: **"Northgate pays $96K"**, **"Counts as $480K credit"**, **"Unsticks 3 jobs"**. Click **"Fund training"**. The headline reads **"$96K training → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)"**; the bar reads **"11.5% → 13.4% of what Northgate owes"** and **"Stuck jobs 4 → 1"**. | Four welding jobs are stuck: no shop has enough qualified welders. So Northgate pays to train four welders at a local shop. Ninety-six thousand dollars of training earns four hundred eighty thousand in credit, five times, and unblocks three jobs. |
| **1:12–1:48** The shop says yes | Still on the laptop: click **"See it from the shop's side"** on the funded card (story bar step **5 "The shop's side"**) → **Tallowfield Fabricating Ltd.** (Synthetic). Top card: **"Get ISO 9001 → qualify for 2 more jobs worth $1.2M"** and "Northgate paid for 4 welder training seats". Under **"Job offers from Northgate"** ($6.8M, 5 offers), the three welding jobs are marked **New**. On **NG-031** (hull side stowage bin weldment, **$1.7M**, "Northgate earns $2.98M credit") click the green **Accept**. The page jumps to the **award package**: **"Paperwork 1 of 6 · Kickoff not booked"**, then the subcontract, NDA, quality certificates (**Attached**), first article plan, Canadian content declaration and insurance. Scroll to **"Kickoff call with Northgate"**, click **Mon, Sep 28 · 10:00 AM** → **"Book kickoff call · Mon Sep 28, 10:00 AM"** → **"Booked"**. | Now the shop's side. Tallowfield gets three new jobs, the ones that were stuck, because its welders are in training. No bidding: each job went only to this shop, and it shows what Northgate earns. Click accept, and it gets formal: the purchase order, the NDA and the Canadian-content paperwork in one place, and a kickoff call booked with Northgate. |
| **1:48–2:00** Back to the prime | Toasts on the same screen: **"Tallowfield Fabricating Ltd. accepted NG-031 (worth $2.98M credit, already counted)"** and **"Kickoff call booked"**; the bell counts up. Then go back to the deck. | And Northgate sees it right away: accepted, and the call is booked. From parts list to signed work in minutes. |

About 285 spoken words, which is about 2:00 at a relaxed pace. **If you're running long:** skip the Credit beat (0:38–0:50). The 13.4% after funding makes the same point.

## If something breaks

- **If a judge asks "is the AI safe / deterministic?":** the AI does one job, turning each parts line into fixed labels (process, material, size, certificates) checked against a strict format. Answers are cached, so the same list gives the same result; keyword rules take over if the AI is down. Eligibility, the Controlled Goods gate, the assignment (an optimizer) and the credit math are ordinary code, and every match shows its reasons.
- **Security and demo notice:** the full "this demo vs production" table is at `/security` (footer link on every page). Good to have open in a tab if a judge asks about security.
- **The kickoff times follow today's date** (next business days). On Sunday the first slot is Mon, Sep 28 at 10:00 AM; any slot works.
- **Phone doesn't update after Fund training** within about 4 seconds: tap **Refresh** in the phone header. If it's still stuck, reload the page.
- **Engine down:** reload the laptop page; it switches to the **"Demo data"** pill with the same numbers. For the phone, use the fallback window with `?mode=fixtures` in the same browser.
- **"Fund training" says it's already funded:** reset (step 1) and click **"Start over"**, then redo Load → Match → Fund.
- **Don't debug on stage.** Say "let me show you on the laptop" and open the shop's page at `/shops/syn-012` instead, where the same offers link to the same award package.
