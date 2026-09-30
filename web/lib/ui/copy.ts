// Desktop copy deck (docs/ux-simplification.md §8): every visible desktop string, flat keys.
//
//   c("program.b2", { assigned: 36, jobs: 40, ... })  → interpolated string ("{x}" placeholders)
//   <Rich text={c("score.b", {...})} />                → renders **…** as <strong>, nothing else
//
// Multi-key rows in §8 ("`a.b` / `.c`") are expanded to full keys: "a.b" and "a.b.c"
// (e.g. program.stat.matched + program.stat.matched.sub). Tooltips are "plain.<KEY>.tip"
// (§8.8, generated from PLAIN). The phone app's strings (web/lib/app/strings.ts) are not here.
//
// Agents B–E's extra keys (copy-<agent>.ts) are merged into BASE below; those files are now
// aliases of c() / COPY.

import { createElement, Fragment, type ReactElement } from "react"
import { PLAIN } from "./plain"

const BASE: Record<string, string> = {
  // -------------------------------------------------------------------------
  // §8.1 Global
  "app.sentence":
    "Big defence companies owe Canada business equal to their contracts. Shieldworks sends that work to small Canadian shops, and when shops are short of qualified workers, the defence company pays to train them.",
  "app.tagline": "Defence work for small Canadian shops",
  "app.creditExplainer":
    "Credit isn't cash. It's how the government counts Northgate's Canadian business toward the $500M it owes. Small-business work counts double. Training counts 5×.",
  "app.title": "Shieldworks — defence work for small Canadian shops",

  "nav.step1": "Parts list",
  "nav.step2": "Where the work goes",
  "nav.step3": "Credit earned",
  "nav.step4": "Fix the skills gap",
  "nav.step5": "The shop's side",
  "nav.directory": "Shops directory",
  "nav.phone": "Phone app",
  "nav.startOver": "Start over",
  "nav.startOver.aria": "Start over (reset the demo)",
  "nav.story": "Story mode",
  "nav.story.tip": "Story mode hides detail tables so the story is easy to follow. Turn it off to see everything.",
  "nav.story.on": "Story mode is on. Press S to turn it off.",
  "nav.story.off": "Story mode is off. Press S to turn it on.",
  "nav.findSuppliers": "Find suppliers",
  "nav.findWork": "Find work",
  "nav.graph": "Supplier map",
  "nav.home": "Shieldworks home",
  "nav.stepsAria": "The 5-step demo story",

  "bar.promise.empty": "Northgate owes Canada **{obligation}** of business",
  "bar.promise": "Credit so far **{credit}** of {obligation} · {pct}",
  "bar.promise.aria": "Credit so far {credit} of {obligation}, {pct} of what Northgate owes",
  "bar.extra": "Extra · Shops directory · not part of the 5-step story",
  "bar.extra.short": "Extra · Shops directory",
  "bar.prime": "Northgate Land Systems (fictional defence company)",

  "mode.demo": "Demo data",
  "mode.live": "Live",
  "mode.detecting": "Connecting…",
  "mode.body": "Demo data replays saved answers, so nothing can break on camera. Live uses the running engine.",
  "mode.title": "Data source",
  "mode.advanced": "Advanced",
  "mode.offline": "Engine offline",
  "mode.offline.short": "Offline",
  "mode.offline.tip": "The live engine stopped answering. Retrying every few seconds; switch to Demo data to keep going.",
  "mode.live.note": "Switching to Live loads what the engine has now. It never clears the engine or the phones connected to it.",

  "banner.lookAt": "Look at:",
  "banner.step": "Step {n} of 5 · {label}",
  "banner.extra": "Extra · Shops directory",

  "details.show": "Show {what}",
  "details.hide": "Hide {what}",

  "run.start": "Start the demo",
  "run.start.sub": "Loads Northgate's 40-part list and matches it to shops · about 5 seconds",
  "run.continue": "Continue the demo →",
  "run.loadAndMatch": "Load and match the parts list",
  "run.loadAndMatch.shop": "Load and match Northgate's parts list",
  "run.startOver": "Start over",

  "busy.upload": "Reading the parts list…",
  "busy.route": "Matching jobs to shops…",
  "busy.fund": "Funding training…",
  "busy.reset": "Starting over…",

  honesty:
    "Northgate Land Systems is fictional. Demo shops are synthetic. Simplified ITB rules for demo. Real shops: public data — unverified — not affiliated.",
  "footer.credits":
    "Simplified ITB rules for demo · Public data unverified · Not affiliated · Data: Statistics Canada ODBus (Open Government Licence)",
  "footer.fine": "Northgate Land Systems is fictional. Synthetic shops are labelled. Training partners are examples, not affiliates.",

  // -------------------------------------------------------------------------
  // §8.2 Landing
  "landing.h1": "Defence contracts, turned into work for small Canadian shops.",
  "landing.p1.title": "Big defence companies owe Canada business.",
  "landing.p1.body":
    "Win a $500M contract, and you must do $500M of business in Canada. Work with small businesses counts double.",
  "landing.p1.caption": "Canada's ITB rule, simplified for this demo",
  "landing.p2.title": "Shieldworks finds small shops that can make the parts.",
  "landing.p2.body":
    "It reads the parts list, checks each shop's machines and certificates, and offers each job to one qualified shop. No bidding.",
  "landing.p3.title": "Short of qualified workers? The defence company pays to train them.",
  "landing.p3.body": "Welders, CNC machinists, electronics assemblers: training counts 5× toward what it owes, and the stuck work goes ahead.",
  "landing.link.shop": "Skip to the shop's side →",
  "landing.link.dir": "Browse 108 shops →",
  "landing.link.phone": "Open the phone app →",
  "landing.flow.n1.title": "Northgate",
  "landing.flow.n1.tag": "fictional defence company",
  "landing.flow.n1.body": "owes Canada $500M of business",
  "landing.flow.n2.title": "Shieldworks",
  "landing.flow.n2.body": "reads the parts list, checks shops, offers each job to one shop",
  "landing.flow.n3.title": "Small Canadian shops",
  "landing.flow.n3.body": "{assigned} jobs · {shops} shops",
  "landing.flow.n3.bodyEmpty": "qualified local shops",
  "landing.flow.n4.title": "Worker training",
  "landing.flow.n4.body": "4 seats, paid by Northgate → 3 stuck jobs go ahead",
  "landing.flow.return": "unsticks work",

  // -------------------------------------------------------------------------
  // §8.3 Program
  "program.h1": "Northgate's parts list",
  "program.b1.empty":
    "Northgate Land Systems (a fictional defence company) owes Canada $500M of business. Its first parts list is ready to load.",
  "program.b1.empty.look": "Each line is one part Northgate needs made in Canada.",
  "program.b1.uploaded":
    "40 parts worth $42.7M. Claude read every line to find the process, material and certificates each part needs.",
  "program.b1.uploaded.look": "5 are controlled parts. Only security-cleared shops may make them.",
  "program.b2":
    "**{assigned} of {jobs} jobs** are matched to **{shops} small Canadian shops**: {value} of work, {smePct} of it to small businesses. **{blocked} welding jobs are stuck.**",
  "program.b2.look": "The map: each line runs from Northgate's plant in London, ON to the shop making the part.",
  "program.next.load": "Load Northgate's parts list",
  "program.next.match": "Match jobs to shops →",
  "program.next.credit": "See the credit Northgate earned →",
  "program.next.why": "Why are {blocked} stuck? →",
  "program.upload.button": "Load Northgate's parts list (40 parts)",
  "program.upload.csv": "Use your own parts list (CSV)",
  "program.toast.tagged": "Claude read all {n} lines",
  "program.toast.taggedMixed": "Claude read {llm} lines · {rules} read by keyword rules",
  "program.stats.uploaded": "{n} parts · {value} of work · {controlled} controlled (security-cleared shops only)",
  "program.stat.matched": "Jobs matched",
  "program.stat.matched.sub": "to {shops} small Canadian shops",
  "program.stat.stuck": "Jobs stuck",
  "program.stat.stuck.sub": "no qualified workers free · See the fix →",
  "program.stat.value": "Work kept in Canada",
  "program.stat.value.sub": "{smePct} to small businesses (counts double)",
  "program.stat.controlled": "Controlled parts",
  "program.stat.controlled.sub": "all to security-cleared shops",
  "program.stat.sme": "Went to small businesses",
  "program.stat.sme.sub": "their work counts double",
  "program.map.title": "Where the work goes",
  "program.map.sub": "Northgate's plant in London, ON and the {shops} shops making its parts.",
  "program.map.legend":
    "Solid green line: job matched · Dashed purple line: controlled part, security-cleared shop · Grey dot: shop with no job yet",
  "program.map.legend.amber": "Amber dot: shop that could take a stuck job if it had the certification",
  "program.table.title": "The {jobs} jobs",
  "program.table.sub": "Read by Claude · each job offered to one qualified shop, no bidding",
  "program.table.showAll": "Show all {jobs} jobs",
  "program.col.job": "Job",
  "program.col.shop": "Matched shop",
  "program.col.match": "Match",
  "program.col.value": "Work value",
  "program.col.credit": "Credit toward $500M",
  "program.col.credit.tip":
    "Work value × Canadian content × 2 for small businesses. That's why credit can be bigger than the work. Credit isn't cash.",
  "program.chip.double": "counts double",
  "program.chip.single": "counts 1×",
  "program.stuck.reason": "Stuck: {reason}",

  "why.title": "Why {shop}?",
  "why.check.machines": "Has the right machines: {capabilities}",
  "why.check.cgp": "Security-cleared (Controlled Goods): required for this part",
  "why.check.sme": "Small business: its work counts double",
  "why.match": "Match {score}/100",
  "why.scoring": "How the match is scored",
  "why.factors": "Right machines {a} · Distance {b} · Can start soon {c} · Credit earned {d}",
  "why.credit": "Credit: {value} of work × {ccv} Canadian content × {mult} ({multLabel}) = **{credit}**",
  "why.controlled": "Drawings are never stored in Shieldworks. It matches on basic job details only.",

  // -------------------------------------------------------------------------
  // §8.4 Scorecard
  "score.h1": "Credit earned",
  "score.b":
    "Northgate owes Canada $500M of business. This first parts list earns **{credit} of credit: {pct} of what it owes.**",
  "score.b.funded": "Training and the 3 unstuck jobs lifted Northgate to **{credit}: {pct} of what it owes.**",
  "score.b.look": 'The "counts double" bar: small-business work earns twice the credit.',
  "score.next": "Fix the {blocked} stuck jobs →",
  "score.next.funded": "See the shop's side →",
  "score.meter.label": "What Northgate owes Canada",
  "score.meter.value": "**{credit}** of {obligation}",
  "score.meter.caption": "From this one parts list. Northgate's full contract will bring many more.",
  "score.chip.training": "+{training} from training (counts 5×)",
  "score.chip.jobs": "+{jobsCredit} from {n} jobs that were stuck ({jobsValue} of work)",
  "score.example.title": "How one job earns credit",
  "score.example.caption": "Every number on this page is built this way.",
  "score.chart.title": "What each kind of work counts for",
  "score.chart.row.regular": "Regular work · counts 1×",
  "score.chart.row.sme_direct": "Small-business work · counts double (2×)",
  "score.chart.row.training": "Training · counts 5×",
  "score.chart.row.indigenous_training": "Indigenous workforce training · counts 10×",
  "score.chart.empty": "Nothing yet · see step 4",
  "score.smb.label": "Small-business target",
  "score.smb.value": "**{achieved}** of {target} ({pct})",
  "score.smb.caption": "Rule: 15% of what's owed must involve small businesses.",
  "score.smb.basis": "Counts small-business work before the 2× bonus (assumption)",
  "score.details.split": "Work on this contract vs other activity",
  "score.details.split.note": "Extra credit can be kept for up to 10 years (simplified).",
  "score.details.ledger": "Every credit entry ({n})",
  "score.details.rules": "Rules version",
  "score.empty.title": "No credit yet: nothing has been matched.",
  "score.empty.body": "Load Northgate's parts list and match it to shops, and the credit appears here.",

  // -------------------------------------------------------------------------
  // §8.5 Gaps and Fund
  "gaps.h1": "Fix the skills gap",
  "gaps.b":
    "**{n} welding jobs ({value}) are stuck.** The certified welding shops on Shieldworks are full, and the others don't have the certification. Real shops found in public data can't be sent work until they claim their profile. **Training 4 welders at {shop} unsticks {k} of them.**",
  "gaps.b.look": "The training card: what Northgate pays, and what it gets back.",
  "gaps.next.fund": "↓ Fund the training below",
  "gaps.b.funded":
    "Northgate funded 4 welder training seats. **{k} stuck jobs ({jobsValue} of work) can go ahead;** {left} is still stuck.",
  "gaps.b.funded.look": "The before and after bar: how far training moved Northgate toward what it owes.",
  "gaps.next.shop": "See the shop's side →",
  "gaps.hero.eyebrow": "The fix · Training plan {id}",
  "gaps.hero.title": "{seats} welder training seats at {shopShort} ({town})",
  "gaps.hero.sub2": "The company also needs a qualified supervisor and approved procedures.",
  "gaps.eq.pay": "Northgate pays {cost}",
  "gaps.eq.pay.sub": "{seats} seats × {perSeat} incl. stipend",
  "gaps.eq.credit": "Counts as {credit} credit",
  "gaps.eq.credit.sub": "training counts 5×",
  "gaps.eq.unstick": "Unsticks {k} jobs",
  "gaps.eq.unstick.sub": "{jobsValue} of work → +{jobsCredit} credit",
  "gaps.whoPays": "Who pays? Northgate, from its own budget. It earns credit toward what it owes, not cash back.",
  "gaps.partner": "{partner} (example, not affiliated)",
  "gaps.fund.button": "Fund training",
  "gaps.rules.title": "Rules behind this",
  "gaps.rules.body":
    "Eligible training type: welder certification for Canadian citizens or permanent residents (ITB model terms §7.5.1). Training credit is capped at 25% of what's owed. ITB is run by the Defence Investment Agency since July 16, 2026.",
  "gaps.list.title": "{n} stuck welding jobs",
  "gaps.list.publicCwb": "Certified shops in public data haven't joined yet — see them",
  "gaps.list.fixChip": "Unsticks with {id}",
  "gaps.list.why": "Why no shop can take it",
  "gaps.why.process": "{n} don't do this welding process",
  "gaps.why.size": "{n} can't fit the part size",
  "gaps.why.certs": "{n} lack the certification",
  "gaps.why.capacity": "{n} are full",
  "gaps.why.controlled": "{n} aren't security-cleared",
  "gaps.other.title": "Another option",
  "gaps.stat.stuck": "Stuck jobs",
  "gaps.stat.unstuck": "Unstuck by training",
  "gaps.empty.title": "Nothing is stuck yet: nothing has been matched.",
  "gaps.empty.body": "Load Northgate's parts list and match it to shops, and any stuck jobs appear here.",
  // Every trade, not just welders: the welding keys above stay word for word for the demo;
  // these fill in for other trades (CNC machinists, electronics assemblers, …) or none.
  "gaps.b.trade":
    "**{n} {jobsNoun} ({value}) {isAre} stuck.** No qualified shop on Shieldworks has the certification or the free hours. Real shops found in public data can't be sent work until they claim their profile. **Training {who} at {shop} unsticks {k} of them.**",
  "gaps.b.funded.none.trade": "Northgate funded {training}. **Every stuck job can now go ahead.**",
  "gaps.hero.title.trade": "{seats} {worker} training seats at {shopShort} ({town})",
  "gaps.eq.pay.sub.plain": "{seats} seats × {perSeat}",
  "gaps.rules.body.type":
    "Eligible training type: {type} (ITB model terms §7.5.1). Training credit is capped at 25% of what's owed. ITB is run by the Defence Investment Agency since July 16, 2026.",
  "gaps.rules.type.personal_certification": "{worker} certification for Canadian citizens or permanent residents",
  "gaps.rules.type.apprentice_sponsorship": "sponsoring {worker} apprentices in a recognized apprenticeship program",
  "gaps.rules.type.education_costs": "tuition and course fees in Canada for {workers}",
  "gaps.rules.type.skills_program_contribution": "a skills program run by a registered charity or nonprofit",
  "gaps.list.title.trade": "{n} stuck {jobsNoun}",
  "gaps.list.title.funded.trade": "Stuck jobs: {fixed} fixed, {left} still stuck",
  "gaps.list.publicShops": "Qualified shops in public data haven't joined yet — see them",
  "gaps.why.process.generic": "{n} don't do {proc}",
  "gaps.reason.full.generic": "every qualified {proc} shop is full ({need} hrs/wk needed)",
  "gaps.reason.full.trade": "every qualified {proc} shop is full ({need} hrs/wk needed): short of {workers}",
  "gaps.reason.capacity.trade": "every qualified shop is full: short of {workers}",

  "fund.caption":
    "{jobsValue} of work that was stuck can now go ahead. Credit isn't cash: small-business work counts double, and training counts 5×.",
  "fund.bar": "**{before} → {after}** of what Northgate owes",
  "fund.bar.before": "Before: {credit} ({pct})",
  "fund.bar.after": "After: {credit} ({pct})",
  "fund.bar.delta": "+{delta} credit",
  "fund.stuck": "Stuck jobs {before} → {after}",
  "fund.stillStuck": "Still stuck: **{job}**. The only certified shop that fits is full.",
  "fund.smb": "Small-business target: {before} → {after}",
  "fund.breakdown": "Where the new credit comes from",

  // -------------------------------------------------------------------------
  // §8.6 Shop (syn-012)
  "shop.b":
    "This is what **{shop}**, a synthetic small shop in {town}, sees: **{n} job offers from Northgate worth {value}**, and one certification that would win {k} more.",
  "shop.b.look": "The top card: what one step would unlock.",
  "shop.b.funded":
    "**Northgate paid to train {seats} of {shopShort}'s welders.** The {k} jobs that were stuck ({jobsValue}) are now offered to {shopShort}. They start once the welders qualify.",
  "shop.b.funded.look": "{k} new offers, marked New, and {seats} welders in training.",
  "shop.next": "Open the shop's phone →",
  "shop.chip.synthetic": "Synthetic demo shop",
  "shop.ready.cwb.plain":
    "Welding certification from the Canadian Welding Bureau: the company is certified, and each welder passes a test. Northgate can pay for the welder training.",
  "shop.ready.fundLink": "See how Northgate can fund this →",
  "shop.ready.fundRequested": "Funding requested · awaiting Northgate",
  "shop.ready.fundRequested.sub": "The shop asked Northgate to pay for the welder training.",
  "shop.inbox.title": "Job offers from Northgate",
  "shop.inbox.sub": "No bidding: each job was offered only to you.",
  "shop.stat.offers": "Offers from Northgate",
  "shop.stat.offers.sub": "{n} jobs",
  "shop.stat.why": "Why Northgate wants you",
  "shop.stat.why.sub": "{credit} credit · your work counts double toward what it owes",
  "shop.stat.reach": "One step away",
  "shop.stat.reach.sub": "{k} more jobs",
  "shop.stat.training": "Welders in training",
  "shop.stat.training.sub": "paid by Northgate",
  // Every trade: the welding keys above stay for the demo; these cover other trades or none.
  "shop.b.funded.trade":
    "**Northgate paid to train {who} for {shopShort}.** The {k} jobs that were stuck ({jobsValue}) are now offered to {shopShort}. They start once the trainees qualify.",
  "shop.b.funded.look.trade": "{k} new offers, marked New, and {who} in training.",
  "shop.ready.fundRequested.sub.trade": "The shop asked Northgate to pay for the training.",
  "shop.stat.training.trade": "{Workers} in training",
  "shop.stat.training.generic": "In training",
  "shop.certs.title": "Certificates",
  "shop.certs.counter": "{held} of {needed} needed in place",
  "shop.certs.more": "{n} more not held · show",
  "shop.certs.notHeld": "Not held",
  "shop.naics": "Industry code",
  "shop.empty.title": "Northgate hasn't sent offers yet.",
  "shop.empty.body": "Load Northgate's parts list and match it to shops, and this shop's offers appear here.",
  // Empty states seen from a non-prime desk: only Northgate can load and match its parts list.
  "empty.role.shop": "Northgate hasn't sent offers yet. You'll see them here the moment it does.",
  "empty.role.partner": "Northgate hasn't sent its parts list yet.",

  // -------------------------------------------------------------------------
  // §8.7 Network and discovered profile
  "net.h1": "Canada's hidden supply base",
  "net.b":
    "**{total} shops in southwestern Ontario:** {syn} synthetic demo shops that receive the demo's offers, and **{pub} real manufacturers found in public data** (unverified, not affiliated, never sent work).",
  "net.b.look": "Filter to real shops to see who's already out there.",
  "net.next": "Back to the story →",
  "net.search": "Is your shop here? Search by name or city",
  "net.filter.syn": "Demo shops (synthetic) · {syn}",
  "net.filter.pub": "Real shops · discovered from public data · {pub}",
  "net.legend": "Green: held (demo data) · Blue: stated on the company's website (unverified)",
  "net.othersNotListed": "Others not listed",
  "net.stat.sme": "Small businesses",
  "net.stat.cgp": "Security-cleared (Controlled Goods)",
  "net.stat.capacity": "Weekly shop hours (demo shops)",
  "pub.claim": "Claim this profile",
  "pub.claim.dialog": "Coming soon. Shops will claim and verify their own profile. Nothing is collected in this demo.",
  "pub.sources": "Sources",
  "pub.badge": "Public data — unverified — not affiliated",
  "pub.notOnboarded": "Not onboarded: no offers",

  // -------------------------------------------------------------------------
  // Landing & Program (Agent B): keys §8 does not list, merged from copy-b.ts
  // Landing (§4)
  "landing.run.continueSub": "The parts list is loaded and matched. Pick up where you left off.",
  "landing.signin.title": "Or sign in as…",
  "landing.signin.sub":
    "Each side of a defence contract has its own desk: the defence company, the small shop, the college and the trainee.",
  "landing.flow.aria": "How Shieldworks works",

  // Program (§5.1, §5.2)
  "program.b2.allMatched":
    "**{assigned} of {jobs} jobs** are matched to **{shops} small Canadian shops**: {value} of work, {smePct} of it to small businesses.",
  "program.upload.demo.title": "Northgate's parts list",
  "program.upload.demo.body":
    "{n} parts from a fictional armoured-vehicle program, quantities for the whole fleet (about {value}).",
  "program.upload.drop": "Drop a parts list here (CSV)",
  "program.upload.choose": "choose a file",
  "program.upload.columns": "columns: part_no, description, qty, unit_price_cad",
  "program.upload.or": "or",
  "program.loaded": "Parts list loaded",
  "program.loaded.file": "Parts list loaded: {file}",
  "program.drawings": "Shieldworks never stores drawings. It matches on basic job details only.",
  "program.map.site": "Northgate's plant (fictional)",
  "program.map.sub.unrouted": "The shops in southwestern Ontario. Match the jobs to draw a line to each shop.",
  "program.map.legend.site": "Red diamond: Northgate's plant (fictional)",
  "program.map.legend.matched": "Solid green line: job matched",
  "program.map.legend.controlled": "Dashed purple line: controlled part, security-cleared shop",
  "program.map.legend.idle": "Grey dot: shop with no job yet",
  "program.map.legend.shop": "Green dot: shop with a job",
  "program.table.sub.mixed":
    "Read by Claude ({llm}) and by keyword rules ({rules}) · each job offered to one qualified shop, no bidding",
  "program.table.sub.unrouted": "Read by Claude · the process, material and certificates each part needs",
  "program.table.showFewer": "Show fewer jobs",
  "program.table.showing": "Showing {n} of {jobs}: the stuck jobs, a controlled part and the largest job",
  "program.table.showing.unrouted": "Showing {n} of {jobs}",
  "program.table.none": "No jobs match this filter.",
  "program.filter.all": "All",
  "program.filter.matched": "Matched",
  "program.filter.stuck": "Stuck",
  "program.filter.controlled": "Controlled",
  "program.col.processes": "Processes",
  "program.col.why": "Why",
  "program.badge.stuck": "Stuck",
  "program.badge.controlled": "Controlled",
  "program.notMatched": "Not matched yet",
  "program.stuck.fix": "See the fix →",
  "program.chip.rules": "Read by keyword rules",
  "program.chip.rules.tip": "Claude was not available for this line, so keyword rules read it.",
  "program.chip.review": "Review",
  "program.credit.row": "{value} × {ccv} Canadian content × {mult} = {credit}",
  "program.solver.ortools": "Best overall assignment (OR-Tools)",
  "program.solver.greedy": "Quick assignment (greedy)",

  // Why popovers (§5.2)
  "why.button": "Why?",
  "why.aria": "Why {shop}?",
  "why.distance": "{km} from Northgate's plant",
  "why.hours": "{h} hrs/wk",
  "why.blocked.aria": "Why is {job} stuck?",
  "why.blocked.title": "Why {job} is stuck",
  "why.blocked.heading": "Why no shop can take it",
  "why.blocked.eligible": "{n} shops pass every check except free hours.",
  "why.blocked.eligible.one": "1 shop passes every check except free hours.",
  "why.fail.cpcsc": "{n} lack the cyber self-check",

  // -------------------------------------------------------------------------
  // Scorecard (Agent C): keys §8 does not list, merged from copy-c.ts
  "score.meta.title": "Credit earned · Shieldworks",
  "score.meta.description":
    "How much of the $500M Northgate owes Canada its first parts list covers, what counts double, and what training adds. Simplified ITB rules for demo.",

  // Banner before anything is matched
  "score.b.empty": "Northgate owes Canada $500M of business. **No credit yet: nothing has been matched.**",
  "score.b.empty.look": "One click loads Northgate's parts list and matches it to shops.",

  // Big meter
  "score.meter.pct.sub": "of what Northgate owes",
  "score.meter.aria": "Credit earned: {pct} of the {obligation} Northgate owes Canada, on a 0 to 100% scale",
  "score.meter.scale.start": "0%",
  "score.meter.scale.end": "100% = {obligation}",
  "score.meter.before": "Before: {credit} ({pct})",
  "score.meter.after": "After: {credit} ({pct})",
  "score.meter.delta": "+{delta} credit",
  "score.meter.pending": "Nothing added yet · step 4 shows what training adds",
  "score.meter.caveat": "Training cost is an assumption",
  "score.meter.caveat.note": "Training cost is an estimate for the demo, not a quote",
  "score.meter.caveat.indigenous": " · 10× Indigenous workforce credit needs Defence Investment Agency confirmation",
  "score.chip.training.title": "{id}: {cost} of training × {mult} = {credit} credit",
  "score.chip.jobs.title": "{credit} credit from {value} of work that was stuck and is now matched",

  // Worked example
  "score.example.job": "Job {id} · {shop}",

  // Chart
  "score.chart.sub":
    "Solid bar: credit earned. Dashed outline: the work it came from. A bar longer than its outline means that work counts extra.",
  "score.chart.legend.credit": "Credit earned (solid bar)",
  "score.chart.legend.value": "Work it came from (dashed outline)",
  "score.chart.callout.label": "Small-business work · counts double",
  "score.chart.callout.sub": "of all credit earned",
  "score.chart.bar.credit": "{credit} credit",
  "score.chart.bar.from": "from {value} of work",
  "score.chart.bar.training": "from {value} of training",
  "score.chart.empty.lead": "Nothing yet",
  "score.chart.empty.link": "see step 4",
  "score.chart.unit.job": "{n} job",
  "score.chart.unit.jobs": "{n} jobs",
  "score.chart.unit.plan": "{n} training plan",
  "score.chart.unit.plans": "{n} training plans",
  "score.chart.funded": "✓ Funded",
  "score.chart.foot":
    "Credit = work value × Canadian content × how much it counts. Under the simplified rules, regular work counts 1×, small-business work on this contract 2×, training the company pays for 5×, and Indigenous workforce development 10×.",
  "score.chart.tip": "{label}: {value} of work → {credit} credit ({unit})",

  // Small-business target
  "score.smb.before": "Before funding ({pct})",
  "score.smb.added": "+{pct} from small-business jobs that were stuck",
  "score.smb.aria": "Small-business target: {achieved} of {target}",

  // Details: direct vs indirect
  "score.split.direct.sub": "Making parts for this contract",
  "score.split.indirect.sub": "Such as training",
  "score.split.indirect.none": "None yet ·",
  "score.split.indirect.link": "see step 4",

  // Details: ledger
  "score.ledger.sub": "Every row: work value × Canadian content × how much it counts = credit.",
  "score.ledger.col.job": "Job / training plan",
  "score.ledger.col.shop": "Shop",
  "score.ledger.col.kind": "Kind",
  "score.ledger.col.category": "Type of work",
  "score.ledger.col.value": "Work value",
  "score.ledger.col.ccv": "Canadian content",
  "score.ledger.col.mult": "Counts",
  "score.ledger.col.credit": "Credit",
  "score.ledger.col.flags": "Notes",
  "score.ledger.new": "New",
  "score.ledger.showAll": "Show all {n} entries",
  "score.ledger.showFewer": "Show fewer",
  "score.ledger.total": "Total credit",
  "score.ledger.totalHidden": "Total of all {n} entries ({hidden} hidden)",
  "score.ledger.flag.simplified": "Simplified demo",

  // Plain names for ledger categories and kinds
  "score.cat.regular": "Regular work",
  "score.cat.sme_direct": "Small-business work",
  "score.cat.training": "Training",
  "score.cat.indigenous_training": "Indigenous workforce training",
  "score.kind.direct": "Work on this contract",
  "score.kind.indirect": "Other eligible activity",

  // Details: rules version
  "score.rules.chip": "rules {version}",

  // -------------------------------------------------------------------------
  // Gaps & Fund (Agent D): keys §8 does not list, merged from copy-d.ts
  "gaps.meta.title": "Fix the skills gap · Shieldworks",
  "gaps.meta.description":
    "Why 4 welding jobs are stuck, and what $96K of welder training paid by the defence company fixes.",

  // Banner, funded, nothing left stuck (only if a second package is funded too).
  "gaps.b.funded.none": "Northgate funded welder training. **Every stuck job can now go ahead.**",
  // Banner, routed but nothing stuck (other data sets).
  "gaps.b.clear": "**Every job found a shop.** Nothing is stuck, so no training is needed.",

  // Hero card
  "gaps.hero.requested": "Shop requested · {time}",
  "gaps.hero.requested.tip": "The shop asked Northgate to fund this from the Shieldworks phone app ({requirement})",
  "gaps.hero.funded": "Funded",
  "gaps.hero.pending": "Funding…",
  "gaps.hero.seeShop": "See it from the shop's side →",
  "gaps.hero.perSeat.tip": "Estimate for demo: {cost} ÷ {seats} seats, from data/rules/training_costs.json",

  // Stuck jobs list
  "gaps.list.title.funded": "Stuck welding jobs: {fixed} fixed, {left} still stuck",
  "gaps.list.stuck": "Stuck: {reason}",
  "gaps.list.matched": "Matched to {shop} ({town})",
  "gaps.list.matched.credit": "+{credit} credit · {m}",
  "gaps.list.unstuckBy": "Unstuck by training plan {id}",
  "gaps.list.fixChip.tip": "Funding training plan {id} unsticks this job",
  "gaps.stat.stuck.sub": "{value} of work",
  "gaps.stat.unstuck.sub.none": "Fund the training above",
  "gaps.stat.unstuck.sub": "+{credit} credit added",
  "gaps.allPlaced.title": "Every job found a shop",
  "gaps.allPlaced.body": "Shieldworks found a qualified shop with free capacity for every job. No training is needed.",

  // Stuck reasons, rewritten from the engine's reason codes in plain words.
  "gaps.reason.both": "both certified welding shops are full ({a} and {b} hrs/wk free, {need} needed)",
  "gaps.reason.only": "the only certified welding shop that fits is full ({a} hrs/wk free, {need} needed)",
  "gaps.reason.capacity": "every qualified shop is full",
  "gaps.reason.certs": "no shop has the certification it needs",
  "gaps.reason.other": "no qualified shop has free capacity yet",

  // Another option (TP-02 and any other package)
  "gaps.other.sub": "A second training plan, for the stuck job the first one doesn't fix.",
  "gaps.other.pays": "Northgate pays",
  "gaps.other.credit": "Counts as credit ({m}×)",
  "gaps.other.unsticks": "Unsticks",
  "gaps.other.unsticks.value": "{k} job{s} · {value} of work",
  "gaps.other.partner": "Training partner",
  "gaps.other.trainees": "Trainees",
  "gaps.other.trainees.value": "{n} workers",
  "gaps.other.gap": "What's missing",
  "gaps.other.type": "Credit type",

  // Fund moment
  "fund.title": "Training plan {id} funded at {shop}",
  "fund.counter.label": "Canada work credit so far",
  "fund.counter.was": "was {credit}",
  "fund.counter.tip": "Exact: {after} (was {before}, +{added})",
  "fund.matched": "Matched jobs {before} → {after}",
  "fund.goAhead": "{k} stuck job{s} can now go ahead",
  "fund.caveat": "Training cost is an assumption · Simplified ITB rules for demo",
  "fund.caveat.tenX": " · the 10× Indigenous workforce credit needs Defence Investment Agency confirmation",
  "fund.breakdown.training": "Training",
  "fund.breakdown.training.sub": "other eligible activity, counts {m}×",
  "fund.breakdown.jobs": "Jobs that were stuck",
  "fund.breakdown.jobs.sub": "work on this contract, now matched",
  "fund.flip.before": "Stuck before funding",
  "fund.flip.after": "Matched to {shop}",

  // -------------------------------------------------------------------------
  // Shop & Directory (Agent E): keys §8 does not list, merged from copy-e.ts
  // §5.5 Shop (syn-012 and the other synthetic shops)
  "shop.b.noReach":
    "This is what **{shop}**, a synthetic small shop in {town}, sees: **{n} job offers from Northgate worth {value}**.",
  "shop.b.noOffers":
    "This is what **{shop}**, a synthetic small shop in {town}, sees: no job offers from Northgate in this parts list yet.",
  "shop.b.empty":
    "This is what **{shop}**, a synthetic small shop in {town}, sees once Northgate's parts list is matched to shops.",
  "shop.b.empty.look": "Job offers from Northgate, and what one step would unlock.",
  "shop.b.eyebrow.other": "A synthetic demo shop · not part of the 5-step story",
  "shop.back": "Shops directory",
  "shop.back.step4": "Step 4: Fix the skills gap",
  "shop.ready.eyebrow": "What one step would unlock",
  "shop.ready.jobs": "{k} jobs · {value}",
  "shop.ready.showJobs": "Show the {k} jobs",
  "shop.ready.hideJobs": "Hide the jobs",
  "shop.ready.more": "Also one step away",
  "shop.ready.none": "Nothing is one step away right now: this shop already qualifies for everything it is close to.",
  "shop.ready.notRouted": "What one step would unlock appears once Northgate's parts list is matched.",
  "shop.ready.trainingFunded": "Northgate paid for {seats} welder training seats. The welders start once they qualify.",
  "shop.ready.trainingFunded.trade": "Northgate paid for {seats} {worker} training seats. The trainees start once they qualify.",
  "shop.inbox.total": "{n} offers · {open} waiting for your reply",
  "shop.inbox.fictional": "(fictional)",
  "shop.inbox.hours": "{h} hours a week",
  "shop.inbox.earns": "Northgate earns {credit} credit",
  "shop.inbox.accepted": "Accepted",
  "shop.inbox.accepted.note": "Added to your production plan: {h} hours a week",
  "shop.inbox.declined": "Declined",
  "shop.inbox.acceptInstead": "Accept instead",
  "shop.inbox.none": "No offers yet",
  "shop.inbox.none.routed": "No job in this parts list fits this shop yet. The card above shows what one step would unlock.",
  "shop.inbox.none.empty": "Offers appear here once Northgate's parts list is matched to shops.",
  "shop.reason.sme": "Small business: work counts double",
  "shop.stat.offers.subNew": "{n} jobs · {k} new after training",
  "shop.stat.why.value": "credit · your work counts double toward what it owes",
  "shop.stat.why.value1": "credit · counts 1× (not a small business)",
  "shop.stat.reach.none": "nothing one step away",
  "shop.stat.training.none": "none funded yet",
  "shop.chip.smb": "Small business (SMB) · counts double",
  "shop.chip.notSmb": "Larger business · counts 1×",
  "shop.employees": "{band} employees",
  "shop.certs.sub": "Certificates this shop holds, and the ones its job offers need.",
  "shop.certs.less": "Hide the {n} not held",
  "shop.certs.paidTraining": "Paid by Northgate (training)",
  "shop.certs.selfDeclared": "Self-declared",
  "shop.certs.checked": "Checked {date}",
  "shop.certs.expires": "Expires {date}",
  "shop.certs.shopDeclared": "shop-declared",
  "shop.certs.cpcsc": "Self-assessed · no public registry.",
  "shop.certs.illustrative": "Dates and statuses on synthetic shops are illustrative.",
  "shop.training.title": "Welder training",
  "shop.training.sub": "Training Northgate can pay for. It counts 5× toward what Northgate owes (10× for Indigenous workforce development).",
  "shop.training.caveat":
    "Training cost is an assumption · 10× Indigenous workforce credit needs Defence Investment Agency confirmation",
  "shop.training.none": "No training suggested or funded for this shop yet.",
  "shop.training.partner": "Training partner",
  "shop.training.type": "Eligible training type",
  "shop.training.seats": "Training seats",
  "shop.training.unlocks": "Unlocks",
  "shop.training.suggested": "Suggested: {seats} welder training seats for {cert}",
  "shop.training.funded": "{seats} welders in training for {cert}",
  // Every trade: other trades (or none) instead of the welding keys above.
  "shop.training.title.trade": "{Worker} training",
  "shop.training.title.generic": "Worker training",
  "shop.training.suggested.trade": "Suggested: {seats} {worker} training seats for {cert}",
  "shop.training.funded.trade": "{who} in training for {cert}",
  "shop.caps.show": "Show the shop's machines and capabilities",
  "shop.caps.hide": "Hide the shop's machines and capabilities",
  "shop.error": "Could not load shop “{id}”",

  // §5.6 Network (Shops directory)
  "net.filter.all": "All · {total}",
  "net.stat.sme.sub": "of {syn} demo shops · their work counts double",
  "net.stat.cgp.sub": "of {syn} demo shops · can make controlled parts",
  "net.stat.capacity.sub": "all processes, {syn} demo shops",
  "net.discovered":
    "Real shops come from Statistics Canada ODBus (Open Government Licence) and each company's own website: unverified, not affiliated, not onboarded. They are never offered work until they claim and verify their profile.",
  "net.col.shop": "Shop",
  "net.col.city": "City",
  "net.col.size": "Size",
  "net.col.processes": "Processes",
  "net.col.certs": "Certificates",
  "net.col.capacity": "Weekly hours",
  "net.size.smb": "Small business",
  "net.size.large": "Larger business",
  "net.size.est": "(est.)",
  "net.demoShop": "Demo shop · step 5",
  "net.notOnboarded": "Not onboarded",
  "net.noCerts": "None held",
  "net.noCerts.pub": "None stated",
  "net.inTraining": "in training",
  "net.showing": "Showing {n} of {total}",
  "net.clear": "Clear",
  "net.empty": "No shops match these filters.",
  "net.city": "City",
  "net.city.all": "All cities",
  "net.process": "Process",
  "net.process.all": "All processes",
  "net.cert": "Certificate",
  "net.cert.any": "Any",
  "net.processesNone": "Processes not stated",
  "net.error": "Could not load shops",
  "net.dnd.chip": "National Defence contracts (public record)",

  // §5.6 Discovered profile (/shops/pub-*)
  "pub.b":
    "**{name}** is a real manufacturer in {city}, found in public data. It is **not onboarded**: Shieldworks has never sent it work.",
  "pub.b.look": "What the company says it can do, and where each fact comes from.",
  "pub.chip.real": "Real shop · public data",
  "pub.notOnboarded.body":
    "This company was discovered in public data and is not affiliated with Shieldworks or Northgate. It is not offered work until it claims and verifies its profile.",
  "pub.claim.title": "Claim this profile",
  "pub.claim.close": "Close",
  "pub.caps.title": "Capabilities",
  "pub.caps.sub": "As described on the company's own website. Unverified.",
  "pub.certs.title": "Certificates",
  "pub.certs.sub": "What the company says about itself. Shieldworks has not verified any of it.",
  "pub.certs.none": "No certificates stated on the company website.",
  "pub.certs.selfReported": "Stated on the company website (unverified)",
  "pub.certs.directory": "Listed in a public directory (unverified)",
  "pub.certs.leads": "Unconfirmed mentions",
  "pub.certs.notStated":
    "Not publicly stated: {list}. The cyber-security self-check (CPCSC L1) is self-assessed with no public registry, so only the shop can declare it.",
  "pub.sources.sub":
    "Every field keeps its source. Shieldworks stores facts only: no drawings, no personal names, no contact details.",
  "pub.sources.base":
    "Base list: Statistics Canada Open Database of Businesses (Open Government Licence – Canada), plus each company's own website.",
  "pub.size.smb": "Small business (estimated)",
  "pub.size.large": "Not a small business (estimated)",
  "pub.size.search": "From web search; not confirmed by the company",
  "pub.capacity": "Capacity and lead time",
  "pub.capacity.unknown": "Unknown",
  "pub.capacity.later": "Shared by the shop when it claims its profile",
  "pub.dnd.badge": "National Defence contract history (public record)",
  "pub.dnd.line":
    "Public record: {contracts} National Defence contract{s} over $10K worth {value} (latest {last}). Matched to this company by name and location: unverified.",
  "pub.dnd.tip":
    "National Defence contracts over $10K, Jan 2021 – Jun 2026 (proactive disclosure, open.canada.ca, Open Government Licence). Matched by company name and location ({confidence} confidence); not confirmed by the company.",

  // Cycle 2 (desktop pages)
  // Shop profile opened from Find suppliers (C2-11)
  "shop.backToSuppliers": "Back to Find suppliers",
  // Offer answers the demo simulator wrote (C2-7; same wording as the phone)
  "shop.inbox.accepted.sim": "Accepted by the demo simulator",
  "shop.inbox.declined.sim": "Declined by the demo simulator",
  "shop.inbox.declined.simWith": "Declined by the demo simulator: {reason}",
  // Training-credit cap (C2-15). cap = what's owed × 25%; used = credit from funded training.
  "score.cap.line":
    "Training credit can count for at most 25% of what Northgate owes: {cap} (ITB model terms §7.5.4.1). Funded training so far uses {used}, {pct} of that cap.",
  "score.cap.none":
    "Training credit can count for at most 25% of what Northgate owes: {cap} (ITB model terms §7.5.4.1). No training funded yet (0% of the cap).",
  "score.cap.wouldUse":
    "Training credit can count for at most 25% of what Northgate owes: {cap} (ITB model terms §7.5.4.1). With this plan, training uses {used}, {pct} of that cap.",
  // Evidence pack (C2-16)
  "score.evidence": "Download evidence pack (CSV)",
  "score.evidence.busy": "Building the evidence pack…",
  "score.evidence.hint": "Match the parts list first: there is no credit to show yet.",
  "score.evidence.done": "Evidence pack downloaded",
  "score.evidence.done.body": "{n} credit lines, built in this browser. Demo only: not an official ITB report.",
  "score.evidence.failed": "Could not build the evidence pack",
  // Claim this profile (demo) (C2-17)
  "pub.claim.demo": "Demo",
  "pub.claim.intro":
    "Work at {name}? Claiming the profile lets the shop correct it and be offered work. It takes three steps:",
  "pub.claim.step1": "Show you work there, with an email address at the company's own domain.",
  "pub.claim.step2": "Confirm what the shop can make and how many hours a week it has free.",
  "pub.claim.step3": "Add proof of your certificates (for example, a registry listing or a certificate copy).",
  "pub.claim.never": "Never upload drawings or controlled technical data. Shieldworks doesn't need them to claim a profile.",
  "pub.claim.email": "Work email",
  "pub.claim.email.placeholder": "you@yourcompany.ca",
  "pub.claim.email.hint": "Use your email at the company's own domain.",
  "pub.claim.email.hintHost": "Use your email at the company's own domain ({host}).",
  "pub.claim.email.invalid": "Enter a work email address, like you@company.ca.",
  "pub.claim.warn.free":
    "{domain} is a free email provider. Verification needs an address at the company's own domain.",
  "pub.claim.warn.domain":
    "{domain} doesn't match the company website ({host}). Verification may take longer.",
  "pub.claim.role": "Your role",
  "pub.claim.role.pick": "Pick your role",
  "pub.claim.role.missing": "Pick your role.",
  "pub.claim.role.owner": "Owner",
  "pub.claim.role.operations": "Operations / plant manager",
  "pub.claim.role.quality": "Quality manager",
  "pub.claim.role.sales": "Sales / estimating",
  "pub.claim.role.other": "Other",
  "pub.claim.privacy": "No name needed. The request stays in this browser: nothing is sent.",
  "pub.claim.submit": "Request claim (demo)",
  "pub.claim.pending": "Claim requested — pending verification.",
  "pub.claim.pending.body": "Requested for {email} ({role}).",
  "pub.claim.pending.demo": "Demo only: nothing was sent.",
}

/** §8.8: tooltips are the PLAIN "tip" column, keyed plain.<KEY>.tip (plus .first / .label). */
const PLAIN_KEYS: Record<string, string> = Object.fromEntries(
  Object.entries(PLAIN).flatMap(([k, v]) => [
    [`plain.${k}.first`, v.first],
    [`plain.${k}.label`, v.label],
    [`plain.${k}.tip`, v.tip],
  ])
)

export const COPY: Record<string, string> = { ...PLAIN_KEYS, ...BASE }

/**
 * Look up a copy key and interpolate "{name}" placeholders.
 * Missing keys return the key itself (visible in review, never a crash); missing vars stay as "{name}".
 */
export function c(key: string, vars?: Record<string, string | number>): string {
  const raw = COPY[key]
  if (raw === undefined) {
    if (process.env.NODE_ENV !== "production") console.warn(`[copy] missing key: ${key}`)
    return key
  }
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

/** Strip **bold** markers (for aria-labels, titles and plain-text contexts). */
export function plainText(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1")
}

/** Renders **…** as <strong>, nothing else (no HTML, no other markdown). */
export function Rich({ text, className }: { text: string; className?: string }): ReactElement {
  const parts = text.split(/(\*\*.+?\*\*)/g).filter((p) => p !== "")
  const children = parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4
      ? createElement("strong", { key: i, className: "font-semibold text-foreground" }, p.slice(2, -2))
      : createElement(Fragment, { key: i }, p)
  )
  return className ? createElement("span", { className }, children) : createElement(Fragment, null, children)
}
