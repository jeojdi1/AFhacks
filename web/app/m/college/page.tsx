import type { Metadata } from "next"
import { CollegeView } from "@/components/mobile/college/college-view"

export const metadata: Metadata = {
  title: "Training partner · Muster",
}

/** /m/college: training partner view (example, not affiliated). */
export default function CollegePage() {
  return <CollegeView />
}
