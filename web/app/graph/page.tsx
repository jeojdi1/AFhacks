import type { Metadata } from "next"
import { GraphView } from "@/components/graph/graph-view"

export const metadata: Metadata = {
  title: "Supplier map · Muster",
  description:
    "Northgate's supplier map: see which shops can do a skill, hold a certificate or work in a region, and which already did National Defence work. Demo shops are synthetic; real companies are public data — unverified — not affiliated.",
}

export default function GraphPage() {
  return <GraphView />
}
