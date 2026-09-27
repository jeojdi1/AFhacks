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
  // Keeps the last value across a client navigation until the URL is re-read (no tab flicker).
  return useFromPrimeState().last
}

/**
 * useFromPrime plus whether the flag has been read yet (false on the server and the first
 * client render). Screens that must never show shop-only controls to the defence company
 * (the offer card's Accept / Decline) wait for `known` before rendering them.
 */
export function useFromPrimeState(): { fromPrime: boolean; known: boolean; last: boolean } {
  const pathname = usePathname()
  const [state, setState] = React.useState<{ fromPrime: boolean; known: boolean; path: string | null }>({
    fromPrime: false,
    known: false,
    path: null,
  })
  React.useEffect(() => {
    const v = readFlag()
    queueMicrotask(() => setState({ fromPrime: v, known: true, path: pathname }))
  }, [pathname])
  // A client navigation to another screen: unknown again until the effect re-reads the URL.
  const known = state.known && state.path === pathname
  return { fromPrime: known ? state.fromPrime : false, known, last: state.fromPrime }
}
