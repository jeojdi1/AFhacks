"use client"

import type * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, Factory, LoaderCircle, Network, RotateCcw, Search, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { BUSY, useDemo } from "@/lib/data/store"
import { c } from "@/lib/ui/copy"
import { isDirectoryPath } from "@/lib/ui/steps"
import { useStoryMode } from "@/lib/ui/story-mode"
import { useWithParams } from "@/lib/ui/use-with-params"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useSession } from "@/lib/auth/session"
import { AccountMenu } from "@/components/auth/account-menu"
import { ActivityBell } from "./activity-bell"
import { BrandMark } from "./brand-mark"
import { ModeSwitcher } from "./mode-switcher"

/**
 * Row 1 of the desktop chrome (docs/ux-simplification.md §3.1): logo + tagline on the left;
 * Story mode, Shops directory, portal links, Phone app, activity bell, data-source pill,
 * Start over and the account menu on the right. The 5 story steps live in the story bar below.
 */
export function AppHeader() {
  const pathname = usePathname() ?? "/"
  const { reset, busy, ready } = useDemo()
  const wp = useWithParams()
  const resetting = busy === BUSY.reset
  // A signed-in shop never sees Northgate's supplier search (prime-only).
  const shopRole = useSession().session?.role === "shop"

  const links: { key: string; label: string; href: string; icon: React.ComponentType<{ className?: string }>; active: boolean; always?: boolean; hide?: boolean }[] = [
    { key: "directory", label: c("nav.directory"), href: "/network", icon: BookOpen, active: isDirectoryPath(pathname), always: true },
    { key: "suppliers", label: c("nav.findSuppliers"), href: "/prime/suppliers", icon: Search, active: pathname.startsWith("/prime/suppliers"), hide: shopRole },
    { key: "work", label: c("nav.findWork"), href: "/shop/work", icon: Factory, active: pathname.startsWith("/shop/work") },
    { key: "graph", label: c("nav.graph"), href: "/graph", icon: Network, active: pathname.startsWith("/graph") },
  ]

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-2 px-4 sm:h-16 sm:gap-2.5 sm:px-6">
        <Link
          href={wp("/")}
          className="flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring"
          aria-label={c("nav.home")}
        >
          {/* Phones: the mark alone, so the directory and phone links stay visible at 390 px. */}
          <BrandMark className="shrink-0 max-sm:[&>span:last-child]:hidden" />
          <span className="hidden min-w-0 truncate border-l border-border pl-2.5 text-[13px] leading-tight font-medium text-muted-foreground xl:inline">
            {c("app.tagline")}
          </span>
        </Link>

        <nav className="ml-auto flex shrink-0 items-center gap-0.5" aria-label="Main">
          <span className="hidden sm:contents">
            <StorySwitch />
          </span>
          {links.filter((l) => !l.hide).map((l) => {
            const Icon = l.icon
            return (
              <Link
                key={l.key}
                href={wp(l.href)}
                aria-current={l.active ? "page" : undefined}
                title={l.label}
                aria-label={l.label}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[0.9rem] font-medium whitespace-nowrap transition-colors",
                  l.active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  !l.always && "hidden lg:inline-flex"
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {/* The header is capped at 1280 px, so only the directory label ever fits; the rest stay
                    icon-only at every width (label in the tooltip and aria-label). */}
                {l.always ? <span className="hidden xl:inline">{l.label}</span> : null}
              </Link>
            )
          })}
          <Link
            href="/m"
            aria-label={c("nav.phone")}
            title={c("nav.phone")}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[0.9rem] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Smartphone className="size-4 shrink-0" aria-hidden />
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <ActivityBell />
          <ModeSwitcher />
          <Button
            variant="outline"
            size="lg"
            onClick={() => void reset()}
            disabled={!ready || !!busy}
            className="px-2.5"
            aria-label={c("nav.startOver.aria")}
            title={c("nav.startOver.aria")}
            data-testid="start-over"
          >
            {resetting ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
            <span className="hidden sm:inline">{resetting ? c("busy.reset") : c("nav.startOver")}</span>
          </Button>
          <span className="hidden sm:contents">
            <AccountMenu />
          </span>
        </div>
      </div>
    </header>
  )
}

/** "Story mode" switch (§6). Keyboard: S. */
function StorySwitch() {
  const { story, setStory } = useStoryMode()
  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" />}
        role="switch"
        aria-checked={story}
        aria-label={c("nav.story")}
        aria-keyshortcuts="S"
        onClick={() => setStory(!story)}
        data-testid="story-switch"
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[0.9rem] font-medium whitespace-nowrap text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
      >
        <span
          aria-hidden
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors motion-reduce:transition-none",
            story ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-slate-200"
          )}
        >
          <span
            className={cn(
              "absolute size-4 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none",
              story ? "translate-x-[17px]" : "translate-x-[1px]"
            )}
          />
        </span>
        <span className="hidden lg:inline">{c("nav.story")}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {c("nav.story.tip")} <span className="opacity-70">(S)</span>
      </TooltipContent>
    </Tooltip>
  )
}
