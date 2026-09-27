import type { Metadata } from "next"
import { TraineeHome } from "@/components/portal/trainee-home"

export const metadata: Metadata = {
  title: "Training seat · Muster",
  robots: { index: false, follow: false },
}

export default function TraineePage() {
  return <TraineeHome />
}
