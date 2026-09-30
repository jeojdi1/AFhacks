"use client"

// A shop's work preferences (docs/api.md §9): the smallest work it looks at (CAD a year)
// and whether it prefers ongoing work. Display only: never used for routing.
//
// Live mode: POST /shops/{shop_id}/preferences {min_annual_value_cad?, prefers_ongoing?,
// idempotency_key}. The route is looked up once per engine URL in /openapi.json; an older
// engine without it, or fixture mode, records the preferences on this device only
// (localStorage `muster.app.v1.prefs`, synced across tabs). Either way the saved value is
// kept here as an override, so every page shows it at once without re-reading the shop.
// A demo reset (the program goes back to "empty") drops the overrides, like the engine.

import * as React from "react"
import type { Shop } from "@/lib/api/types"
import { AppApiError, appFetch, newIdempotencyKey } from "./api"
import { MIN_ANNUAL_MAX, prefsFromShop, type ShopPrefs } from "./sizing"
import { t } from "./strings"

export const PREFS_KEY = "muster.app.v1.prefs"
const CHANGE_EVENT = "muster:prefs-change"

export interface PrefOverride {
  shop_id: string
  min_annual_value_cad: number | null
  prefers_ongoing: boolean | null
  at: string
  /** "engine": the engine stored it too; "local": recorded on this device (demo). */
  via: "engine" | "local"
}

export interface PrefsInput {
  min_annual_value_cad?: number | null
  prefers_ongoing?: boolean | null
}

type Store = Record<string, PrefOverride>
const EMPTY: Store = {}
let memory: Store = EMPTY
let cachedRaw: string | null | undefined
let cached: Store = EMPTY

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(PREFS_KEY)
  } catch {
    return null
  }
}

function snapshot(): Store {
  const raw = readRaw()
  if (raw === null) return memory
  if (raw !== cachedRaw) {
    cachedRaw = raw
    try {
      const v = JSON.parse(raw) as unknown
      cached = v && typeof v === "object" && !Array.isArray(v) ? (v as Store) : EMPTY
    } catch {
      cached = EMPTY
    }
  }
  return cached
}

function write(next: Store) {
  memory = next
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {
    /* storage blocked: kept in memory for this page */
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    /* no window */
  }
}

function subscribe(fn: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === PREFS_KEY) fn()
  }
  window.addEventListener(CHANGE_EVENT, fn)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, fn)
    window.removeEventListener("storage", onStorage)
  }
}

/** Preferences saved on this device (key: shop id). */
export function usePreferenceOverrides(): Store {
  return React.useSyncExternalStore(subscribe, snapshot, () => EMPTY)
}

/** Forget every saved preference (the demo was reset). */
export function clearPreferenceOverrides(): void {
  if (Object.keys(snapshot()).length) write({})
}

/** Effective preferences for one shop: saved here > the shop object > the seed data. */
export function prefsFor(shop: Partial<Shop> | null | undefined, shopId: string, overrides: Store): ShopPrefs {
  const o = overrides[shopId]
  if (o) return { min_annual_value_cad: o.min_annual_value_cad, prefers_ongoing: o.prefers_ongoing, basis: "shop-declared" }
  return prefsFromShop(shop, shopId)
}

/** useShopPrefs(shop, id): effective preferences, updating when the shop saves new ones. */
export function useShopPrefs(shop: Partial<Shop> | null | undefined, shopId: string): ShopPrefs {
  const overrides = usePreferenceOverrides()
  return React.useMemo(() => prefsFor(shop, shopId, overrides), [shop, shopId, overrides])
}

/** A readable problem with the input, or null. */
export function validatePrefs(input: PrefsInput): string | null {
  const m = input.min_annual_value_cad
  if (m !== undefined && m !== null && (typeof m !== "number" || !Number.isFinite(m) || m < 0 || m > MIN_ANNUAL_MAX)) {
    return t("error.minAnnual")
  }
  return null
}

const PREFS_ROUTE = "/shops/{shop_id}/preferences"
const routeProbe = new Map<string, Promise<boolean>>()

function hasPrefsRoute(apiUrl: string): Promise<boolean> {
  let p = routeProbe.get(apiUrl)
  if (!p) {
    p = appFetch<{ paths?: Record<string, unknown> }>(apiUrl, "/openapi.json", { timeoutMs: 5000 })
      .then((doc) => !!doc?.paths && Object.prototype.hasOwnProperty.call(doc.paths, PREFS_ROUTE))
      .catch(() => false)
    routeProbe.set(apiUrl, p)
  }
  return p
}

/**
 * Save a shop's preferences. apiUrl is null in fixture mode. `current` fills a field the
 * input leaves out. Throws a readable Error for bad input or a real engine error.
 */
export async function savePreferences(apiUrl: string | null, shopId: string, input: PrefsInput, current: ShopPrefs): Promise<PrefOverride> {
  const bad = validatePrefs(input)
  if (bad) throw new Error(bad)
  const min = input.min_annual_value_cad === undefined ? current.min_annual_value_cad : input.min_annual_value_cad || null
  const ongoing = input.prefers_ongoing === undefined ? current.prefers_ongoing : input.prefers_ongoing
  let via: PrefOverride["via"] = "local"
  if (apiUrl && (await hasPrefsRoute(apiUrl))) {
    try {
      await appFetch<unknown>(apiUrl, `/shops/${encodeURIComponent(shopId)}/preferences`, {
        json: { min_annual_value_cad: min, prefers_ongoing: ongoing, idempotency_key: newIdempotencyKey() },
        timeoutMs: 8000,
      })
      via = "engine"
    } catch (e) {
      if (!(e instanceof AppApiError && e.routeMissing)) throw e
    }
  }
  const rec: PrefOverride = { shop_id: shopId, min_annual_value_cad: min, prefers_ongoing: ongoing, at: new Date().toISOString(), via }
  write({ ...snapshot(), [shopId]: rec })
  return rec
}
