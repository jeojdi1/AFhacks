"use client"

import { useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"

/** Query params a phone link keeps: the engine override (?api=), the data mode and Story mode. */
const KEEP = ["api", "mode", "story"] as const

/** Adds the current ?api / ?mode / ?story to an internal href (before any #hash). Existing params win. */
export function keepPhoneParams(href: string, search: string): string {
  if (!search || !href.startsWith("/")) return href
  let current: URLSearchParams
  try {
    current = new URLSearchParams(search)
  } catch {
    return href
  }
  const keep = KEEP.filter((k) => current.get(k) !== null)
  if (!keep.length) return href
  const hashAt = href.indexOf("#")
  const hash = hashAt >= 0 ? href.slice(hashAt) : ""
  const noHash = hashAt >= 0 ? href.slice(0, hashAt) : href
  const qAt = noHash.indexOf("?")
  const path = qAt >= 0 ? noHash.slice(0, qAt) : noHash
  const params = new URLSearchParams(qAt >= 0 ? noHash.slice(qAt + 1) : "")
  for (const k of keep) if (!params.has(k)) params.set(k, current.get(k) as string)
  const qs = params.toString()
  return `${path}${qs ? `?${qs}` : ""}${hash}`
}

const noopSubscribe = () => () => {}
const readSearch = () => (typeof window === "undefined" ? "" : window.location.search)
const serverSearch = () => ""

/**
 * Hydration-safe: server and first client render return the bare href, then links pick up
 * ?api / ?mode / ?story. Use for links that leave the phone app (e.g. /prime/suppliers), so a
 * phone pointed at another engine keeps talking to it.
 */
export function usePhoneHref(): (href: string) => string {
  usePathname() // re-render on navigation so the search snapshot is re-read
  const search = useSyncExternalStore(noopSubscribe, readSearch, serverSearch)
  return (href: string) => keepPhoneParams(href, search)
}
