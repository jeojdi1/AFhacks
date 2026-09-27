"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ClipboardList, GraduationCap, House, Inbox, ListChecks, Repeat, ShieldCheck, Sprout, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"
import { useShopBundle } from "@/lib/app/shop-bundle"
import { openOffers } from "@/lib/app/attention"
import { t } from "@/lib/app/strings"
import { TAB_SECTIONS, parseMRoute, shopHref, traineeSeatHref } from "./route"
import { useFromPrime } from "./use-from-prime"

const noopSubscribe = () => () => {}
const readSearch = () => (typeof window === "undefined" ? "" : window.location.search)
const serverSearch = () => ""

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

type RoleTab = { id: string; href: string; label: string; Icon: typeof House }

const SWITCH: RoleTab = { id: "switch", href: "/m", label: "tabs.switchRole", Icon: Repeat }

/** Tabs for the non-shop roles. The first tab is that role's home. */
const ROLE_TABS: Record<"prime" | "college" | "trainee", RoleTab[]> = {
  prime: [
    { id: "prime", href: "/m/prime", label: "tabs.prime.todo", Icon: ListChecks },
    { id: "college", href: "/m/college", label: "tabs.prime.training", Icon: GraduationCap },
    SWITCH,
  ],
  college: [
    { id: "college", href: "/m/college", label: "tabs.college.plans", Icon: ClipboardList },
    { id: "trainee", href: "/m/trainee/TP-01?seat=3", label: "tabs.college.seat", Icon: UserRound },
    SWITCH,
  ],
  trainee: [{ id: "trainee", href: "/m/trainee/TP-01?seat=3", label: "tabs.trainee.seat", Icon: GraduationCap }, SWITCH],
}

/**
 * Sticky bottom tab bar, per role:
 *   shop routes     Today · Offers · Certs · Grow (hidden on detail screens: an offer, a grow item)
 *   defence company To do · Training · Switch role
 *   training partner Plans · Seat 3 · Switch role
 *   trainee         My seat · Switch role
 * A shop screen opened from the prime's feed (?from=prime) keeps the prime's tabs.
 * The role picker (/m) has none.
 */
export function BottomTabs() {
  const pathname = usePathname()
  const r = parseMRoute(pathname)
  const fromPrime = useFromPrime()
  // The defence company looking at a supplier's screen from its feed keeps its own tabs.
  if (r.kind === "shop" && fromPrime) return <RoleTabBar tabs={ROLE_TABS.prime} current="" />
  if (r.kind === "shop") return TAB_SECTIONS.includes(r.section) ? <ShopTabBar shopId={r.shopId} section={r.section} /> : null
  if (r.kind === "trainee") return <TraineeTabBar packageId={r.packageId} />
  if (r.kind === "prime" || r.kind === "college") {
    // The prime's and college's own tabs point at the other screens they use; the
    // current screen's tab is the one with the same id as the route kind.
    return <RoleTabBar tabs={ROLE_TABS[r.kind]} current={r.kind} />
  }
  return null
}

/** The trainee's tabs: "My seat" keeps the seat and plan in the URL (never jumps to another seat). */
function TraineeTabBar({ packageId }: { packageId: string | null }) {
  usePathname() // re-read the query on every client navigation
  const search = React.useSyncExternalStore(noopSubscribe, readSearch, serverSearch)
  const tabs = React.useMemo<RoleTab[]>(() => {
    const seat = new URLSearchParams(search).get("seat")
    return ROLE_TABS.trainee.map((tab) => (tab.id === "trainee" ? { ...tab, href: traineeSeatHref(packageId, seat) } : tab))
  }, [packageId, search])
  return <RoleTabBar tabs={tabs} current="trainee" />
}

function RoleTabBar({ tabs, current }: { tabs: RoleTab[]; current: string }) {
  return (
    <nav
      aria-label={t("tabs.roleLabel")}
      className="sticky bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/90"
    >
      <ul className={cn("grid", tabs.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {tabs.map(({ id, href, label, Icon }) => {
          const active = id === current
          return (
            <li key={id}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-16 flex-col items-center justify-center gap-1 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  active ? "text-brand" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {active ? <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-brand" /> : null}
                <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {t(label)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
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
                      className="absolute -top-2 -right-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[13px] leading-none font-semibold text-white"
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
