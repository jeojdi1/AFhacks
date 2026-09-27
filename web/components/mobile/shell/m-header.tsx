"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft, WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { shopInfo } from "@/lib/app/actions-store"
import { useConnection } from "@/lib/app/connection"
import { t } from "@/lib/app/strings"
import { CERT_LABEL } from "@/lib/format"
import { BrandMark } from "@/components/shell/brand-mark"
import { parentHref, parseMRoute, type MRoute } from "./route"

function titleFor(r: MRoute): string {
  switch (r.kind) {
    case "home":
      return t("title.home")
    case "prime":
      return t("title.prime")
    case "trainee":
      return t("title.trainee")
    case "tenders":
      return t("title.tenders")
    case "shop":
      switch (r.section) {
        case "today":
          return t("title.today")
        case "offers":
          return t("title.offers")
        case "offer":
          return t("title.offer", { id: r.param ?? "" })
        case "certs":
          return t("title.certs")
        case "grow":
          return t("title.grow")
        case "growItem":
          return t("title.growItem", { cert: CERT_LABEL[r.param ?? ""] ?? r.param ?? "" })
        default:
          return t("title.today")
      }
    default:
      return t("title.home")
  }
}

/**
 * "Live" / "Demo data" badge: colour dot + text (never colour alone). It shows whether
 * the phone is actually connected, so it never says "Live" above an "Offline" banner:
 * live mode with the phone offline reads "Offline", with the engine down "Not connected".
 */
export function ModeBadge({ className }: { className?: string }) {
  const { mode, ready } = useDemo()
  const { disconnected, reason } = useConnection()
  const cut = ready && disconnected && (mode === "live" || reason === "device")
  const text = !ready
    ? t("header.mode.detecting")
    : cut
      ? reason === "device"
        ? t("header.mode.offline")
        : t("header.mode.notConnected")
      : mode === "live"
        ? t("header.mode.live")
        : t("header.mode.fixtures")
  const title = cut
    ? reason === "device"
      ? t("header.mode.offlineTitle")
      : t("header.mode.notConnectedTitle")
    : mode === "live"
      ? "Talking to the Muster engine"
      : "Checked-in demo data; works offline"
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium whitespace-nowrap",
        cut ? "border-blocked/30 bg-blocked-soft text-blocked" : "border-border bg-background text-foreground",
        className
      )}
      title={title}
      role="status"
      aria-live="polite"
    >
      {cut ? (
        <WifiOff className="size-3.5" aria-hidden />
      ) : (
        <span
          aria-hidden
          className={cn("size-2 rounded-full", !ready ? "animate-pulse bg-slate-400" : mode === "live" ? "bg-assigned" : "bg-amber-500")}
        />
      )}
      {text}
    </span>
  )
}

/** Synthetic / public label chip for a shop. */
export function ShopLabelChip({ source, className }: { source: "synthetic" | "public" | null | undefined; className?: string }) {
  if (!source) return null
  const synthetic = source === "synthetic"
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        synthetic ? "border-synthetic/25 bg-synthetic-soft text-synthetic" : "border-public/25 bg-public-soft text-public",
        className
      )}
    >
      {synthetic ? t("label.synthetic") : t("label.public")}
    </span>
  )
}

/** Compact phone header: back arrow, title, shop name + label chip, mode badge. Sticky. */
export function MHeader() {
  const pathname = usePathname()
  const { assignments } = useDemo()
  const r = parseMRoute(pathname)
  const back = parentHref(pathname)
  const shop = r.kind === "shop" ? shopInfo(r.shopId) : null
  const shopName =
    r.kind === "shop" ? (shop?.name ?? assignments.find((a) => a.shop_id === r.shopId)?.shop_name ?? r.shopId) : null
  const source = r.kind === "shop" ? (shop?.source ?? assignments.find((a) => a.shop_id === r.shopId)?.shop_source ?? null) : null

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-backdrop-filter:bg-background/85">
      <div className="flex min-h-14 items-center gap-1 px-2">
        {back ? (
          <Link
            href={back}
            aria-label={t("header.back")}
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
        ) : (
          <Link
            href="/m"
            aria-label="Muster home"
            className="inline-flex h-12 shrink-0 items-center rounded-lg px-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <BrandMark />
          </Link>
        )}
        <div className="min-w-0 flex-1 py-1.5">
          {r.kind !== "home" ? <h1 className="truncate text-[17px] leading-tight font-semibold">{titleFor(r)}</h1> : <h1 className="sr-only">{t("title.home")}</h1>}
          {shopName ? (
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm text-muted-foreground">{shopName}</span>
              {source === "synthetic" ? <ShopLabelChip source="synthetic" className="py-0 text-[11px]" /> : null}
            </div>
          ) : null}
        </div>
        <ModeBadge className="mr-1" />
      </div>
      {source === "public" ? (
        <p className="border-t border-border bg-public-soft px-4 py-1 text-xs font-medium text-public">{t("label.public")}</p>
      ) : null}
    </header>
  )
}
