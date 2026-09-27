import type { Metadata } from "next"
import { OfferCard } from "@/components/mobile/offer/offer-card"
import { PAGES_EXPORT, offerPairs } from "@/lib/pages/static-params"

/** GitHub Pages export only: every (shop, job) pair that can carry an offer. Otherwise renders on request. */
export const generateStaticParams = PAGES_EXPORT ? () => offerPairs() : undefined

export async function generateMetadata({ params }: { params: Promise<{ id: string; jobId: string }> }): Promise<Metadata> {
  const { jobId } = await params
  return { title: `Offer ${decodeURIComponent(jobId)} · Shieldworks` }
}

export default async function ShopOfferPage({ params }: { params: Promise<{ id: string; jobId: string }> }) {
  const { id, jobId } = await params
  return <OfferCard shopId={decodeURIComponent(id)} jobId={decodeURIComponent(jobId)} />
}
