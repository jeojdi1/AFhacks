import type { Metadata } from "next"
import { CollegeDesk } from "@/components/portal/college-desk"

export const metadata: Metadata = {
  title: "Training coordinator · Shieldworks",
  description: "Regional college (example, not affiliated): welder training plans Northgate funds, seats, and the records that let training count.",
}

export default function CollegePage() {
  return <CollegeDesk />
}
