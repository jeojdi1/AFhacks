"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

// withFromPrime (lib/app/feed.ts) adds the ?from=prime flag to the prime feed's shop links.

function readFlag(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("from") === "prime"
  } catch {
    return false
  }
}

/**
 * True when the defence company opened a shop screen from its own feed (?from=prime).
 * The shell then keeps the prime's tabs, back arrow and desktop link instead of the shop's.
 * Read from window.location after mount (no useSearchParams, so no Suspense boundary is needed
 * in the layout); re-read on every client navigation.
 */
export function useFromPrime(): boolean {
  const pathname = usePathname()
  const [flag, setFlag] = React.useState(false)
  React.useEffect(() => {
    const v = readFlag()
    queueMicrotask(() => setFlag(v))
  }, [pathname])
  return flag
}
