"use client"

import { Fragment } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LoaderCircle, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { BUSY, useDemo } from "@/lib/data/store"
import { Button } from "@/components/ui/button"
import { BrandMark } from "./brand-mark"
import { ModeSwitcher } from "./mode-switcher"

type NavItem = { label: string; href: string | null; match: (p: string) => boolean; group: "Prime" | "Shop" }

export function AppHeader() {
  const pathname = usePathname() ?? "/"
  const { demoShopId, reset, busy, ready } = useDemo()

  const items: NavItem[] = [
    { group: "Prime", label: "Program", href: "/program", match: (p) => p === "/program" || p.startsWith("/program/") },
    { group: "Prime", label: "ITB Scorecard", href: "/scorecard", match: (p) => p.startsWith("/scorecard") },
    { group: "Prime", label: "Gaps & Training", href: "/gaps", match: (p) => p.startsWith("/gaps") },
    { group: "Prime", label: "Network", href: "/network", match: (p) => p.startsWith("/network") },
    {
      group: "Shop",
      label: "Shop view",
      href: demoShopId ? `/shops/${demoShopId}` : null,
      match: (p) => p.startsWith("/shops/"),
    },
  ]

  const resetting = busy === BUSY.reset

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:h-16 sm:flex-nowrap sm:px-6 sm:py-0">
        <Link href="/" className="shrink-0 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring" aria-label="Muster home">
          <BrandMark />
        </Link>

        {/* Phones: the nav gets its own full-width, scrollable row under the brand row. */}
        <nav
          className="order-last flex w-full min-w-0 items-center gap-1 overflow-x-auto sm:order-none sm:w-auto sm:flex-1"
          aria-label="Main"
        >
          {items.map((it, i) => {
            const active = it.match(pathname)
            const groupStart = i === 0 || items[i - 1].group !== it.group
            const groupLabel = groupStart ? (
              <span
                key={`g-${it.group}`}
                className={cn(
                  "shrink-0 pr-1 text-xs font-semibold tracking-[0.08em] text-muted-foreground/80 uppercase select-none",
                  i > 0 && "ml-2 border-l border-border pl-3"
                )}
                aria-hidden
              >
                {it.group}
              </span>
            ) : null
            const cls = cn(
              "relative inline-flex h-9 shrink-0 items-center rounded-md px-2.5 text-[0.95rem] font-medium whitespace-nowrap transition-colors",
              active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )
            if (!it.href) {
              return (
                <Fragment key={it.label}>
                  {groupLabel}
                  <span className={cn(cls, "cursor-not-allowed opacity-50 hover:bg-transparent")} aria-disabled="true" title="Available once the demo shop is known">
                    {it.label}
                  </span>
                </Fragment>
              )
            }
            return (
              <Fragment key={it.label}>
                {groupLabel}
                <Link href={it.href} className={cls} aria-current={active ? "page" : undefined}>
                  {it.label}
                </Link>
              </Fragment>
            )
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
          <ModeSwitcher />
          <Button
            variant="outline"
            size="lg"
            onClick={() => void reset()}
            disabled={!ready || !!busy}
            className="px-3"
            aria-label="Reset demo"
          >
            {resetting ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
            <span className="hidden sm:inline">Reset demo</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
