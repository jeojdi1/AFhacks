"use client"

import Link from "next/link"
import { ArrowLeft, Building2, Mail, MapPin, Users } from "lucide-react"
import { StatusBadge } from "@/components/muster/status-badge"
import { Term } from "@/components/muster/term"
import { c } from "@/lib/ui/copy"
import { ce } from "@/lib/ui/copy-e"
import { useStoryMode } from "@/lib/ui/story-mode"
import { useWithParams } from "@/lib/ui/use-with-params"
import { ShopLabelBadge, SmeBadge } from "./badges"
import type { ShopT } from "./types"

/**
 * Shop page H1 (docs/ux-simplification.md §5.5): the name plus a "Synthetic demo shop" chip.
 * Story mode hides the industry code and the fixture role email.
 */
export function ShopHeader({ shop }: { shop: ShopT }) {
  const { story } = useStoryMode()
  const wp = useWithParams()
  const synthetic = shop.source !== "public"
  return (
    <header className="space-y-2.5">
      <Link
        href={wp("/network")}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        {ce("shop.back")}
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight break-words text-foreground sm:text-3xl">{shop.name}</h1>
        {synthetic ? (
          <StatusBadge kind="synthetic" label={c("shop.chip.synthetic")} title={c("plain.SYNTHETIC.tip")} />
        ) : (
          <ShopLabelBadge source={shop.source} label={shop.label} />
        )}
        <SmeBadge isSme={shop.is_sme} />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-4 text-slate-400" aria-hidden />
          {shop.city}, ON
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-4 text-slate-400" aria-hidden />
          {ce("shop.employees", { band: shop.employee_band })}
        </span>
        {!story && shop.naics && (
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-4 text-slate-400" aria-hidden />
            <Term k="NAICS">{c("shop.naics")}</Term> {shop.naics}
          </span>
        )}
        {!story && shop.contact_role_email && (
          <span className="inline-flex min-w-0 items-center gap-1.5 break-all">
            <Mail className="size-4 shrink-0 text-slate-400" aria-hidden />
            {shop.contact_role_email}
          </span>
        )}
      </div>
    </header>
  )
}
