# Muster pitch pack (live pitch + judge Q&A)

For the 1:00 PM top-10 live pitch. Judges include MP Bardish Chagger and Dr. Ian Burgess. Rubric (0–4 each, no technical judging): **relevance to "Growing Canada"**, **viability**, **pitch**.

Rules for everything in this file: stats carry a footnote marker `[n]` pointing to the source list at the bottom (CLAUDE.md §11, docs/research.md). Anything not sourced is labelled **(assumption)**. Northgate Land Systems is **fictional**; demo shops are **synthetic**; real shops (Shops directory, Find suppliers, Supplier map) are **public data, unverified, not affiliated**; training partners are **example, not affiliated**; ITB rules are **simplified for the demo**.

---

## Slides (3 max)

### Slide 1: Muster

*Defence contracts → work and workers for small Canadian factories.*

- Canada: **$81.8B** more for defence over five years (Budget 2025); target: **70%** of defence acquisitions to Canadian firms by 2035 (Defence Industrial Strategy, Feb 2026) [1]
- Every prime must do business in Canada equal to **100%** of the contract value; the updated policy gives **2x** credit for direct SMB work and **5x** for cash spent on skills training (capped at 25% of the obligation) [2][3]
- Primes can't find small shops, and those shops lack welders qualified to CWB W47.1: 47% in CWB's 2024 industry survey name a shortage of qualified workers as their top issue [8]

**Speaker notes:** The money and the obligation already exist. What's missing is the connection: a prime in London can't see a 30-person shop in Woolwich, and that shop lacks the CWB-qualified welders to take the job. Muster is the missing link, and it serves both sides.

### Slide 2: How it works (live demo numbers)

- **Route + Credit:** 40 parts → **36 assigned, 4 blocked**; controlled jobs only to CGP shops; obligation meter **11.5%**
- **Train:** fund TP-01 → **$96K training (4 new-welder training seats, all-in incl. stipend; assumption) → $480K credit (5x) + 3 jobs unblocked (+$9.1M credit)**; obligation **11.5% → 13.4%**, SMB target **36.4% → 42.5%**
- **Two-sided, four desks:** defence company, supplier, training partner, trainee each sign in to their own desk (demo sign-in). Shops use it free, on a real phone over Wi-Fi: accept or decline offers, see readiness ("Get CWB W47.1 → more jobs"), ask the prime to fund it; the prime sees each reply live
- **Find suppliers:** "CWB welding near London" → one query on a Neo4j capability graph (4,490 nodes) of real public data: 78 local shops, 2,946 StatCan manufacturers and 1,099 National Defence vendors drawn from 58,965 contracts, matched by name [7][21] (public, unverified, not affiliated)

**Speaker notes:** Northgate is a fictional prime with a $500M contract. Its ~$42.7M work package routes to qualified small shops, 90% of that value to small and medium shops, earning 2x credit. Four welding jobs are blocked: no available shop has CWB-qualified welders. The prime funds four new-welder training seats, qualified under CSA W47.1, through a regional college (e.g. Conestoga, example, not affiliated); the prime's cash for eligible training earns 5x credit (capped at 25% of the obligation), and the jobs unblock (W47.1 certifies the company; the welders get tickets). On the phone, the shop accepts the offer, asks Northgate to fund W47.1, and sees its welders in training; Northgate sees each reply as it happens. And when Northgate needs new suppliers, it asks in plain words and searches real public records: which local shops weld to CWB, and which already did National Defence work. Those real shops are never sent work until they claim their profile.

### Slide 3: Why now, and what happens Monday

- **Why now:** on July 16, 2026, the day ITB authority moved to the Defence Investment Agency [2], Ottawa announced a nearly $2B armoured-vehicle deal built in London, ON, drawing on 600+ Canadian suppliers [16]; 2x credit for direct SMB work, 5x for training [2]
- **Model:** primes pay a per-program subscription + small fee on routed value; shops and colleges free
- **Monday:** incorporate; request a concept review from the DIA ITB team; ask CME Defence and Waterloo EDC for shop introductions → 15 shop interviews in 30 days, one-prime pilot LOI in 90

**Speaker notes:** Australia's ICN Gateway proved suppliers will register [5]. Canada needs the next step, with the workforce built in. Our wedge is Route + Credit; Train is the differentiator. Exit gate for our first month: 15 shop interviews, 3 primes say "we'd pilot", and the DIA ITB team has reviewed the concept. We've emailed 55 organisations so far. Nothing is booked yet: these are requests.

---

## 60-second spoken pitch (~175 words; brisk pace)

> Canada is adding eighty-one point eight billion dollars to defence over five years, and wants seventy percent of defence acquisitions to go to Canadian firms. Every major contractor must do business in Canada equal to its full contract value, and earns double credit for small-business work and five times the credit for training workers.
>
> But primes can't find qualified small shops, and those shops don't have the certified welders to take the work.
>
> Muster fixes both: we route defence jobs to qualified local factories. When a shop is short on certified welders, the prime funds training for five-x credit. In our demo, 96 thousand dollars of training earns 480 thousand in credit and unblocks three jobs worth 5.1 million more, earning another 9.1 million in credit.
>
> Primes pay to win bids and meet obligations. Shops use it free, on their phone. Canada gets its industrial base.
>
> A prime's obligation is a shop's opportunity. On Monday we request a review from the Defence Investment Agency and start interviewing fifteen shops, then pilot with one prime and a regional college.

---

## Judge Q&A (answers ≤ 40 words)

### From CLAUDE.md §8.3

**Q: Isn't this ICN Gateway, OMX, or Goverly?**
ICN lets suppliers raise their hand, but doesn't select them [5]. OMX and consultants track obligations. Goverly builds supplier readiness files and prime search, and suppliers pay for it [20]. As of this weekend, we found no one assigning each job, crediting it, and funding the training that unblocks it.

**Q: Why hasn't it worked before?**
Primes could meet ITB through indirect activity. Now the updated policy gives 2x credit for direct SMB work and 5x for training [2], on top of $81.8B more for defence over five years [1].

**Q: Security?**
We never store drawings; matching uses metadata only. Controlled jobs go only to CGP-registered shops. We'll register with the Controlled Goods Program before we handle any technical data [6].

**Q: Why would a prime pay?**
The credit is worth far more than our fee, and a stronger Value Proposition, generally at least 10% of the bid score and set per procurement [4], helps them win the bid.

**Q: Is training credit guaranteed?**
No. Only the prime's cash in the §7.5.1 categories counts, training credit is capped at 25% of the obligation (§7.5.4.1) [3], and the Defence Investment Agency decides. We produce the evidence.

**Q: What happens Monday?**
We incorporate and request a concept review from the DIA's ITB team. CME Defence and Waterloo EDC introduce us to shops. That means 15 shop interviews in 30 days and one prime pilot LOI in 90.

**Q: Why would a shop trust a platform the prime pays for?** *(draft)*
It's free for shops, they see exactly why they were or weren't matched, and they can decline any offer from their phone, with a reason. The prime's credit depends on the shop doing the work, so the prime needs the shop to succeed.

**Q: What if the welder you trained leaves?** *(draft)*
The welder stays in Canada's workforce, the point of the 5x multiplier [2]. Apprenticeships are registered with a sponsoring employer, so training happens at the shop needing the worker. How credit counts for leavers we confirm with the DIA (assumption).

### More hard questions

**Q: Isn't the welder shortage overstated?**
Job Bank rates the general welder outlook in Ontario "very limited" [17]. The gap is welders qualified to CSA W47.1 at CWB-certified shops. Re-qualifying an experienced welder costs a few thousand dollars and takes weeks (our estimate).

**Q: Who holds the training money?**
No one in the middle. The prime pays the college or apprenticeship sponsor directly, the DIA decides eligibility, and Muster keeps the per-job audit trail.

**Q: Your data only covers a few cities. How do you get national coverage?**
Our graph already holds 2,946 StatCan manufacturers and 1,099 National Defence vendors from 58,965 contracts [7][21], plus 78 local shops from company sites (public, unverified, not affiliated). Next, shops claim their profiles, and CME Defence and Waterloo EDC bring members in.

**Q: Is any of this real data?**
The routing demo is fictional and synthetic by design. Search and the supplier map use real open data: StatCan ODBus, National Defence contracts, CanadaBuys tenders, Job Bank [7][21][22]. Each real company is labelled unverified, not affiliated, never sent work.

**Q: Have you talked to anyone?**
We've emailed 55 organisations. We're not claiming any replies or partners yet; the first-month goal is 15 shop interviews and a DIA concept review.

**Q: How do you verify certifications?**
Each badge shows status, source, date verified and expiry. CGP, CWB and Nadcap are checked against their public directories [6][9][10]; ISO/AS9100 via IAF CertSearch [11]. CPCSC Level 1 is self-assessed with no public registry [12], so it's always "declared".

**Q: What's your moat?**
Two-sided network effects: every verified shop makes routing better for primes, every prime brings shops work. Plus per-job credit history, certification freshness, and college training partnerships nobody else runs in one loop.

**Q: Why a startup and not the government?**
Government sets the rules and audits credit; it doesn't pick suppliers for primes. Even BDC says: "We do not expressly match businesses with defence contractors." [18] Each prime runs its own siloed supplier portal [15]. We'll work with the DIA, not around it.

**Q: What's the revenue math?** *(all figures assumption)*
Per-program subscription ~$50K/yr plus 0.5% of routed value. One ~$42.7M package routed ≈ $210K fee, plus ~$250K subscription over 5 years, versus millions in credit. For comparison, Vendr shows a median of US$20.5K/yr for Deltek and US$94.5K for Coupa [19].

**Q: What does Waterloo get from this?**
Waterloo Region's small machine and fab shops get defence work they'd never see; a regional college (e.g. Conestoga, example, not affiliated) [13] fills seats; local welders get qualified under CSA W47.1 on the prime's money. Waterloo EDC is on our first-week outreach list.

---

## Sources (CLAUDE.md §11, docs/research.md)

1. **$81.8B over five years; 70% of defence acquisitions to Canadian firms by 2035.** Budget 2025, ch. 4: https://budget.canada.ca/2025/report-rapport/chap4-en.html ; Defence Industrial Strategy (Feb 2026): https://www.canada.ca/en/department-national-defence/corporate/reports-publications/industrial-strategy/security-sovereignty-prosperity.html
2. **Do business in Canada equal to 100% of contract value; $100M automatic / $25M–$100M reviewed thresholds; multipliers 1x / 2x SMB direct / 5x training / 10x Indigenous workforce development (the overview says the policy "will provide" / "may receive"); ITB authority transferred to the Defence Investment Agency, effective July 16, 2026.** ISED, ITB overview: https://ised-isde.canada.ca/site/ised/en/procurement-services/defence-and-marine-procurement/industrial-and-technological-benefits-itb
3. **Direct vs indirect credit; eligible training categories (§7.5.1); training credit applies to cash (§7.5.3) and is capped at 25% of the obligation (§7.5.4.1).** ISED, ITB model terms and conditions: https://ised-isde.canada.ca/site/ised/en/procurement-services/defence-and-marine-procurement/industrial-and-technological-benefits-itb/itb-toolkit/itb-model-terms-and-conditions
4. **Value Proposition generally at least 10% of bid score, set per procurement; banked activity generally kept up to 10 years (Gowling WLG, secondary); banked credit capped at 50% of the obligation (model terms §12.1).** Gowling WLG: https://gowlingwlg.com/en/insights-resources/articles/2026/industrial-and-technological-benefits-policy ; model terms as in [3]
5. **ICN Gateway (suppliers register interest; proof suppliers will join).** https://gateway.icn.org.au/how-it-works
6. **Controlled Goods Program directory.** https://www.canada.ca/en/public-services-procurement/services/industrial-security/controlled-goods/find-individuals-organizations-registered-program.html
7. **StatCan Open Database of Businesses (base list, Open Government Licence).** https://www150.statcan.gc.ca/n1/pub/21-26-0003/212600032023001-eng.htm . Public shop counts (78 shops, 12 cities, 39 list welding) from `data/processed/shops_public_summary.json`.
8. **Ontario manufacturing workforce challenge; welding qualified-worker shortage.** CP24 / Canadian Press on the CME report (2026-09-23): https://www.cp24.com/news/money/2026/09/23/workforce-challenges-persist-for-ontarios-manufacturing-sector-industry-group/ (CME blog: https://cme-mec.ca/blog/new-cme-report-lower-vacancies-havent-solved-ontario-manufacturings-workforce-challenge/ returns 403); CWB 2024 industry survey: https://www.cwbgroup.org/resources/articles/overview-of-the-employment-landscape-in-the-welding-industry
9. **CWB certified companies.** https://www.cwbgroup.org/directory/certified-companies
10. **Nadcap / eAuditNet.** https://www.eauditnet.com
11. **IAF CertSearch.** https://www.iafcertsearch.org
12. **CPCSC Level 1 (13 controls, self-assessed).** https://www.canada.ca/en/public-services-procurement/news/2026/04/canadian-program-for-cyber-security-certification-level-1.html
13. **Regional college example: Conestoga Skilled Trades Campus (example partner, not affiliated).** Waterloo EDC: https://www.waterlooedc.ca/blog/skilled-trades-conestoga
14. **SMB requirement example (generally 15% of the ITB obligation); CCV.** ISED, ITB policy: https://ised-isde.canada.ca/site/ised/en/procurement-services/defence-and-marine-procurement/industrial-and-technological-benefits-itb/industrial-and-technological-benefits-policy
15. **Siloed prime supplier portals (example: Irving CSC work packages).** https://shipsforcanada.ca/suppliers/upcoming-csc-work-packages
16. **GDLS-Canada, London ON: nearly $2B, 600+ Canadian suppliers (2026-07-16).** PM release: https://www.pm.gc.ca/en/news/news-releases/2026/07/16/prime-minister-carney-announces-landmark-partnership-general-dynamics
17. **Welder outlook 2025–2027 "Very limited" in Ontario.** Job Bank (updated 2025-12-10): https://www.jobbank.gc.ca/marketreport/outlook-occupation/23261/ON
18. **BDC: "We do not expressly match businesses with defence contractors."** https://www.bdc.ca/en/solutions/defence (accessed 2026-09-26)
19. **Vendr medians: Deltek US$20,479/yr, Coupa US$94,519/yr (as of 2026-09-26).** https://www.vendr.com/marketplace/deltek ; https://www.vendr.com/marketplace/coupa
20. **Goverly (readiness files, Prime 360 search; supplier-paid tiers).** https://www.goverly.ai (accessed 2026-09-26)

21. **National Defence contracts over $10K, proactive disclosure (58,965 contracts, $82.9B, 16,097 vendors, contracts dated 2021-01-01 to 2026-06-30; Ontario vendors 34% of the value to vendors in Canada, 31% of all value; Open Government Licence).** https://open.canada.ca/data/en/dataset/d8f85d91-7dec-4fd1-8055-483b77225d8b ; our de-duplicated counts in `data/processed/national/dnd_contracts_summary.json`. ODBus national manufacturers (2,946) in `data/processed/national/odbus_summary.json`. Name matches to shops are unverified.
22. **CanadaBuys open tender notices (919 open, 376 defence-related, retrieved 2026-09-26; Open Government Licence).** https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv ; Job Bank 2025–2027 outlooks: https://open.canada.ca/data/en/dataset/b0e112e9-cf53-4e79-8838-23cd98debe5b

Demo numbers (package value, obligation %, SMB %, 36/4, headline) come from the fictional Northgate scenario in `/data/fixtures` and are illustrative, not real contract data. The $96K is 4 × $24K new-welder seats from `data/rules/training_costs.json` (assumption).
