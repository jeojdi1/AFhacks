import type { Metadata } from "next"
import { ShopView } from "@/components/shop/shop-view"
import { dndHistoryFor } from "@/components/shop/dnd-history"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  return {
    title: decodeURIComponent(id).startsWith("pub-") ? "Shops directory · Muster" : "The shop's side · Muster",
  }
}

export default async function ShopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const shopId = decodeURIComponent(id)
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8">
      <ShopView id={shopId} dnd={shopId.startsWith("pub-") ? dndHistoryFor(shopId) : null} />
    </div>
  )
}
