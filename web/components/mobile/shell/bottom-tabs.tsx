"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { House, Inbox, ShieldCheck, Sprout } from "lucide-react"
import { cn } from "@/lib/utils"
import { useShopBundle } from "@/lib/app/shop-bundle"
import { openOffers } from "@/lib/app/attention"
import { t } from "@/lib/app/strings"
import { TAB_SECTIONS, parseMRoute, shopHref } from "./route"

const TABS = [
  { section: "today", label: "tabs.today", Icon: House },
  { section: "offers", label: "tabs.offers", Icon: Inbox },
  { section: "certs", label: "tabs.certs", Icon: ShieldCheck },
  { section: "grow", label: "tabs.grow", Icon: Sprout },
] as const

/**
 * Offers for this shop that still need a reply (status offered, no decision or only a question).
 * Reads the shop bundle (the engine in live mode), not useDemo().assignments: in live mode a phone
 * tab's demo store does not hear about a route or fund taken on the laptop until it reloads, while
 * the bundle re-reads the shop on every new event. Same rule as the Today card (attention.openOffers).
 */
export function useOffersNeedingReply(shopId: string): number {
  const { offers } = useShopBundle(shopId)
  return React.useMemo(() => openOffers({ offers }).length, [offers])
}

/**
 * Sticky bottom tab bar for shop routes: Today · Offers · Certs · Grow.
 * Hidden on prime/trainee routes and on detail screens (an offer, a grow item).
 */
export function BottomTabs() {
  const pathname = usePathname()
  const r = parseMRoute(pathname)
  if (r.kind !== "shop" || !TAB_SECTIONS.includes(r.section)) return null
  return <ShopTabBar shopId={r.shopId} section={r.section} />
}

function ShopTabBar({ shopId, section: current }: { shopId: string; section: string }) {
  const count = useOffersNeedingReply(shopId)
  return (
    <nav
      aria-label={t("tabs.label")}
      className="sticky bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/90"
    >
      <ul className="grid grid-cols-4">
        {TABS.map(({ section, label, Icon }) => {
          const active = current === section
          const showBadge = section === "offers" && count > 0
          return (
            <li key={section}>
              <Link
                href={shopHref(shopId, section)}
                aria-current={active ? "page" : undefined}
                aria-label={showBadge ? `${t(label)}, ${t("tabs.offersBadge", { count })}` : undefined}
                className={cn(
                  "relative flex min-h-16 flex-col items-center justify-center gap-1 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  active ? "text-brand" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {active ? <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-brand" /> : null}
                <span className="relative">
                  <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  {showBadge ? (
                    <span
                      aria-hidden
                      className="absolute -top-1.5 -right-2.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[11px] leading-none font-semibold text-white"
                    >
                      {count}
                    </span>
                  ) : null}
                </span>
                {t(label)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
