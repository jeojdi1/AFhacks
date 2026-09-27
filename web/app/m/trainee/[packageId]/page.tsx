import type { Metadata } from "next"
import { SeatCard } from "@/components/mobile/trainee/seat-card"
import { decodeParam } from "@/lib/app/readiness"

export const metadata: Metadata = {
  title: "Training seat · Muster",
  // A private, shareable seat link: keep it out of search indexes.
  robots: { index: false, follow: false },
}

export default async function TraineeSeatPage({
  params,
  searchParams,
}: {
  params: Promise<{ packageId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { packageId } = await params
  const sp = await searchParams
  const raw = Array.isArray(sp.seat) ? sp.seat[0] : sp.seat
  const n = Number.parseInt(raw ?? "", 10)
  return <SeatCard packageId={decodeParam(packageId)} seat={Number.isFinite(n) && n > 0 ? n : 1} />
}
