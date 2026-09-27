// Static params for the GitHub Pages export (PAGES_EXPORT=1, scripts/build_pages.sh).
//
// A static export serves only the pages generated at build time: any other URL 404s on
// GitHub Pages. So in Pages mode every dynamic route lists every URL the demo-data app can
// link to, taken from the bundled fixtures. Outside Pages mode nothing here runs: the pages
// keep their normal behaviour (render on request, or the one prerendered demo shop).
//
// Server/build-time only: imported by server page modules, never by client components.

import shopsFx from "@fixtures/shops.json"
import shopsPublicFx from "@fixtures/shops_public.json"
import jobsFx from "@fixtures/jobs.json"
import gapsFx from "@fixtures/gaps.json"
import gapsAfterFx from "@fixtures/gaps_after_fund.json"
import assignmentsFx from "@fixtures/assignments.json"
import assignmentsAfterFx from "@fixtures/assignments_after_fund.json"
import shop012Fx from "@fixtures/shop_syn-012.json"
import shop012AfterFx from "@fixtures/shop_syn-012_after_fund.json"
import searchJobs012Fx from "@fixtures/search/jobs_syn-012.json"
import readinessRules from "../../../data/rules/readiness_steps.json"
import { requirementSlug } from "@/lib/app/readiness"

/** True only while `next build` runs for the GitHub Pages export. */
export const PAGES_EXPORT = process.env.PAGES_EXPORT === "1"

type ShopRow = { id: string; processes?: string[]; cert_summary?: { type: string }[] }
type JobRow = { id: string; process_tags: string[]; required_certs: string[] }
type Suggestion = { id: string; shop_id: string; gap?: { requirement?: string | null }; cert_unlock?: string | null; capacity_unlock?: Record<string, number> | null }
type ShopDetail = { offers?: { job_id: string }[]; readiness?: { requirement?: string | null }[]; certifications?: { type: string }[]; training?: { cert_unlock?: string | null }[] }

const synthetic = (shopsFx as { shops: ShopRow[] }).shops
const publicShops = (shopsPublicFx as { shops: ShopRow[] }).shops
const jobs = (jobsFx as { jobs: JobRow[] }).jobs
const suggestions = [...(gapsFx as { suggestions: Suggestion[] }).suggestions, ...(gapsAfterFx as { suggestions: Suggestion[] }).suggestions]
const shopDetails = [shop012Fx, shop012AfterFx] as unknown as ShopDetail[]

const uniq = (xs: Iterable<string | null | undefined>): string[] => [...new Set([...xs].filter((x): x is string => typeof x === "string" && x !== ""))]

/** Synthetic shop ids (the routable ones: offers, grow, awards). */
export function syntheticShopIds(): string[] {
  return uniq(synthetic.map((s) => s.id))
}

/** Every shop id in the demo data: synthetic + public (Network and search link to both). */
export function allShopIds(): string[] {
  return uniq([...synthetic, ...publicShops].map((s) => s.id))
}

/**
 * (shop, job) pairs that can carry an offer, before or after funding, including re-offers
 * ("Find another shop" can pick any synthetic shop): every synthetic shop x every job.
 * PAGES_OFFER_PAIRS=fixtures narrows it to the pairs the fixtures name (assignments before
 * and after funding, shop offers, syn-012's search results) if the full grid is too big.
 */
export function offerPairs(): { id: string; jobId: string }[] {
  const jobIds = uniq(jobs.map((j) => j.id))
  if (process.env.PAGES_OFFER_PAIRS === "fixtures") {
    const out = new Map<string, { id: string; jobId: string }>()
    const add = (id: string, jobId: string) => out.set(`${id}\u0000${jobId}`, { id, jobId })
    for (const a of [...(assignmentsFx as { assignments: { shop_id: string; job_id: string }[] }).assignments, ...(assignmentsAfterFx as { assignments: { shop_id: string; job_id: string }[] }).assignments]) {
      add(a.shop_id, a.job_id)
    }
    for (const d of shopDetails) for (const o of d.offers ?? []) add("syn-012", o.job_id)
    const sj = searchJobs012Fx as { eligible?: { job_id?: string }[]; near_miss?: { job_id?: string }[] }
    for (const j of [...(sj.eligible ?? []), ...(sj.near_miss ?? [])]) if (j.job_id) add("syn-012", j.job_id)
    // The demo shop can be re-offered any declined job.
    for (const jobId of jobIds) add("syn-012", jobId)
    return [...out.values()]
  }
  return syntheticShopIds().flatMap((id) => jobIds.map((jobId) => ({ id, jobId })))
}

/**
 * Every requirement key a Grow link can carry: cert types (jobs, shop cert lists, readiness
 * rules, fixture readiness and training), process tags (process and capacity gaps) and gap
 * requirements. Returned decoded ("NADCAP:HEAT_TREAT"): Next writes the folder with the raw
 * ':' and a static host decodes the browser's "NADCAP%3AHEAT_TREAT" to find it.
 */
export function requirementKeys(): string[] {
  const rules = readinessRules as { requirements: Record<string, unknown> }
  return uniq([
    ...Object.keys(rules.requirements).filter((k) => k !== "NADCAP"),
    ...jobs.flatMap((j) => [...j.required_certs, ...j.process_tags]),
    ...[...synthetic, ...publicShops].flatMap((s) => [...(s.cert_summary ?? []).map((c) => c.type), ...(s.processes ?? [])]),
    ...shopDetails.flatMap((d) => [
      ...(d.readiness ?? []).map((r) => r.requirement),
      ...(d.certifications ?? []).map((c) => c.type),
      ...(d.training ?? []).map((t) => t.cert_unlock),
    ]),
    ...suggestions.flatMap((s) => [s.gap?.requirement, s.cert_unlock, ...Object.keys(s.capacity_unlock ?? {})]),
  ])
}

/**
 * Grow item pages: every synthetic shop x every requirement key. App links carry dots as "~"
 * (see requirementSlug); the dotted form is kept too so a typed or shared old URL still loads.
 */
export function growParams(): { id: string; req: string }[] {
  const reqs = uniq(requirementKeys().flatMap((k) => [requirementSlug(k), k]))
  return syntheticShopIds().flatMap((id) => reqs.map((req) => ({ id, req })))
}

/** Training package ids (TP-01, TP-02, ...) from the gaps fixtures, before and after funding. */
export function trainingPackageIds(): string[] {
  return uniq(suggestions.map((s) => s.id))
}
