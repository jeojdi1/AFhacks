import type { Metadata } from "next"
import { ShopView } from "@/components/shop/shop-view"
import { dndHistoryFor } from "@/components/shop/dnd-history"
import shops from "@fixtures/shops.json"
import shopsPublic from "@fixtures/shops_public.json"
import { PAGES_EXPORT, allShopIds } from "@/lib/pages/static-params"

/** GitHub Pages export only: every demo shop, synthetic and public. Otherwise renders on request. */
export const generateStaticParams = PAGES_EXPORT ? () => allShopIds().map((id) => ({ id })) : undefined

type NamedShop = { id: string; name: string }
let names: Map<string, string> | null = null
/** Shop name from the bundled demo data (synthetic + public), or null for a shop only the live engine knows. */
function shopName(id: string): string | null {
  names ??= new Map(
    [...(shops as { shops: NamedShop[] }).shops, ...(shopsPublic as { shops: NamedShop[] }).shops].map((s) => [s.id, s.name])
  )
  return names.get(id) ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const shopId = decodeURIComponent(id)
  const name = shopName(shopId)
  return {
    title: name ? `${name} · Shieldworks` : shopId.startsWith("pub-") ? "Shop profile · Shieldworks" : "The shop's side · Shieldworks",
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
