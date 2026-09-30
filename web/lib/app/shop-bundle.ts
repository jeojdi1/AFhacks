"use client"

// useShopBundle(shopId): everything a /m shop screen needs, composed from
// useDemo() (jobs, assignments, getShop) and useAppActions() (this shop's
// decisions, requests, capacity and declared expiries).
//
// Certificates: live mode uses GET /shops/{id} as-is. Fixture mode only has
// dates for the demo shop, so dates for every synthetic shop are merged from
// data/processed/shops_synthetic.json (bundled at build time, like fixtures).
// A shop-declared expiry always overrides the date and reads "shop-declared".

import * as React from "react"
import { useDemo } from "@/lib/data/store"
import type { Assignment, Certification, Job, Offer, ShopDetailResponse } from "@/lib/api/types"
import syntheticShops from "../../../data/processed/shops_synthetic.json"
import { onAppRefresh, shopInfo, useShopActions } from "./actions-store"
import type { CertDeclaration, CertWithDates, DateBasis, ShopBundle } from "./types"

export { shopInfo }

// ---------------------------------------------------------------------------
// Certificate dates

interface SyntheticFile {
  shops: { id: string; certifications?: Certification[] }[]
}

let certIndex: Map<string, Map<string, Certification>> | null = null
function syntheticCerts(shopId: string): Map<string, Certification> | null {
  if (!certIndex) {
    certIndex = new Map()
    for (const s of (syntheticShops as unknown as SyntheticFile).shops ?? []) {
      certIndex.set(s.id, new Map((s.certifications ?? []).map((c) => [c.type, c])))
    }
  }
  return certIndex.get(shopId) ?? null
}

function basisFor(c: Certification, shopSource: string | null): DateBasis {
  if (c.status === "verified" && c.source_url) return "registry"
  if (shopSource === "synthetic" || c.shop_id.startsWith("syn-")) return "illustrative"
  return c.source_url ? "registry" : "illustrative"
}

/**
 * Certifications with dates. Fills missing dates from shops_synthetic.json
 * (fixture mode), then applies the shop's own declarations.
 */
export function withCertDates(
  certs: Certification[],
  shopId: string,
  declared: Record<string, CertDeclaration> = {},
  shopSource: string | null = null
): CertWithDates[] {
  const extra = syntheticCerts(shopId)
  const out: CertWithDates[] = certs.map((c) => {
    const src = extra?.get(c.type)
    const dated: Certification =
      c.expires_at || !src
        ? c
        : {
            ...c,
            expires_at: src.expires_at,
            verified_at: c.verified_at ?? src.verified_at,
            source_url: c.source_url ?? src.source_url,
            note: src.note ?? c.note,
          }
    // A lapsed certificate in shops_synthetic.json (status "expired", v0.6) reads lapsed even when
    // the demo-data snapshot predates it ("unknown"): neither counts, so no matching changes.
    const merged: Certification = c.status === "unknown" && src?.status === "expired" ? { ...dated, status: "expired" } : dated
    return { ...merged, date_basis: basisFor(merged, shopSource), declaration: null }
  })
  for (const [type, dec] of Object.entries(declared)) {
    const i = out.findIndex((c) => c.type === type)
    const row: CertWithDates = {
      ...(i >= 0
        ? out[i]
        : { shop_id: shopId, type: dec.type, status: "unknown" as const, source_url: null, verified_at: null, note: null }),
      expires_at: dec.expires_at,
      date_basis: "shop-declared",
      declaration: dec,
    } as CertWithDates
    if (i >= 0) out[i] = row
    else out.push(row)
  }
  return out
}

/**
 * Certifications for any seeded shop without a network call (fixture data:
 * shops_synthetic.json dates, else the shops.json cert_summary). Used by the
 * prime's supplier-status list in fixture mode.
 */
export function certsForShop(shopId: string, declared: Record<string, CertDeclaration> = {}): CertWithDates[] {
  const extra = syntheticCerts(shopId)
  const info = shopInfo(shopId)
  const base: Certification[] = extra
    ? [...extra.values()].map((c) => ({ ...c }))
    : (info?.cert_summary ?? []).map((c) => ({
        shop_id: shopId,
        type: c.type,
        status: c.status,
        source_url: null,
        verified_at: null,
        expires_at: null,
        note: info?.source === "synthetic" ? "Synthetic shop: status is illustrative" : "Public data — unverified",
      }))
  return withCertDates(base, shopId, declared, info?.source ?? null)
}

// ---------------------------------------------------------------------------
// Hook

export function useShopBundle(shopId: string): ShopBundle {
  const demo = useDemo()
  const { ready, mode, stage, fundedIds, getShop, jobs, assignments } = demo
  const actions = useShopActions(shopId)
  const [detail, setDetail] = React.useState<ShopDetailResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null)
  const reqRef = React.useRef(0)
  const getShopRef = React.useRef(getShop)
  React.useEffect(() => {
    getShopRef.current = getShop
  }, [getShop])

  const load = React.useCallback(async () => {
    const id = ++reqRef.current
    setLoading(true)
    try {
      const d = await getShopRef.current(shopId)
      if (id !== reqRef.current) return
      setDetail(d)
      setError(null)
      setUpdatedAt(new Date().toISOString())
    } catch (e) {
      if (id !== reqRef.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (id === reqRef.current) setLoading(false)
    }
  }, [shopId])

  // Reload when the demo step, mode or funded packages change.
  const fundedKey = fundedIds.join(",")
  React.useEffect(() => {
    if (!ready) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [ready, mode, stage, fundedKey, load])

  // Live: the engine changes offer status after a decision; re-read on new shop events.
  const lastSeq = actions.events.length ? actions.events[actions.events.length - 1].seq : 0
  React.useEffect(() => {
    if (!ready || mode !== "live" || lastSeq === 0) return
    const id = window.setTimeout(() => void load(), 250)
    return () => window.clearTimeout(id)
  }, [ready, mode, lastSeq, load])

  // Refresh button in the /m header.
  React.useEffect(() => onAppRefresh(() => void load()), [load])

  const jobsById = React.useMemo(() => {
    const m: Record<string, Job> = {}
    for (const j of jobs) m[j.id] = j
    return m
  }, [jobs])

  const assignmentsById = React.useMemo(() => {
    const m: Record<string, Assignment> = {}
    for (const a of assignments) m[a.job_id] = a
    return m
  }, [assignments])

  const mine = React.useMemo(() => assignments.filter((a) => a.shop_id === shopId), [assignments, shopId])

  const offers = React.useMemo<Offer[]>(() => {
    if (!detail) return []
    // Latest offer event per job: an undo (or a question) means "offered" again,
    // even though the desktop overlay (useDemo().offerStatus) cannot be cleared.
    const lastKind: Record<string, string> = {}
    for (const e of actions.events) if (e.job_id && e.kind.startsWith("offer_") && e.kind !== "offer_reply") lastKind[e.job_id] = e.kind
    return detail.offers.map((o) => {
      const d = actions.decisions[o.job_id]
      let status = o.status
      if (d) status = d.decision === "accepted" || d.decision === "declined" ? d.decision : "offered"
      else if (lastKind[o.job_id] === "offer_undo") status = "offered"
      return status === o.status ? o : { ...o, status }
    })
  }, [detail, actions.decisions, actions.events])

  const certs = React.useMemo(
    () => (detail ? withCertDates(detail.certifications, shopId, actions.declaredCerts, detail.shop.source) : []),
    [detail, shopId, actions.declaredCerts]
  )

  return {
    detail,
    shop: detail?.shop ?? null,
    offers,
    jobsById,
    assignmentsById,
    assignments: mine,
    certs,
    actions,
    loading: loading || !ready,
    error,
    updatedAt,
    refresh: load,
  }
}
