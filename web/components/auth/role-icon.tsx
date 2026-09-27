import { Building2, Factory, GraduationCap, HardHat, type LucideIcon } from "lucide-react"
import type { Role } from "@/lib/auth/accounts"

export const ROLE_ICON: Record<Role, LucideIcon> = {
  prime: Building2,
  shop: Factory,
  college: GraduationCap,
  trainee: HardHat,
}

/** Short role word for banners: "Northgate", "the shop", ... */
export const ROLE_NOUN: Record<Role, string> = {
  prime: "Northgate (supplier development)",
  shop: "Tallowfield (shop owner)",
  college: "the college (training coordinator)",
  trainee: "a trainee (seat 3 of 4)",
}
