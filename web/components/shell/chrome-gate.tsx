"use client"

import type * as React from "react"
import { usePathname } from "next/navigation"
import { AppHeader } from "@/components/shell/app-header"
import { ProgramContextBar } from "@/components/shell/program-context-bar"
import { AppFooter } from "@/components/shell/app-footer"

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
