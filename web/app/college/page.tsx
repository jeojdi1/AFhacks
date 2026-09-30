import type { Metadata } from "next"
import { CollegeDesk } from "@/components/portal/college-desk"

export const metadata: Metadata = {
  title: "Training coordinator · Shieldworks",
  description: "Regional college (example, not affiliated): training plans Northgate funds (welders, machinists, electronics assemblers), seats, and the records that let training count.",
}

export default function CollegePage() {
  return <CollegeDesk />
}
