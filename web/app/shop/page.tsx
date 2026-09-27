import type { Metadata } from "next"
import { ShopDesk } from "@/components/portal/shop-desk"

export const metadata: Metadata = {
  title: "Shop desk · Shieldworks",
  description: "Tallowfield Fabricating Ltd. (synthetic): job offers from Northgate, one step to more work, certificates due.",
}

export default function ShopPage() {
  return <ShopDesk />
}
