"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Check, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtMoney, fmtPct } from "@/lib/format"
import { useDemo } from "@/lib/data/store"
import { fx } from "@/lib/data/fixture-source"
import type { ShopsResponse } from "@/lib/api/types"

/** Best-effort shop name/source for the "Viewing as" line, from state already in memory. */
function useViewedShop(shopId: string | null) {
  const { assignments, gaps } = useDemo()
  if (!shopId) return null
  const a = assignments.find((x) => x.shop_id === shopId)
  const p = gaps?.suggestions.find((x) => x.shop_id === shopId)
  const f = fx<ShopsResponse>("GET", "/shops")?.shops.find((x) => x.id === shopId)
  const name = f?.name ?? p?.shop_name ?? a?.shop_name
  if (!name) return null
  const source = f?.source ?? p?.shop_source ?? null
  return { name, synthetic: source === "synthetic" }
}

type Step = { key: string; label: string; href: string | null; done: boolean; match: (p: string) => boolean }

export function ProgramContextBar() {
  const pathname = usePathname() ?? "/"
  const { program, stage, demoShopId, offerStatus, busy, ready } = useDemo()
  const onShop = pathname.startsWith("/shops/")
  const viewedShop = useViewedShop(onShop ? decodeURIComponent(pathname.split("/")[2] ?? "") : null)

  const prime = program?.prime_name ?? "Northgate Land Systems"
  const primeLabel = program?.prime_label ?? "Fictional prime"
  const contract = program?.contract_value_cad ?? 500_000_000
  const obligation = program?.obligation_cad ?? 500_000_000
  const smb = program?.smb_target_pct ?? 0.15
  const obligationPct = contract > 0 ? obligation / contract : 1

  const atLeast = (s: typeof stage) => {
    const order = ["empty", "uploaded", "routed", "funded"] as const
    return order.indexOf(stage) >= order.indexOf(s)
  }
  // "Scorecard" is complete once the viewer has looked at it after routing.
  const [seenScorecard, setSeenScorecard] = useState(false)
  if (!seenScorecard && atLeast("routed") && pathname.startsWith("/scorecard")) setSeenScorecard(true)
  if (seenScorecard && !atLeast("routed")) setSeenScorecard(false)

  const accepted = Object.entries(offerStatus).some(([k, v]) => v === "accepted" && (!demoShopId || k.startsWith(`${demoShopId}:`)))

  const steps: Step[] = [
    { key: "upload", label: "Upload", href: "/program", done: atLeast("uploaded"), match: (p) => p.startsWith("/program") && !atLeast("uploaded") },
    { key: "route", label: "Route", href: "/program", done: atLeast("routed"), match: (p) => p.startsWith("/program") && atLeast("uploaded") },
    { key: "scorecard", label: "Scorecard", href: "/scorecard", done: atLeast("routed") && (seenScorecard || atLeast("funded")), match: (p) => p.startsWith("/scorecard") },
    { key: "fund", label: "Fund training", href: "/gaps", done: atLeast("funded"), match: (p) => p.startsWith("/gaps") },
    { key: "shop", label: "Shop view", href: demoShopId ? `/shops/${demoShopId}` : null, done: atLeast("funded") && accepted, match: (p) => p.startsWith("/shops/") },
  ]
  const currentIdx = steps.findIndex((s) => !s.done)

  return (
    <div className="border-b border-border bg-muted">
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-2.5">
        {onShop ? (
          <p className="min-w-0 text-sm text-muted-foreground">
            <span className="mr-2 rounded border border-slate-800 bg-background px-1.5 py-px text-xs font-semibold tracking-wide text-slate-800 uppercase">
              Shop side
            </span>
            Viewing as{" "}
            <span className="font-semibold text-foreground">{viewedShop?.name ?? "a supplier shop"}</span>
            {viewedShop?.synthetic ? (
              <span className="ml-1.5 rounded border border-slate-300 bg-background px-1.5 py-px text-xs font-medium text-slate-600">
                Synthetic shop
              </span>
            ) : null}
            <Sep />
            Offers from <span className="font-medium text-foreground">{prime}</span>
          </p>
        ) : (
        <p className="min-w-0 text-sm text-muted-foreground">
          <span className="mr-2 rounded bg-slate-800 px-1.5 py-px text-xs font-semibold tracking-wide text-white uppercase">
            Prime side
          </span>
          <span className="font-semibold text-foreground">{prime}</span>
          <Sep />
          <span className="rounded border border-slate-300 bg-background px-1.5 py-px text-xs font-medium text-slate-600">{primeLabel}</span>
          <Sep />
          Contract <span className="font-medium text-foreground tabular-nums">{fmtMoney(contract, { compact: true })}</span>
          <Sep />
          ITB obligation{" "}
          <span className="font-medium text-foreground tabular-nums">
            {fmtMoney(obligation, { compact: true })} ({fmtPct(obligationPct, 0)})
          </span>
          <Sep />
          SMB target <span className="font-medium text-foreground tabular-nums">{fmtPct(smb, 0)}</span>
        </p>
        )}

        <div className="flex items-center gap-3">
          {busy && ready ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground" role="status" aria-live="polite">
              <LoaderCircle className="size-4 animate-spin text-brand" aria-hidden />
              {busy}
            </span>
          ) : null}
          <ol className="flex items-center gap-1" aria-label="Demo path">
            {steps.map((s, i) => {
              const here = s.match(pathname)
              const isCurrent = i === currentIdx
              const inner = (
                <span
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                    s.done
                      ? "border-assigned/30 bg-assigned-soft text-assigned"
                      : isCurrent
                        ? "border-brand/40 bg-background text-brand"
                        : "border-border bg-background text-muted-foreground",
                    here && "ring-2 ring-foreground/15 ring-offset-1 ring-offset-muted"
                  )}
                >
                  {s.done ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : (
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
                        isCurrent ? "bg-brand text-white" : "bg-slate-200 text-slate-600"
                      )}
                    >
                      {i + 1}
                    </span>
                  )}
                  {s.label}
                </span>
              )
              return (
                <li key={s.key} className="flex items-center gap-1">
                  {i > 0 ? <span className={cn("h-px w-3", steps[i - 1].done ? "bg-assigned/50" : "bg-border")} aria-hidden /> : null}
                  {s.href ? (
                    <Link href={s.href} aria-current={here ? "step" : undefined} className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}

function Sep() {
  return <span className="mx-2 text-slate-300" aria-hidden>·</span>
}
