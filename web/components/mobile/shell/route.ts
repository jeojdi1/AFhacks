// Parse /m paths so the phone header, tabs and hints agree on where we are.

export type MSection = "today" | "offers" | "offer" | "certs" | "grow" | "growItem" | "other"

export type MRoute =
  | { kind: "home" }
  | { kind: "shop"; shopId: string; section: MSection; param: string | null }
  | { kind: "prime" }
  | { kind: "trainee"; packageId: string | null }
  | { kind: "tenders" }
  | { kind: "other"; parts: string[] }

export function parseMRoute(pathname: string | null): MRoute {
  const parts = (pathname ?? "/m")
    .split("?")[0]
    .split("/")
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p)
      } catch {
        return p
      }
    })
  if (parts[0] !== "m" || parts.length === 1) return { kind: "home" }
  const [, a, b, c, d] = parts
  if (a === "shops" && b) {
    if (!c) return { kind: "shop", shopId: b, section: "today", param: null }
    if (c === "offers") return d ? { kind: "shop", shopId: b, section: "offer", param: d } : { kind: "shop", shopId: b, section: "offers", param: null }
    if (c === "certs") return { kind: "shop", shopId: b, section: "certs", param: null }
    if (c === "grow") return d ? { kind: "shop", shopId: b, section: "growItem", param: d } : { kind: "shop", shopId: b, section: "grow", param: null }
    return { kind: "shop", shopId: b, section: "other", param: c }
  }
  if (a === "prime") return { kind: "prime" }
  if (a === "trainee") return { kind: "trainee", packageId: b ?? null }
  if (a === "tenders") return { kind: "tenders" }
  return { kind: "other", parts: parts.slice(1) }
}

/** Shop sections that show the bottom tab bar. Detail screens (an offer, a grow item) hide it so their sticky action bar owns the bottom. */
export const TAB_SECTIONS: readonly MSection[] = ["today", "offers", "certs", "grow"]

export function shopHref(shopId: string, section: "today" | "offers" | "certs" | "grow" = "today"): string {
  const base = `/m/shops/${encodeURIComponent(shopId)}`
  return section === "today" ? base : `${base}/${section}`
}

/** Where the header back arrow goes (the parent screen, never history.back()). */
export function parentHref(pathname: string | null): string | null {
  const r = parseMRoute(pathname)
  switch (r.kind) {
    case "home":
      return null
    case "shop":
      if (r.section === "offer") return shopHref(r.shopId, "offers")
      if (r.section === "growItem") return shopHref(r.shopId, "grow")
      if (r.section === "today") return "/m"
      return shopHref(r.shopId, "today")
    default:
      return "/m"
  }
}
