import type { Metadata } from "next"
import { ShopView } from "@/components/shop/shop-view"

export const metadata: Metadata = {
  title: "Shop view · Muster",
}

export default async function ShopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-[1280px] px-6 py-8">
      <ShopView id={decodeURIComponent(id)} />
    </div>
  )
}
