import type { ShopDetailResponse, ShopsResponse } from "@/lib/api/types"

// Derived from the response types so these stay in lockstep with docs/api.md.
export type ShopDetail = ShopDetailResponse
export type ShopT = ShopDetailResponse["shop"]
export type ListShop = ShopsResponse["shops"][number]
export type CertT = ShopDetailResponse["certifications"][number]
export type OfferT = ShopDetailResponse["offers"][number]
export type ReadinessT = ShopDetailResponse["readiness"][number]
export type TrainingT = ShopDetailResponse["training"][number]

/** Minimal part info used to expand job ids into readable lines. */
export interface JobInfo {
  part_no: string
  description: string
  value_cad?: number
}
