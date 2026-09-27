import type { Metadata } from "next"
import { AwardPage } from "@/components/award/award-page"

export async function generateMetadata({ params }: { params: Promise<{ id: string; jobId: string }> }): Promise<Metadata> {
  const { jobId } = await params
  return { title: `Award package ${decodeURIComponent(jobId)} · Shieldworks` }
}

export default async function ShopAwardPage({ params }: { params: Promise<{ id: string; jobId: string }> }) {
  const { id, jobId } = await params
  return <AwardPage shopId={decodeURIComponent(id)} jobId={decodeURIComponent(jobId)} variant="desktop" />
}
