"use client"

// Supplier status (T6 §2.6, section 3): every shop with an assignment, its
// certifications run through renewalFor(), and the ones in stage urgent,
// window_open or lapsed listed with the credit at risk.
//   Live: GET /shops/{id} per assigned shop (about 22 calls), cached per
//         engine URL until Refresh, a new routing step, or a mode change.
//   Fixtures: dates from shops_synthetic.json via certsForShop(id).
// Shop-declared expiries (useAppActions().declaredCerts) override dates in both.

import * as React from "react"
import Link from "next/link"
import { ChevronRight, CircleAlert, OctagonAlert, ShieldCheck, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import type { Assignment, Job, ShopDetailResponse } from "@/lib/api/types"
import { appFetch } from "@/lib/app/api"
import { onAppRefresh, useAppActions } from "@/lib/app/actions-store"
import { certsForShop, withCertDates } from "@/lib/app/shop-bundle"
import { appToday } from "@/lib/app/today"
import { t } from "@/lib/app/strings"
import { TAG_HIT, type FeedItem, type SupplierRenewal } from "@/lib/app/feed"
import type { CertWithDates, RenewalStage } from "@/lib/app/types"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { NoBreakIds } from "./activity-item"
import { renewalFor } from "@/lib/app/renewals"

type ShopRef = { id: string; name: string; source: "synthetic" | "public" | null }

/** Live-mode cache: `${apiUrl}|${shopId}` → detail (module scope survives page changes). */
const liveCache = new Map<string, ShopDetailResponse>()

/**
 * Renewals for every assigned shop. `assignments` and `jobsById` come from the
 * page (live-refreshed there), so this hook only fetches certifications.
 */
export function useSupplierRenewals(
  assignments: Assignment[],
  jobsById: Record<string, Job>
): { renewals: SupplierRenewal[]; loading: boolean } {
  const { mode, apiUrl, ready, stage } = useDemo()
  const { declaredCerts } = useAppActions()
  const [liveDetails, setLiveDetails] = React.useState<Record<string, ShopDetailResponse | null>>({})
  const [loading, setLoading] = React.useState(false)
  const [tick, setTick] = React.useState(0)

  const shops = React.useMemo<ShopRef[]>(() => {
    const m = new Map<string, ShopRef>()
    for (const a of assignments) if (!m.has(a.shop_id)) m.set(a.shop_id, { id: a.shop_id, name: a.shop_name, source: a.shop_source ?? null })
    return [...m.values()]
  }, [assignments])
  const shopKey = shops.map((s) => s.id).join(",")

  // Refresh button: drop the cache and re-read.
  React.useEffect(
    () =>
      onAppRefresh(() => {
        liveCache.clear()
        setTick((n) => n + 1)
      }),
    []
  )

  React.useEffect(() => {
    if (!ready || mode !== "live" || !shopKey) return
    let cancelled = false
    const ids = shopKey.split(",")
    const run = async () => {
      setLoading(true)
      const out: Record<string, ShopDetailResponse | null> = {}
      // A few at a time so a phone on the LAN is not flooded.
      const queue = [...ids]
      const worker = async () => {
        while (queue.length && !cancelled) {
          const id = queue.shift()!
          const key = `${apiUrl}|${id}`
          const hit = liveCache.get(key)
          if (hit) {
            out[id] = hit
            continue
          }
          try {
            const d = await appFetch<ShopDetailResponse>(apiUrl, `/shops/${encodeURIComponent(id)}`, { timeoutMs: 8000 })
            liveCache.set(key, d)
            out[id] = d
          } catch {
            out[id] = null // falls back to bundled dates below
          }
        }
      }
      await Promise.all([worker(), worker(), worker(), worker()])
      if (!cancelled) {
        setLiveDetails(out)
        setLoading(false)
      }
    }
    void Promise.resolve().then(() => {
      if (!cancelled) void run()
    })
    return () => {
      cancelled = true
    }
  }, [ready, mode, apiUrl, shopKey, stage, tick])

  const renewals = React.useMemo<SupplierRenewal[]>(() => {
    if (!shops.length) return []
    const today = appToday()
    const out: SupplierRenewal[] = []
    for (const s of shops) {
      const declared = declaredCerts[s.id] ?? {}
      const live = mode === "live" ? liveDetails[s.id] : null
      const certs: CertWithDates[] = live
        ? withCertDates(live.certifications, s.id, declared, live.shop.source)
        : certsForShop(s.id, declared)
      for (const c of certs) {
        if (c.status === "unknown" && !c.declaration) continue
        out.push({
          shop_id: s.id,
          shop_name: s.name,
          shop_source: s.source,
          renewal: renewalFor(c, { today, shopId: s.id, jobsById, assignments }),
        })
      }
    }
    return out
  }, [shops, declaredCerts, mode, liveDetails, jobsById, assignments])

  return { renewals, loading: loading && mode === "live" }
}

// ---------------------------------------------------------------------------
// UI

const STAGE_STYLE: Record<RenewalStage, { cls: string; Icon: typeof TriangleAlert }> = {
  lapsed: { cls: "border-destructive/30 bg-destructive/10 text-destructive", Icon: OctagonAlert },
  urgent: { cls: "border-destructive/30 bg-destructive/10 text-destructive", Icon: TriangleAlert },
  window_open: { cls: "border-blocked/30 bg-blocked-soft text-blocked", Icon: CircleAlert },
  ok: { cls: "border-assigned/25 bg-assigned-soft text-assigned", Icon: ShieldCheck },
  unknown: { cls: "border-border bg-muted text-muted-foreground", Icon: CircleAlert },
}

/** Stage chip: colour, icon and text together (WCAG 1.4.1). */
export function StageChip({ stage, className }: { stage: RenewalStage; className?: string }) {
  const s = STAGE_STYLE[stage]
  return (
    <span className={cn("inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-sm font-semibold", s.cls, className)}>
      <s.Icon className="size-3.5" aria-hidden />
      {t(`stage.${stage}`)}
    </span>
  )
}

function basisLabel(b: string | undefined): string | null {
  if (b === "illustrative") return t("label.illustrative")
  if (b === "shop-declared") return t("label.shopDeclared")
  return null
}

export function SupplierStatus({
  items,
  routed,
  loading,
}: {
  items: FeedItem[]
  routed: boolean
  loading: boolean
}) {
  return (
    <section id="supplier-status" aria-labelledby="supplier-title" className="flex scroll-mt-20 flex-col gap-3">
      <div>
        <h2 id="supplier-title" className="text-lg font-semibold tracking-tight">
          {t("prime.supplier.title")}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("prime.supplier.subtitle")}</p>
      </div>
      {!routed ? (
        <p className="rounded-xl border border-dashed border-border bg-muted p-4 text-base text-muted-foreground">{t("prime.supplier.notRouted")}</p>
      ) : loading && !items.length ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          <span className="sr-only">{t("prime.supplier.loading")}</span>
          <div className="h-20 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" aria-hidden />
        </div>
      ) : !items.length ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-assigned" aria-hidden />
          <div>
            <p className="text-base font-medium">{t("prime.supplier.empty")}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("prime.supplier.emptyBody")}</p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => {
            const basis = basisLabel(it.date_basis)
            return (
              <li key={it.id}>
                <Link
                  href={it.href ?? "#"}
                  data-testid="supplier-row"
                  className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card p-3 pl-4 text-left shadow-xs outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {it.stage ? <StageChip stage={it.stage} /> : null}
                      {basis ? (
                        <span className="inline-flex h-6 items-center rounded-full border border-dashed border-border px-2 text-xs text-muted-foreground">
                          {basis}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1.5 block text-base leading-snug font-semibold">
                      <NoBreakIds text={it.title} />
                    </span>
                    {it.detail ? (
                      <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                        <NoBreakIds text={it.detail} />
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {routed ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {t("prime.supplier.dates")}
          <AssumptionTag className={TAG_HIT} note="Renewal windows before the act-by date (60 days, urgent at 30) are demo choices; act-by rules link their sources in the wallet." />
        </p>
      ) : null}
    </section>
  )
}
