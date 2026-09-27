"use client"

import type * as React from "react"
import { usePathname } from "next/navigation"
import { AppHeader } from "@/components/shell/app-header"
import { ProgramContextBar } from "@/components/shell/program-context-bar"
import { AppFooter } from "@/components/shell/app-footer"
import { Toaster } from "@/components/ui/sonner"

/** True for the phone app routes (/m and below), which bring their own chrome. */
export function isPhoneRoute(pathname: string | null): boolean {
  return pathname === "/m" || (pathname ?? "").startsWith("/m/")
}

/**
 * Desktop chrome (header, program bar, footer) everywhere except under /m,
 * where web/app/m/layout.tsx renders the phone header, tabs and footer.
 * Desktop markup is unchanged.
 */
export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (isPhoneRoute(pathname)) return <>{children}</>
  return (
    <>
      <AppHeader />
      <ProgramContextBar />
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
      position={phone ? "top-right" : "bottom-right"}
      closeButton
      mobileOffset={phone ? { top: "calc(env(safe-area-inset-top) + 64px)" } : undefined}
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
