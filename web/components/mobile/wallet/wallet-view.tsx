"use client"

import * as React from "react"
import { CircleAlert, CircleCheck, CircleDashed, Clock, FileCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ShopLabelChip } from "@/components/mobile/shell/m-header"
import { useDemo } from "@/lib/data/store"
import { useShopBundle } from "@/lib/app/shop-bundle"
import { appToday } from "@/lib/app/today"
import { t } from "@/lib/app/strings"
import { needsAttention, renewalFor, sortRenewals } from "@/lib/app/renewals"
import { certIsLapsed } from "@/lib/format"
import type { Assignment, CertWithDates, Renewal } from "@/lib/app/types"
import { CertRow, certAnchor, certRowHeld } from "./cert-row"
import { PaperworkSection } from "./paperwork-section"
import "./wallet-strings"

interface Row {
  cert: CertWithDates
  renewal: Renewal
  held: boolean
}

function hashTarget(): string | null {
  try {
    const h = window.location.hash.slice(1)
    return h ? decodeURIComponent(h) : null
  } catch {
    return null
  }
}

/** /m/shops/[id]/certs: the compliance wallet (T4). */
export function WalletView({ shopId }: { shopId: string }) {
  const { stage } = useDemo()
  const bundle = useShopBundle(shopId)
  const { certs, offers, assignmentsById, jobsById, shop, loading, error, refresh, actions, detail } = bundle
  const routed = stage === "routed" || stage === "funded"
  const [today] = React.useState(() => appToday())
  const [openSet, setOpenSet] = React.useState<Set<string>>(() => new Set())
  const pendingScroll = React.useRef<string | null>(null)

  // Program assignments with this shop's phone decisions applied (declined work is not at risk).
  const assignments = React.useMemo<Assignment[]>(() => {
    const status: Record<string, Assignment["status"]> = {}
    for (const o of offers) status[o.job_id] = o.status
    return Object.values(assignmentsById).map((a) =>
      a.shop_id === shopId && status[a.job_id] && status[a.job_id] !== a.status ? { ...a, status: status[a.job_id] } : a
    )
  }, [assignmentsById, offers, shopId])

  const rows = React.useMemo<Row[]>(() => {
    const ctx = { today, shopId, jobsById, assignments }
    const byType = new Map(certs.map((c) => [c.type as string, c]))
    return sortRenewals(certs.map((c) => renewalFor(c, ctx))).map((r) => {
      const cert = byType.get(r.cert_type) as CertWithDates
      return { cert, renewal: r, held: certRowHeld(cert) }
    })
  }, [certs, today, shopId, jobsById, assignments])

  const heldRows = rows.filter((r) => r.held)
  // pending_training counts for matching but is not held yet: welders are still in training (Q7).
  const trainingCount = heldRows.filter((r) => r.cert.status === "pending_training").length
  const inPlaceCount = heldRows.length - trainingCount
  // Lapsed (status "expired"): not held, but listed on their own, first, with renewal steps.
  const lapsedRows = rows.filter((r) => !r.held && certIsLapsed(r.cert.status))
  const notHeld = rows.filter((r) => !r.held && !certIsLapsed(r.cert.status))
  const attention = heldRows.filter((r) => needsAttention(r.renewal)).length + lapsedRows.length

  // Open (and scroll to) the row named in the URL hash, e.g. #CGP from a Today card.
  React.useEffect(() => {
    const apply = () => {
      const h = hashTarget()
      if (!h) return
      const match = certs.find((c) => c.type === h || certAnchor(c.type) === h)
      if (!match) return
      pendingScroll.current = certAnchor(match.type)
      setOpenSet((cur) => (cur.has(match.type) ? cur : new Set(cur).add(match.type)))
    }
    apply()
    window.addEventListener("hashchange", apply)
    return () => window.removeEventListener("hashchange", apply)
  }, [certs])

  React.useEffect(() => {
    const id = pendingScroll.current
    if (!id) return
    pendingScroll.current = null
    const el = document.getElementById(id)
    if (!el) return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" })
  }, [openSet])

  const toggle = React.useCallback((type: string, open: boolean) => {
    setOpenSet((cur) => {
      const next = new Set(cur)
      if (open) next.add(type)
      else next.delete(type)
      return next
    })
  }, [])

  const declare = actions.declareCertExpiry
  // Not-held certificates with a Grow (readiness) item: getting them opens more jobs (C3-11).
  const unlockTypes = React.useMemo(
    () => new Set((detail?.readiness ?? []).filter((r) => r.kind === "cert").map((r) => r.requirement)),
    [detail]
  )

  if (error && !certs.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted px-6 py-10 text-center">
        <CircleAlert className="size-6 text-destructive" aria-hidden />
        <p className="text-lg font-semibold">{t("wallet.loadError")}</p>
        <p className="text-[15px] text-muted-foreground">{error}</p>
        <Button size="touch" onClick={() => void refresh()}>
          {t("wallet.retry")}
        </Button>
      </div>
    )
  }

  if (loading && !certs.length) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label={t("empty.loading")}>
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-5 w-full" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl leading-tight font-semibold">{shop?.name ?? shopId}</h1>
          <ShopLabelChip source={shop?.source} />
        </div>
        <p className="text-[15px] text-muted-foreground">{t("wallet.intro")}</p>
        <ul className="flex flex-wrap gap-2 text-sm font-medium" aria-label="Summary">
          <li
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3",
              attention ? "border-orange-300 bg-orange-50 text-orange-800" : "border-assigned/30 bg-assigned-soft text-assigned"
            )}
          >
            {attention ? <CircleAlert className="size-4" aria-hidden /> : <CircleCheck className="size-4" aria-hidden />}
            {attention ? t("wallet.summary.attention", { count: attention }) : t("wallet.summary.clear")}
          </li>
          <li className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-foreground">
            <FileCheck className="size-4" aria-hidden />
            {t("wallet.summary.held", { count: inPlaceCount })}
          </li>
          {trainingCount ? (
            <li className="inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 text-amber-800" data-testid="wallet-in-training">
              <Clock className="size-4" aria-hidden />
              {t("wallet.summary.training", { count: trainingCount })}
            </li>
          ) : null}
          {lapsedRows.length ? (
            <li className="inline-flex h-8 items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3 text-red-800" data-testid="wallet-lapsed">
              <CircleAlert className="size-4" aria-hidden />
              {t("wallet.summary.lapsed", { count: lapsedRows.length })}
            </li>
          ) : null}
          {notHeld.length ? (
            <li className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-3 text-slate-600">
              <CircleDashed className="size-4" aria-hidden />
              {t("wallet.summary.notHeld", { count: notHeld.length })}
            </li>
          ) : null}
        </ul>
        {!routed ? <p className="text-sm text-muted-foreground">{t("wallet.notRouted")}</p> : null}
      </header>

      {lapsedRows.length ? (
        <section aria-labelledby="wallet-lapsed" className="flex flex-col gap-2">
          <h2 id="wallet-lapsed" className="text-base font-semibold text-red-800">
            {t("wallet.lapsedSection")}
          </h2>
          <ul className="flex flex-col gap-3">
            {lapsedRows.map(({ cert, renewal }) => (
              <CertRow
                key={cert.type}
                unlocks={unlockTypes.has(cert.type)}
                cert={cert}
                renewal={renewal}
                today={today}
                open={openSet.has(cert.type)}
                onToggle={(o) => toggle(cert.type, o)}
                routed={routed}
                declare={declare}
                shopId={shopId}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {heldRows.length ? (
        <ul className="flex flex-col gap-3">
          {heldRows.map(({ cert, renewal }) => (
            <CertRow
              key={cert.type}
              cert={cert}
              renewal={renewal}
              today={today}
              open={openSet.has(cert.type)}
              onToggle={(o) => toggle(cert.type, o)}
              routed={routed}
              declare={declare}
              shopId={shopId}
            />
          ))}
        </ul>
      ) : null}

      {notHeld.length ? (
        <section aria-labelledby="wallet-not-held" className="flex flex-col gap-2">
          <h2 id="wallet-not-held" className="pt-2 text-base font-semibold text-muted-foreground">
            {t("wallet.notHeldSection")}
          </h2>
          <ul className="flex flex-col gap-2">
            {notHeld.map(({ cert, renewal }) => (
              <CertRow
                key={cert.type}
                unlocks={unlockTypes.has(cert.type)}
                cert={cert}
                renewal={renewal}
                today={today}
                open={openSet.has(cert.type)}
                onToggle={(o) => toggle(cert.type, o)}
                routed={routed}
                declare={declare}
                shopId={shopId}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <PaperworkSection shopId={shopId} />
    </div>
  )
}
