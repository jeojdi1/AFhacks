"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useDemo } from "@/lib/data/store"
import { NetworkView } from "@/components/shop/network-view"

/** /shops → the demo shop (TP-01's shop) when known, otherwise the network list. */
export default function ShopsIndexPage() {
  const { demoShopId } = useDemo()
  const router = useRouter()

  useEffect(() => {
    if (demoShopId) router.replace(`/shops/${encodeURIComponent(demoShopId)}`)
  }, [demoShopId, router])

  return (
    <div className="mx-auto w-full max-w-[1280px] px-6 py-8">
      {demoShopId ? (
        <p className="text-sm text-zinc-500">Opening the demo shop…</p>
      ) : (
        <NetworkView />
      )}
    </div>
  )
}
