import type { Metadata } from "next"
import { FindWork } from "@/components/search/find-work"

export const metadata: Metadata = {
  title: "Find work · Muster",
  description:
    "Tallowfield Fabricating Ltd. (synthetic): Northgate jobs it qualifies for, jobs one step away, and open federal defence tenders.",
}

export default function FindWorkPage() {
  return <FindWork />
}
