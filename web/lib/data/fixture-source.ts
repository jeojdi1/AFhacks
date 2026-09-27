// Fixture lookup for the store. Resolves "<METHOD> <path>" through
// data/fixtures/index.json (endpoints + after_fund maps), so the store does not
// depend on the export shape of web/lib/api/fixtures.ts.
import index from "@fixtures/index.json"
import health from "@fixtures/health.json"
import demoReset from "@fixtures/demo_reset.json"
import program from "@fixtures/program.json"
import programAfterFund from "@fixtures/program_after_fund.json"
import partsUpload from "@fixtures/parts_upload.json"
import route from "@fixtures/route.json"
import assignments from "@fixtures/assignments.json"
import assignmentsAfterFund from "@fixtures/assignments_after_fund.json"
import ledger from "@fixtures/ledger.json"
import ledgerAfterFund from "@fixtures/ledger_after_fund.json"
import gaps from "@fixtures/gaps.json"
import gapsAfterFund from "@fixtures/gaps_after_fund.json"
import fundTP01 from "@fixtures/fund_TP-01.json"
import fundTP02 from "@fixtures/fund_TP-02.json"
import shops from "@fixtures/shops.json"
import shopDemo from "@fixtures/shop_syn-012.json"
import shopDemoAfterFund from "@fixtures/shop_syn-012_after_fund.json"
// Discovered public shops (scripts/build_public_fixtures.py): listed, never routed.
import shopsPublic from "@fixtures/shops_public.json"
import shopPub001 from "@fixtures/shop_pub-001.json"
import type { ShopDetailResponse, ShopsResponse } from "@/lib/api/types"

type Method = "GET" | "POST"

const FILES: Record<string, unknown> = {
  "index.json": index,
  "health.json": health,
  "demo_reset.json": demoReset,
  "program.json": program,
  "program_after_fund.json": programAfterFund,
  "parts_upload.json": partsUpload,
  "route.json": route,
  "assignments.json": assignments,
  "assignments_after_fund.json": assignmentsAfterFund,
  "ledger.json": ledger,
  "ledger_after_fund.json": ledgerAfterFund,
  "gaps.json": gaps,
  "gaps_after_fund.json": gapsAfterFund,
  "fund_TP-01.json": fundTP01,
  "fund_TP-02.json": fundTP02,
  "shops.json": shops,
  "shop_syn-012.json": shopDemo,
  "shop_syn-012_after_fund.json": shopDemoAfterFund,
  "shops_public.json": shopsPublic,
  "shop_pub-001.json": shopPub001,
}

interface FixtureManifest {
  demo_shop_id?: string
  demo_package_id?: string
  endpoints?: Record<string, string>
  after_fund?: Record<string, string>
}

const manifest = index as FixtureManifest

/** Deep copy so callers can never mutate the shared fixture objects. */
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/**
 * Fixture for an endpoint, or null when there is none. With afterFund, the
 * `after_fund` variant is preferred and the routed variant is the fallback.
 */
export function fx<T>(method: Method, path: string, afterFund = false): T | null {
  const [bare, query] = path.split("?")
  if (method === "GET" && bare === "/shops") return shopsWithPublic(query) as T | null
  if (method === "GET" && bare.startsWith("/shops/") && isPublicShopId(bare.slice(7)))
    return fxPublicShopDetail(decodeURIComponent(bare.slice(7))) as T | null
  const key = `${method} ${bare}`
  const file =
    (afterFund ? manifest.after_fund?.[key] : undefined) ??
    manifest.endpoints?.[key] ??
    (FILES[path] !== undefined ? path : undefined)
  if (!file) return null
  const v = FILES[file]
  return v === undefined ? null : clone(v as T)
}

/** demo_shop_id / demo_package_id from data/fixtures/index.json. */
export function demoIds(): { demoShopId: string; demoPackageId: string } {
  return {
    demoShopId: manifest.demo_shop_id ?? "syn-012",
    demoPackageId: manifest.demo_package_id ?? "TP-01",
  }
}

// ---------------------------------------------------------------------------
// Discovered public shops: real companies from public data (StatCan ODBus, OGL, and
// each company's own website). Labelled "Public data — unverified — not affiliated",
// onboarding "discovered". Listed on the Network page and viewable, never routed
// (the demo manifest, index.json, never maps them). Mirrors engine/public.py.

export const PUBLIC_NOTICE =
  "Discovered from public data (Statistics Canada ODBus, OGL, and the company's own website). " +
  "Unverified, not affiliated, not onboarded: this shop is not offered work until it claims " +
  "and verifies its profile."

/** Public-shop extras beyond the docs/api.md Shop (all additive). */
export interface PublicShopExtras {
  onboarding?: "onboarded" | "discovered"
  notes?: string | null
}

/** Public cert_summary items also carry where the claim was read. */
export interface PublicCertSummary {
  type: string
  status: string
  source_url?: string | null
  verified_at?: string | null
  expires_at?: string | null
  note?: string | null
}

export type PublicShopDetail = ShopDetailResponse & { notice?: string }

export function isPublicShopId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("pub-")
}

/** A listed shop is "discovered" (public, not onboarded, never routed). */
export function isDiscovered(shop: { source?: string; onboarding?: string | null } | null | undefined): boolean {
  if (!shop) return false
  return shop.onboarding === "discovered" || (shop.onboarding == null && shop.source === "public")
}

/**
 * GET /shops in fixture mode: the synthetic demo network (shops.json, unchanged) with the
 * discovered public shops appended after it, as the engine serves it. `source` filters.
 */
function shopsWithPublic(query?: string): ShopsResponse | null {
  const source = new URLSearchParams(query ?? "").get("source")
  const synthetic = (FILES["shops.json"] as ShopsResponse | undefined)?.shops ?? []
  const pub = (shopsPublic as unknown as ShopsResponse).shops ?? []
  const shops =
    source === "public" ? pub : source === "synthetic" ? synthetic : [...synthetic, ...pub]
  return clone({ shops } as ShopsResponse)
}

/**
 * ShopDetail for a discovered public shop, rebuilt from its GET /shops entry (which
 * carries everything, cert source URLs included): certifications, provenance and notes,
 * and no offers / readiness / training. Equal to the engine's GET /shops/pub-XXX
 * (checked by engine/tests/test_public.py).
 */
export function publicShopDetailFrom(shop: ShopsResponse["shops"][number]): PublicShopDetail {
  const certs = ((shop.cert_summary ?? []) as unknown as PublicCertSummary[]).map((c) => ({
    shop_id: shop.id,
    type: c.type,
    status: c.status,
    source_url: c.source_url ?? null,
    verified_at: c.verified_at ?? null,
    expires_at: c.expires_at ?? null,
    note: c.note ?? null,
  }))
  return clone({
    shop,
    certifications: certs,
    offers: [],
    readiness: [],
    training: [],
    notice: PUBLIC_NOTICE,
  } as unknown as PublicShopDetail)
}

/** Fixture GET /shops/pub-XXX: the example file for pub-001, rebuilt from the list otherwise. */
function fxPublicShopDetail(id: string): PublicShopDetail | null {
  if (id === (shopPub001 as unknown as PublicShopDetail).shop.id) return clone(shopPub001 as unknown as PublicShopDetail)
  const entry = (shopsPublic as unknown as ShopsResponse).shops.find((s) => s.id === id)
  return entry ? publicShopDetailFrom(entry) : null
}
