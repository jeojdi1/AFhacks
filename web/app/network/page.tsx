import type { Metadata } from "next"
import { NetworkView } from "@/components/shop/network-view"

export const metadata: Metadata = {
  title: "Network · Muster",
}

export default function NetworkPage() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-6 py-8">
      <NetworkView />
    </div>
  )
}
