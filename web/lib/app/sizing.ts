// Right-sized work (docs/api.md §9): how big an offer is per year, how long it runs, and
// whether it meets the shop's own minimum. Shops told us they skip anything under about
// $100K a year, so every offer shows its annual value next to the total.
//
// The engine sends annual_value_cad / duration_years / meets_minimum on each offer and
// work_packages on GET /shops/{id}. Fixtures built before §9 do not have them, so every
// value is computed here the same way (value ÷ 8 years, labelled assumption) when absent.
// Shop preferences come from the shop object, else from data/processed/shops_synthetic.json
// (the seed the engine loads), so fixture mode shows them too. Display only.

import type { Offer, PreferencesBasis, Shop } from "@/lib/api/types"
import { fmtMoney } from "@/lib/format"
import syntheticShops from "../../../data/processed/shops_synthetic.json"
import { extendStrings, t } from "./strings"
import type { CounterTerms } from "./types"

/** Fleet lifetime assumed when the program has no duration (engine DEFAULT_PROGRAM_YEARS). */
export const DEFAULT_PROGRAM_YEARS = 8
/** Chips for the "smallest work you look at" picker (CAD a year); null = no minimum. */
export const MIN_ANNUAL_CHIPS = [null, 50_000, 100_000, 250_000, 500_000] as const
export const MIN_ANNUAL_MAX = 100_000_000

extendStrings("en", {
  "size.perYear": "{amount} a year",
  "size.forYears": "for about {years} years",
  "size.forYears_one": "for about 1 year",
  "size.ongoing": "Ongoing work",
  "size.oneOff": "One-time job",
  "size.meets": "Meets your {min} minimum",
  "size.below": "Below your {min} minimum",
  "size.assumption":
    "Annual value = total value ÷ {years} years. Northgate's parts list covers the whole vehicle fleet; the demo assumes it is built over {years} years.",
  "size.package": "{prime} work package: {count} jobs · {annual} a year {forYears}",
  "size.package_one": "{prime} work package: 1 job · {annual} a year {forYears}",
  "size.packageMeets": "Together: meets your {min}-a-year minimum",
  "size.packageBelow": "Together: still below your {min}-a-year minimum",
  "size.packageBundle": "{count} jobs are small on their own; as one package they are worth your time.",
  "size.packageBundle_one": "1 job is small on its own; as one package it is worth your time.",
  "size.min.label": "Smallest work you look at",
  "size.min.none": "No minimum",
  "size.min.value": "{amount} a year",
  "size.ongoing.label": "Prefer ongoing work",
  "size.basis.illustrative": "illustrative (synthetic shop)",
  "size.basis.declared": "set by the shop",
})

export interface ShopPrefs {
  /** CAD a year; null = no minimum. */
  min_annual_value_cad: number | null
  prefers_ongoing: boolean | null
  basis: PreferencesBasis | null
}

export const NO_PREFS: ShopPrefs = { min_annual_value_cad: null, prefers_ongoing: null, basis: null }

interface SeedShop {
  id: string
  min_annual_value_cad?: number | null
  prefers_ongoing?: boolean | null
  preferences_basis?: PreferencesBasis | null
}

let seedIndex: Map<string, ShopPrefs> | null = null

/** The seed preferences for a synthetic shop (shops_synthetic.json), or null. */
export function seedPreferences(shopId: string | null | undefined): ShopPrefs | null {
  if (!shopId) return null
  if (!seedIndex) {
    seedIndex = new Map()
    for (const s of ((syntheticShops as unknown as { shops?: SeedShop[] }).shops ?? [])) {
      if (s.min_annual_value_cad == null && s.prefers_ongoing == null) continue
      seedIndex.set(s.id, {
        min_annual_value_cad: s.min_annual_value_cad ?? null,
        prefers_ongoing: s.prefers_ongoing ?? null,
        basis: s.preferences_basis ?? "illustrative",
      })
    }
  }
  return seedIndex.get(shopId) ?? null
}

/** Preferences on a shop object (engine or fixture), else the seed file, else none. */
export function prefsFromShop(shop: Partial<Shop> | null | undefined, shopId?: string | null): ShopPrefs {
  if (shop && (shop.min_annual_value_cad != null || shop.prefers_ongoing != null || shop.preferences_basis != null)) {
    return {
      min_annual_value_cad: shop.min_annual_value_cad ?? null,
      prefers_ongoing: shop.prefers_ongoing ?? null,
      basis: shop.preferences_basis ?? "illustrative",
    }
  }
  return seedPreferences(shopId ?? shop?.id) ?? NO_PREFS
}

const round2 = (n: number) => Math.round(n * 100) / 100

export interface OfferSize {
  /** CAD a year. */
  annual: number
  years: number
  /** true when years is the 8-year default (label it assumption). */
  assumed: boolean
  ongoing: boolean
  /** null when the shop has no minimum. */
  meets: boolean | null
}

type SizedOffer = Pick<Offer, "value_cad"> & Partial<Pick<Offer, "annual_value_cad" | "duration_years" | "duration_flag" | "ongoing">>

/** Size of one offer; the engine's fields when present, else value ÷ 8 years. */
export function offerSize(offer: SizedOffer, prefs: ShopPrefs = NO_PREFS): OfferSize {
  const years = typeof offer.duration_years === "number" && offer.duration_years > 0 ? offer.duration_years : DEFAULT_PROGRAM_YEARS
  const annual = typeof offer.annual_value_cad === "number" ? offer.annual_value_cad : round2((offer.value_cad || 0) / years)
  const assumed = offer.duration_flag ? offer.duration_flag === "assumption" : typeof offer.duration_years !== "number"
  const min = prefs.min_annual_value_cad
  return { annual, years, assumed, ongoing: offer.ongoing ?? years > 1, meets: min == null ? null : annual >= min }
}

export interface PackageSize {
  prime: string
  jobIds: string[]
  count: number
  declined: number
  total: number
  annual: number
  years: number
  assumed: boolean
  min: number | null
  meets: boolean | null
  /** Offers below the minimum on their own (still on the table). */
  belowIds: string[]
}

/**
 * The shop's offers as one work package (the demo has one program). statusOf gives each
 * offer's current status (local answers included); declined offers are left out.
 */
export function workPackage(offers: Offer[], statusOf: (o: Offer) => string, prefs: ShopPrefs = NO_PREFS): PackageSize | null {
  if (!offers.length) return null
  const live = offers.filter((o) => statusOf(o) !== "declined")
  const sizes = live.map((o) => ({ o, s: offerSize(o, prefs) }))
  const years = sizes[0]?.s.years ?? offerSize(offers[0], prefs).years
  const assumed = sizes[0]?.s.assumed ?? offerSize(offers[0], prefs).assumed
  const total = round2(live.reduce((s, o) => s + (o.value_cad || 0), 0))
  const annual = round2(total / years)
  const min = prefs.min_annual_value_cad
  return {
    prime: (offers[0].prime_name || "Northgate").split(" ")[0],
    jobIds: live.map((o) => o.job_id),
    count: live.length,
    declined: offers.length - live.length,
    total,
    annual,
    years,
    assumed,
    min,
    meets: min == null ? null : annual >= min,
    belowIds: sizes.filter((x) => x.s.meets === false).map((x) => x.o.job_id),
  }
}

// ---------------------------------------------------------------------------
// Copy helpers

const money = (n: number) => fmtMoney(n, { compact: true })

/** "$115K a year" */
export const perYear = (n: number) => t("size.perYear", { amount: money(n) })

/** "for about 8 years" */
export const forYears = (years: number) => t("size.forYears", { years, count: years })

/** "Meets your $100K minimum" / "Below your $100K minimum" / null without a minimum. */
export function minimumText(size: Pick<OfferSize, "meets">, prefs: ShopPrefs): string | null {
  if (size.meets == null || prefs.min_annual_value_cad == null) return null
  return t(size.meets ? "size.meets" : "size.below", { min: money(prefs.min_annual_value_cad) })
}

/** "Northgate work package: 2 jobs · $212K a year for about 8 years" */
export function packageLine(p: PackageSize): string {
  return t("size.package", { prime: p.prime, count: p.count, annual: money(p.annual), forYears: forYears(p.years) })
}

/** "Together: meets your $100K-a-year minimum" / "…still below…" / null. */
export function packageVerdict(p: PackageSize): string | null {
  if (p.meets == null || p.min == null) return null
  return t(p.meets ? "size.packageMeets" : "size.packageBelow", { min: money(p.min) })
}

/** "$4.5K setup charge and a minimum of 500 parts per order" */
export function counterTermsText(c: Partial<CounterTerms> | null | undefined): string {
  const parts: string[] = []
  if (c?.setup_charge_cad != null) parts.push(t("counter.setup", { amount: money(c.setup_charge_cad) }))
  if (c?.min_quantity != null) parts.push(t("counter.minQty", { qty: Math.round(c.min_quantity).toLocaleString("en-US") }))
  return parts.join(t("counter.and"))
}

/** "$100K a year" / "No minimum" */
export function minAnnualLabel(min: number | null | undefined): string {
  return min == null ? t("size.min.none") : t("size.min.value", { amount: money(min) })
}
