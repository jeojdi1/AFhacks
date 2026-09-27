import type { Metadata } from "next"
import { ReadinessStepper } from "@/components/mobile/grow/readiness-stepper"
import { decodeParam } from "@/lib/app/readiness"

export const metadata: Metadata = {
  title: "Readiness · Shieldworks",
}

export default async function GrowItemPage({ params }: { params: Promise<{ id: string; req: string }> }) {
  const { id, req } = await params
  const shopId = decodeParam(id)
  const requirement = decodeParam(req)
  return <ReadinessStepper key={`${shopId}:${requirement}`} shopId={shopId} requirement={requirement} />
}
