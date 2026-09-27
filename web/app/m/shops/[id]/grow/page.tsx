import type { Metadata } from "next"
import { GrowList } from "@/components/mobile/grow/grow-list"
import { decodeParam } from "@/lib/app/readiness"

export const metadata: Metadata = {
  title: "Grow · Muster",
}

export default async function GrowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <GrowList shopId={decodeParam(id)} />
}
