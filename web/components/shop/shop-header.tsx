import Link from "next/link"
import { ArrowLeft, Building2, Mail, MapPin, Users } from "lucide-react"
import { ShopLabelBadge, SmeBadge } from "./badges"
import type { ShopT } from "./types"

export function ShopHeader({ shop }: { shop: ShopT }) {
  return (
    <header className="space-y-3">
      <Link
        href="/network"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Network
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">{shop.name}</h1>
        <ShopLabelBadge source={shop.source} label={shop.label} />
        <SmeBadge isSme={shop.is_sme} />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-zinc-600">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="size-4 text-zinc-400" aria-hidden />
          {shop.city}, ON
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Building2 className="size-4 text-zinc-400" aria-hidden />
          NAICS {shop.naics}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-4 text-zinc-400" aria-hidden />
          {shop.employee_band} employees
        </span>
        {shop.contact_role_email && (
          <span className="inline-flex items-center gap-1.5">
            <Mail className="size-4 text-zinc-400" aria-hidden />
            {shop.contact_role_email}
          </span>
        )}
      </div>
      <p className="max-w-3xl text-base text-zinc-600">
        What a small shop sees: defence work offered to it, what would unlock more, and training its prime
        is funding.
      </p>
    </header>
  )
}
