import { TodayView } from "@/components/mobile/today/today-view"

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

/** Shop "Today" home (docs/app-spec.md §2.2): what needs a reply, what lapses next, what is one step away. */
export default async function ShopTodayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TodayView shopId={safeDecode(id)} />
}
