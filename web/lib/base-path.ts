// Base path for the GitHub Pages static export (scripts/build_pages.sh), where the site lives under
// /AFhacks/. next/link, useRouter().push/replace and redirect() add it on their own; raw hrefs,
// window.location, manifest URLs and QR codes do not, so they go through withBase().
// In a normal build NEXT_PUBLIC_BASE_PATH is unset: BASE_PATH is "" and withBase() changes nothing.

export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "")

/** True on the static GitHub Pages build: no engine, no server routes, demo data only. */
export const STATIC_SITE = BASE_PATH !== ""

/** Prefixes a root-absolute path ("/m/...") with BASE_PATH. Full URLs, "//host" and relative paths are left alone. */
export function withBase(path: string): string {
  if (!BASE_PATH || !path.startsWith("/") || path.startsWith("//")) return path
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`) || path.startsWith(`${BASE_PATH}?`) || path.startsWith(`${BASE_PATH}#`)) return path
  return `${BASE_PATH}${path}`
}

/** The app route of a real browser pathname: drops BASE_PATH and a trailing slash ("/AFhacks/m/" → "/m"). */
export function stripBase(pathname: string): string {
  let p = pathname
  if (BASE_PATH && (p === BASE_PATH || p.startsWith(`${BASE_PATH}/`))) p = p.slice(BASE_PATH.length) || "/"
  return p.length > 1 ? p.replace(/\/+$/, "") || "/" : p
}
