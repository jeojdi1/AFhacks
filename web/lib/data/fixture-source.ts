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
  const key = `${method} ${path.split("?")[0]}`
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
