import type { Metadata } from "next"
import { OfferList } from "@/components/mobile/offer/offer-list"
import { PAGES_EXPORT, allShopIds } from "@/lib/pages/static-params"

export const metadata: Metadata = {
  title: "Offers · Shieldworks",
}

/**
 * The demo shop is prerendered, so its tab screens are fully prefetchable and still open
 * offline once the phone has loaded one of them. Any other shop id renders on request.
 * The GitHub Pages export (static, no server) lists every demo shop instead.
 */
export function generateStaticParams() {
  return PAGES_EXPORT ? allShopIds().map((id) => ({ id })) : [{ id: "syn-012" }]
}

export default async function ShopOffersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <OfferList shopId={decodeURIComponent(id)} />
}
