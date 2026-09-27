import type { Metadata } from "next"
import { OfferList } from "@/components/mobile/offer/offer-list"

export const metadata: Metadata = {
  title: "Offers · Muster",
}

/**
 * The demo shop is prerendered, so its tab screens are fully prefetchable and still open
 * offline once the phone has loaded one of them. Any other shop id renders on request.
 */
export function generateStaticParams() {
  return [{ id: "syn-012" }]
}

export default async function ShopOffersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <OfferList shopId={decodeURIComponent(id)} />
}
