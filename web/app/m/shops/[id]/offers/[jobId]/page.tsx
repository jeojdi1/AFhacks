import type { Metadata } from "next"
import { OfferCard } from "@/components/mobile/offer/offer-card"

export async function generateMetadata({ params }: { params: Promise<{ id: string; jobId: string }> }): Promise<Metadata> {
  const { jobId } = await params
  return { title: `Offer ${decodeURIComponent(jobId)} · Muster` }
}

export default async function ShopOfferPage({ params }: { params: Promise<{ id: string; jobId: string }> }) {
  const { id, jobId } = await params
  return <OfferCard shopId={decodeURIComponent(id)} jobId={decodeURIComponent(jobId)} />
}
