import type { Metadata } from "next"
import { Suspense } from "react"
import { SeatGate, SeatGateFromUrl } from "./seat-gate"
import { decodeParam } from "@/lib/app/readiness"
import { PAGES_EXPORT, trainingPackageIds } from "@/lib/pages/static-params"

export const metadata: Metadata = {
  title: "Training seat · Shieldworks",
  // A private, shareable seat link: keep it out of search indexes.
  robots: { index: false, follow: false },
}

/** GitHub Pages export only: every training package in the demo data. Otherwise renders on request. */
export const generateStaticParams = PAGES_EXPORT ? () => trainingPackageIds().map((packageId) => ({ packageId })) : undefined

export default async function TraineeSeatPage({
  params,
  searchParams,
}: {
  params: Promise<{ packageId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { packageId } = await params
  // A static export has no query string at build time: the browser reads ?seat= (same rules).
  if (PAGES_EXPORT) {
    return (
      <Suspense fallback={null}>
        <SeatGateFromUrl packageId={decodeParam(packageId)} />
      </Suspense>
    )
  }
  const sp = await searchParams
  const raw = Array.isArray(sp.seat) ? sp.seat[0] : sp.seat
  // No ?seat= means seat 1. A seat that is not a whole number from 1 up (0, abc, 1.5) is passed
  // as null so the card says the seat does not exist instead of quietly showing another seat.
  const seat = raw === undefined || raw === "" ? 1 : /^\d+$/.test(raw.trim()) && Number(raw) > 0 ? Number(raw) : null
  return <SeatGate packageId={decodeParam(packageId)} seat={seat} />
}
