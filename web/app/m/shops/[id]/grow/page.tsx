import type { Metadata } from "next"
import { GrowList } from "@/components/mobile/grow/grow-list"
import { decodeParam } from "@/lib/app/readiness"
import { PAGES_EXPORT, allShopIds } from "@/lib/pages/static-params"

export const metadata: Metadata = {
  title: "Grow · Shieldworks",
}

/**
 * The demo shop is prerendered, so its tab screens are fully prefetchable and still open
 * offline once the phone has loaded one of them. Any other shop id renders on request.
 * The GitHub Pages export (static, no server) lists every demo shop instead.
 */
export function generateStaticParams() {
  return PAGES_EXPORT ? allShopIds().map((id) => ({ id })) : [{ id: "syn-012" }]
}

export default async function GrowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <GrowList shopId={decodeParam(id)} />
}
