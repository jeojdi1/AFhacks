"use client"

import * as React from "react"
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useSession } from "@/lib/auth/session"
import { AccountMenu } from "@/components/auth/account-menu"
import { ActivityBell } from "./activity-bell"
import { BrandMark } from "./brand-mark"
import { ModeSwitcher } from "./mode-switcher"

/**
 * Row 1 of the desktop chrome (docs/ux-simplification.md §3.1): logo on the left; Story mode,
 * Shops directory, Find suppliers (not for a shop), Find work (a signed-in shop only), Supplier
 * map, Phone app, activity bell, data-source pill, Start over and the account menu on the right.
 * The page links carry text labels at xl and wider, and are icons with a tooltip below that.
 * The 5 story steps live in the story bar below.
 */
export function AppHeader() {
  const pathname = usePathname() ?? "/"
  const { busy } = useDemo()
  const wp = useWithParams()
  const role = useSession().session?.role
  // A signed-in shop never sees Northgate's supplier search (prime-only); Find work is the
  // shop's own page, so only a signed-in shop gets it (never signed out or as Northgate).
  const shopRole = role === "shop"
  // Start over wipes the shared engine for every phone: only the defence company
  // (or the signed-out presenter) gets it; a shop, college or trainee never does.
  const canStartOver = !role || role === "prime"
  const resetting = busy === BUSY.reset

  const links: { key: string; label: string; href: string; icon: React.ComponentType<{ className?: string }>; active: boolean; always?: boolean; hide?: boolean }[] = [
    { key: "directory", label: c("nav.directory"), href: "/network", icon: BookOpen, active: isDirectoryPath(pathname), always: true },
    { key: "suppliers", label: c("nav.findSuppliers"), href: "/prime/suppliers", icon: Search, active: pathname.startsWith("/prime/suppliers"), hide: shopRole },
    { key: "work", label: c("nav.findWork"), href: "/shop/work", icon: Factory, active: pathname.startsWith("/shop/work"), hide: !shopRole },
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
          {/* Phones: the mark alone, so the directory and phone links stay visible at 390 px. No
              tagline: the header is capped at 1280 px and at xl the Find suppliers / Supplier map
              labels need the room (the tagline only ever showed truncated next to them). */}
          <BrandMark className="shrink-0 max-sm:[&>span:last-child]:hidden" />
        </Link>

        <nav className="ml-auto flex shrink-0 items-center gap-0.5" aria-label="Main">
          <span className="hidden sm:contents">
            <StorySwitch />
          </span>
          {links.filter((l) => !l.hide).map((l) => {
            const Icon = l.icon
            return (
              <Tooltip key={l.key}>
                <TooltipTrigger
                  render={<Link href={wp(l.href)} />}
                  aria-current={l.active ? "page" : undefined}
                  aria-label={l.label}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[0.9rem] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring",
                    l.active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    !l.always && "hidden lg:inline-flex"
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {/* Labelled at xl and wider (1280 px+); icon-only below, with the label in the tooltip. */}
                  <span className="hidden xl:inline">{l.label}</span>
                </TooltipTrigger>
                {/* The label is on screen at xl: the tooltip only speaks for the icon-only widths. */}
                <TooltipContent side="bottom" className="xl:hidden">
                  {l.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
          <Tooltip>
            <TooltipTrigger
              render={<Link href="/m" />}
              aria-label={c("nav.phone")}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[0.9rem] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
            >
              <Smartphone className="size-4 shrink-0" aria-hidden />
            </TooltipTrigger>
            <TooltipContent side="bottom">{c("nav.phone")}</TooltipContent>
          </Tooltip>
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <ActivityBell />
          <ModeSwitcher />
          {canStartOver || resetting ? <StartOverButton /> : null}
          <span className="hidden sm:contents">
            <AccountMenu />
          </span>
        </div>
      </div>
    </header>
  )
}

/**
 * "Start over": POST /demo/reset clears the shared engine for every screen on the demo,
 * so it asks first. Cancel has focus when the dialog opens; Escape closes it.
 */
function StartOverButton() {
  const { reset, busy, ready } = useDemo()
  const [open, setOpen] = React.useState(false)
  const cancelRef = React.useRef<HTMLButtonElement | null>(null)
  const resetting = busy === BUSY.reset
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="lg"
        onClick={() => setOpen(true)}
        disabled={!ready || !!busy}
        className="px-2.5"
        aria-label={c("nav.startOver.aria")}
        aria-haspopup="dialog"
        title={c("nav.startOver.aria")}
        data-testid="start-over"
      >
        {resetting ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
        <span className="hidden sm:inline">{resetting ? c("busy.reset") : c("nav.startOver")}</span>
      </Button>
      <DialogContent initialFocus={cancelRef} showCloseButton={false} data-testid="start-over-dialog">
        <DialogHeader>
          <DialogTitle>Start over?</DialogTitle>
          <DialogDescription>
            This clears every shop&apos;s answers and funding for everyone on this demo.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button ref={cancelRef} variant="outline" data-testid="start-over-cancel" />}>
            Cancel
          </DialogClose>
          <Button
            variant="destructive"
            data-testid="start-over-confirm"
            onClick={() => {
              setOpen(false)
              void reset()
            }}
          >
            Start over
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
