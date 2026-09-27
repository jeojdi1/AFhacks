// Story-page copy that web/lib/ui/copy.ts does not have yet (QA fixes Q6, Q9, Q23, Q34).
// Count-aware variants of existing keys, so nothing reads "1 welding jobs" or "the 3 unstuck
// jobs" when the count is different. Same "{x}" and "**bold**" rules as copy.ts.
//
// sc(key, vars): a key defined here wins; any other key falls through to c() in copy.ts.
// These keys can move into copy.ts BASE verbatim; nothing else needs to change.

import { c, COPY } from "@/lib/ui/copy"

const EXTRA: Record<string, string> = {
  // /program banner and stats (Q9: 3 of the matched shops are not small businesses; Q23: plurals)
  "program.b2.sme":
    "**{assigned} of {jobs} jobs** are matched to **{shops} Canadian shops** ({smeShops} of them small businesses): {value} of work, {smePct} of it to small businesses. **{blocked} welding jobs are stuck.**",
  "program.b2.sme.one":
    "**{assigned} of {jobs} jobs** are matched to **{shops} Canadian shops** ({smeShops} of them small businesses): {value} of work, {smePct} of it to small businesses. **1 welding job is stuck.**",
  "program.b2.sme.allMatched":
    "**{assigned} of {jobs} jobs** are matched to **{shops} Canadian shops** ({smeShops} of them small businesses): {value} of work, {smePct} of it to small businesses.",
  "program.next.why.one": "Why is 1 stuck? →",
  "program.stat.matched.sub.sme": "to {shops} Canadian shops ({smeShops} small businesses)",
  "program.stat.stuck.none": "every job has a shop",

  // /scorecard banner (Q23, Q34)
  "score.b.funded.n": "Training and the {unstuck} unstuck jobs lifted Northgate to **{credit}: {pct} of what it owes.**",
  "score.b.funded.one": "Training and the 1 unstuck job lifted Northgate to **{credit}: {pct} of what it owes.**",
  "score.b.funded.any": "Training and the jobs it unstuck lifted Northgate to **{credit}: {pct} of what it owes.**",
  "score.b.funded.look": "The before and after on the top bar: how far training moved Northgate toward what it owes.",
  "score.chart.empty.indigenous": "needs Defence Investment Agency confirmation",

  // /gaps (Q2, Q6, Q23)
  "gaps.b.funded.n":
    "Northgate funded {what}. **{k} stuck {jobsWord} ({jobsValue} of work) can go ahead;** {left} {isAre} still stuck.",
  "gaps.b.funded.seats": "{seats} welder training seats",
  "gaps.b.funded.training": "welder training",
  "gaps.eq.unstick.one": "Unsticks 1 job",
  "gaps.eq.credit.sub.m": "training counts {m}×",
  "gaps.list.title.one": "1 stuck welding job",
  "gaps.other.title.requested": "Another option · a shop asked for this",
  "gaps.fund.ask": "Ask Northgate to fund this",
  "gaps.fund.ask.tip": "Only Northgate, the defence company, can fund training. Your request goes to Northgate from the shop app.",
  "gaps.fund.primeOnly": "Only Northgate, the defence company, can fund this training.",
  "fund.caption.m":
    "{jobsValue} of work that was stuck can now go ahead. Credit isn't cash: small-business work counts double, and training counts {m}×.",
}

function interpolate(raw: string, vars?: Record<string, string | number>): string {
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

/** Story copy lookup: EXTRA first, then copy.ts. */
export function sc(key: string, vars?: Record<string, string | number>): string {
  const raw = EXTRA[key]
  if (raw !== undefined) return interpolate(raw, vars)
  return c(key, vars)
}

/** True if the key exists here or in copy.ts. */
export function hasCopy(key: string): boolean {
  return key in EXTRA || key in COPY
}
