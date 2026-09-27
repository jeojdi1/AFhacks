import type { Metadata } from "next"
import { OfferList } from "@/components/mobile/offer/offer-list"

export const metadata: Metadata = {
  title: "Offers · Muster",
}

export default async function ShopOffersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <OfferList shopId={decodeURIComponent(id)} />
}
