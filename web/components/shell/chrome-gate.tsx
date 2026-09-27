"use client"

import type * as React from "react"
import { usePathname } from "next/navigation"
import { AppHeader } from "@/components/shell/app-header"
import { ProgramContextBar } from "@/components/shell/program-context-bar"
import { AppFooter } from "@/components/shell/app-footer"
import { useSession } from "@/lib/auth/session"
import { Toaster } from "@/components/ui/sonner"

/** True for the phone app routes (/m and below), which bring their own chrome. */
export function isPhoneRoute(pathname: string | null): boolean {
  return pathname === "/m" || (pathname ?? "").startsWith("/m/")
}

/** The shop's own desk (/shop, /shop/work): Tallowfield's pages, not Northgate's story. */
export function isShopDeskRoute(pathname: string | null): boolean {
  return pathname === "/shop" || (pathname ?? "").startsWith("/shop/")
}

/**
 * Northgate's story chrome (the story bar, "Credit so far" and the STEP n OF 5 banners) belongs
 * to the defence company and to signed-out Story mode (the video path). A signed-in shop,
 * college or trainee never sees it, on any route. Until the session is known (server render,
 * first client render) this is true, so the signed-out path never jumps when the bar appears.
 */
export function useStoryChrome(): boolean {
  const { session, hydrated } = useSession()
  return !hydrated || !session || session.role === "prime"
}

/**
 * Desktop chrome everywhere except under /m, where web/app/m/layout.tsx renders the
 * phone header, tabs and footer (the phone app's chrome is untouched):
 *   row 1 AppHeader (logo, Story mode, directory, phone, bell, data source, Start over, account)
 *   row 2 ProgramContextBar, the story bar (5 numbered steps + promise meter): only for the
 *         defence company or signed out (Story mode), never for a shop, college or trainee;
 *         not on the shop desk (/shop, /shop/*) unless a prime is signed in
 *   then the page, then AppFooter. docs/ux-simplification.md §3.1.
 */
export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const storyChrome = useStoryChrome()
  const { session, hydrated } = useSession()
  if (isPhoneRoute(pathname)) return <>{children}</>
  // Northgate's steps and "Credit so far" strip are the prime's story. On the shop desk they
  // show only to a signed-in prime (hidden until the session is known, so a shop never sees a flash).
  const storyBar = isShopDeskRoute(pathname) ? hydrated && session?.role === "prime" : storyChrome
  return (
    <>
      <AppHeader />
      {storyBar ? <ProgramContextBar /> : null}
      <main className="flex w-full flex-1 flex-col">{children}</main>
      <AppFooter />
    </>
  )
}

/**
 * Desktop pages keep toasts bottom-right, clear of the header and program bar.
 * Under /m (the phone app) toasts sit at the top, below the 56 px sticky header,
 * so Back and the status badge stay tappable while an Undo toast is up. Undo is
 * the safety net that replaces a confirm dialog, so it gets a 44 px target; the
 * close button is 32 px with an invisible 44 px hit area.
 */
export function AppToaster() {
  const phone = isPhoneRoute(usePathname())
  return (
    <Toaster
      theme="light"
      // Phone (/m): bottom centre, about 80 px above the tab bar, so a toast never covers the
      // header's back arrow. No close button there (it was 32 px; toasts time out and swipe away).
      position={phone ? "bottom-center" : "bottom-right"}
      closeButton={!phone}
      offset={phone ? { bottom: "calc(env(safe-area-inset-bottom) + 80px)" } : undefined}
      mobileOffset={phone ? { bottom: "calc(env(safe-area-inset-bottom) + 80px)" } : undefined}
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          actionButton: "!h-11 !min-w-11 !rounded-lg !px-4 !text-base !font-semibold",
          closeButton: "!size-8 after:absolute after:-inset-1.5 after:content-['']",
        },
      }}
    />
  )
}
