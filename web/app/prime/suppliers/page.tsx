import type { Metadata } from "next"
import { SupplierSearch } from "@/components/search/supplier-search"
import { dndHistoryByShop } from "@/lib/search/dnd"

export const metadata: Metadata = {
  title: "Find suppliers · Shieldworks",
  description:
    "Search small Canadian shops by process, certificate, distance and National Defence contract history. Demo shops are synthetic; real shops are public data — unverified — not affiliated.",
}

export default function FindSuppliersPage() {
  // Built at build time from public data; only the small per-shop summary reaches the browser.
  return <SupplierSearch dnd={dndHistoryByShop()} />
}
