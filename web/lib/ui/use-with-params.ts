"use client"

import { useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"
import { mergeParams } from "./steps"

const noopSubscribe = () => () => {}
const readSearch = () => (typeof window === "undefined" ? "" : window.location.search)
const serverSearch = () => ""

/**
 * Hydration-safe withParams for render: server and first client render return the bare href,
 * then links pick up ?mode/?story. Re-reads on every client navigation.
 */
export function useWithParams(): (href: string) => string {
  usePathname() // re-render on navigation so the search snapshot is re-read
  const search = useSyncExternalStore(noopSubscribe, readSearch, serverSearch)
  return (href: string) => mergeParams(href, search)
}
