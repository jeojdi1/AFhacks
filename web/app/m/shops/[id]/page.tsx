import { TodayView } from "@/components/mobile/today/today-view"

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

/**
 * The demo shop is prerendered, so its tab screens are fully prefetchable and still open
 * offline once the phone has loaded one of them. Any other shop id renders on request.
 */
export function generateStaticParams() {
  return [{ id: "syn-012" }]
}

/** Shop "Today" home (docs/app-spec.md §2.2): what needs a reply, what lapses next, what is one step away. */
export default async function ShopTodayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TodayView shopId={safeDecode(id)} />
}
