import type { Metadata } from "next"
import { ReadinessStepper } from "@/components/mobile/grow/readiness-stepper"
import { decodeParam, requirementFromParam } from "@/lib/app/readiness"
import { PAGES_EXPORT, growParams } from "@/lib/pages/static-params"

/** GitHub Pages export only: every synthetic shop x every requirement a Grow link can carry. Otherwise renders on request. */
export const generateStaticParams = PAGES_EXPORT ? () => growParams() : undefined

export const metadata: Metadata = {
  title: "Readiness · Shieldworks",
}

export default async function GrowItemPage({ params }: { params: Promise<{ id: string; req: string }> }) {
  const { id, req } = await params
  const shopId = decodeParam(id)
  const requirement = requirementFromParam(req)
  return <ReadinessStepper key={`${shopId}:${requirement}`} shopId={shopId} requirement={requirement} />
}
