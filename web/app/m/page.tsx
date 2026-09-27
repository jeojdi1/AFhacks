"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Building2, ChevronRight, Factory, GraduationCap, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtMoney } from "@/lib/format"
import { useDemo } from "@/lib/data/store"
import { t } from "@/lib/app/strings"
import { UnreachableNotice } from "@/components/mobile/shell/unreachable-notice"
import { useConnection } from "@/lib/app/connection"
import { ShopLabelChip } from "@/components/mobile/shell/m-header"

const ROLE_KEY = "muster.app.v1.role"

type RoleId = "shop" | "prime" | "trainee"

const ROLES: { id: RoleId; href: string; title: string; body: string; Icon: typeof Factory }[] = [
  { id: "shop", href: "/m/shops/syn-012", title: "role.shop.title", body: "role.shop.body", Icon: Factory },
  { id: "prime", href: "/m/prime", title: "role.prime.title", body: "role.prime.body", Icon: Building2 },
  { id: "trainee", href: "/m/trainee/TP-01?seat=3", title: "role.trainee.title", body: "role.trainee.body", Icon: GraduationCap },
]

function readRole(): RoleId | null {
  try {
    const v = window.localStorage.getItem(ROLE_KEY)
    return v === "shop" || v === "prime" || v === "trainee" ? v : null
  } catch {
    return null
  }
}

function writeRole(r: RoleId) {
  try {
    window.localStorage.setItem(ROLE_KEY, r)
  } catch {
    /* storage unavailable: nothing remembered */
  }
}

/** /m: pick shop, prime or trainee. The choice is remembered; launching from the Home Screen reopens it. */
export default function RolePickerPage() {
  const router = useRouter()
  const { assignments, stage, ready, demoShopId } = useDemo()
  const { unreachable } = useConnection()
  const [last, setLast] = React.useState<RoleId | null>(null)

  React.useEffect(() => {
    const r = readRole()
    queueMicrotask(() => setLast(r))
    // Installed app launch (start_url /m?src=pwa): go straight to the remembered view.
    try {
      if (r && new URLSearchParams(window.location.search).get("src") === "pwa") {
        const href = ROLES.find((x) => x.id === r)?.href
        if (href) router.replace(href)
      }
    } catch {
      /* no URL access */
    }
  }, [router])

  const routed = stage === "routed" || stage === "funded"
  const featured = ROLES.find((r) => r.id === "shop")?.href.split("/").pop() ?? "syn-012"

  const otherShops = React.useMemo(() => {
    const m = new Map<string, { id: string; name: string; source: "synthetic" | "public"; count: number; value: number }>()
    for (const a of assignments) {
      if (a.shop_id === featured) continue
      const row = m.get(a.shop_id) ?? { id: a.shop_id, name: a.shop_name, source: a.shop_source, count: 0, value: 0 }
      row.count += 1
      row.value += a.value_cad
      m.set(a.shop_id, row)
    }
    return [...m.values()].sort((x, y) => y.value - x.value)
  }, [assignments, featured])

  return (
    <div className="flex flex-col gap-6 pt-2">
      <section aria-labelledby="roles-title" className="flex flex-col gap-3">
        <div>
          <h2 id="roles-title" className="text-xl font-semibold tracking-tight">
            {t("role.title")}
          </h2>
          <p className="mt-1 text-base text-muted-foreground">{t("role.subtitle")}</p>
        </div>
        <ul className="flex flex-col gap-3">
          {ROLES.map(({ id, href, title, body, Icon }) => (
            <li key={id}>
              <Link
                href={href}
                onClick={() => writeRole(id)}
                className={cn(
                  "flex min-h-24 items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-xs outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted",
                  last === id ? "border-brand/40 ring-1 ring-brand/20" : "border-border"
                )}
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-base leading-snug font-semibold">{t(title)}</span>
                    {last === id ? (
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">{t("role.lastUsed")}</span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-sm leading-snug text-muted-foreground">{t(body)}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="other-shops-title" className="flex flex-col gap-3">
        <h2 id="other-shops-title" className="text-lg font-semibold tracking-tight">
          {t("role.otherShops")}
        </h2>
        {!ready ? (
          <div className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" aria-hidden />
        ) : !routed && unreachable ? (
          <UnreachableNotice />
        ) : !routed || otherShops.length === 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted p-4">
            <Inbox className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-base font-medium">{t("empty.notRouted")}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("role.otherShops.empty")}</p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {otherShops.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/m/shops/${encodeURIComponent(s.id)}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium">{s.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{t("role.otherShops.row", { count: s.count, value: fmtMoney(s.value, { compact: true }) })}</span>
                      <ShopLabelChip source={s.source} />
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {demoShopId && demoShopId !== featured && routed ? (
          <p className="text-sm text-muted-foreground">Demo shop in live mode: {demoShopId}</p>
        ) : null}
      </section>
    </div>
  )
}
