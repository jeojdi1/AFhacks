# Shieldworks 2-minute demo

The live-demo part of the pitch. **The deck already covers the problem, why now, the business model and next steps**, so this is product only: one line in, show it, then hand back to the deck. Put it after the "How Shieldworks closes the loop" slide and before "Real data today. A pilot next."

**About 1:45 spoken, 5 clicks on the laptop, 4 taps on the phone.** Rehearsed end to end on a production build (laptop 1280×720 + phone 390×844, live engine): every label below was read off the screen, 0 console errors. Plain words: say "qualified welders" and "security-cleared shops", not certificate codes. The screens already say "fictional", "Synthetic" and "Simplified ITB rules for demo", so don't read disclaimers out loud.

The one thing to land: **a big company's parts list turns into signed work at a small shop, including the jobs nobody could take until the training was funded.**

## Before you start (1 minute, every take)

1. Reset: `make reset-demo` (or `curl -X POST http://127.0.0.1:8000/demo/reset`).
2. Laptop: open `http://<laptop>:3000/program` and click **"Start over"** in the header. You should see the empty parts-list page.
3. Phone, pick one:
   - **Real phone (best on stage):** on the laptop open `/phone`, scan the QR code with your phone (same Wi-Fi), then pick **Tallowfield Fabricating**. You land on the shop's **Today** screen.
   - **Fallback:** a narrow Chrome window (390 px wide) at `/m/shops/syn-012` beside the laptop window.
4. Close any leftover toasts. Laptop on screen, phone in your hand (or mirrored).

## Run of show

| Time | Do (exact clicks) | Say (word for word) |
| --- | --- | --- |
| **0:00–0:25** Send the work | Laptop on `/program` (empty). Click **"Load Northgate's parts list (40 parts)"**, then **"Match jobs to shops →"**. The map draws the jobs; the banner reads **"36 of 40 jobs are matched to 22 Canadian shops (19 of them small businesses)… 4 welding jobs are stuck."** | Here's Northgate, a big defence company, with a forty-two-million-dollar parts list. One click, and every part goes to a qualified local shop: thirty-six of forty jobs, ninety percent of the money to small businesses. Secret parts only go to security-cleared shops. |
| **0:25–0:37** Credit | Story bar step **3 "Credit earned"**. Point at the meter: **"$57.5M of $500M" · 11.5%**, and the small-business bar that counts double. | And Northgate watches its credit fill up live: eleven and a half percent of what it owes, with small-business work counting double. |
| **0:37–1:00** Unblock | Story bar step **4 "Fix the welder gap"**. Top card: **"4 welder training seats at Tallowfield Fabricating (Woolwich)"**: **"Northgate pays $96K"**, **"Counts as $480K credit"**, **"Unsticks 3 jobs"**. Click **"Fund training"**. The headline reads **"$96K training → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)"**; the bar reads **"11.5% → 13.4% of what Northgate owes"** and **"Stuck jobs 4 → 1"**. | Four welding jobs are stuck: no shop has enough qualified welders. So Northgate pays to train four welders at a local shop. Ninety-six thousand dollars of training earns four hundred eighty thousand in credit, five times, and unblocks three jobs. |
| **1:00–1:35** The shop says yes | **Phone** (updates by itself within a second; a note says **"Updated from the live engine"**): Today shows **"5 offers waiting for your answer"** and **"4 welders in training"**. Tap the **Offers** tab. Top card is **NG-031** (hull stowage bin weldment, **$1.7M**, marked **New**): tap its green **Accept**. The phone jumps to the **award package**: **"Paperwork 1 of 6 · Kickoff not booked"**, then the subcontract, NDA, quality certificates (**Attached**, noting the welders are in training), first article plan, Canadian content declaration and insurance. Scroll to **"Kickoff call with Northgate"**, tap **Mon, Sep 28 · 10:00 AM** → **"Book kickoff call · Mon Sep 28, 10:00 AM"** → **"Booked: Mon Sep 28, 10:00 AM"**. | Now the shop's side, on the owner's phone. Four welders in training, and new work from Northgate. No bidding: each job went only to this shop. Tap accept, and it gets formal: the purchase order, the NDA and the Canadian-content paperwork in one place, and a kickoff call booked with Northgate. |
| **1:35–1:45** Back to the prime | Laptop: two toasts, **"Tallowfield Fabricating Ltd. accepted NG-031 (worth $2.98M credit, already counted)"** and **"Tallowfield Fabricating booked a kickoff call: Mon Sep 28, 10:00 AM (NG-031)"**. Then go back to the deck. | And Northgate sees it right away: accepted, and the call is booked. From parts list to signed work in minutes. |

About 230 spoken words, which is about 1:45 at a relaxed pace. **If you're running long:** skip the Credit beat (0:25–0:37). The 13.4% after funding makes the same point.

## If something breaks

- **The kickoff times follow today's date** (next business days). On Sunday the first slot is Mon, Sep 28 at 10:00 AM; any slot works.
- **Phone doesn't update after Fund training** within about 4 seconds: tap **Refresh** in the phone header. If it's still stuck, reload the page.
- **Engine down:** reload the laptop page; it switches to the **"Demo data"** pill with the same numbers. For the phone, use the fallback window with `?mode=fixtures` in the same browser.
- **"Fund training" says it's already funded:** reset (step 1) and click **"Start over"**, then redo Load → Match → Fund.
- **Don't debug on stage.** Say "let me show you on the laptop" and open the shop's page at `/shops/syn-012` instead, where the same offers link to the same award package.
