import type { Metadata } from "next"
import { PrimeDesk } from "@/components/portal/prime-desk"

export const metadata: Metadata = {
  title: "Northgate's desk · Muster",
  description: "Northgate Land Systems (fictional): credit toward the $500M it owes, stuck jobs and shop replies.",
}

export default function PrimePage() {
  return <PrimeDesk />
}
