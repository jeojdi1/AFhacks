import type { Metadata } from "next"
import { NetworkView } from "@/components/shop/network-view"
import { dndHistoryMap } from "@/components/shop/dnd-history"

export const metadata: Metadata = {
  title: "Shops directory · Shieldworks",
}

export default function NetworkPage() {
  // Server-side: the DND match map is a handful of entries, so the 250 KB source never ships.
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8">
      <NetworkView dnd={dndHistoryMap()} />
    </div>
  )
}
