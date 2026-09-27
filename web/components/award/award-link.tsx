"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePhoneHref } from "@/components/mobile/shell/use-phone-href"
import { awardHref } from "@/lib/award"

/** "Open award package →" on an accepted offer (keeps ?mode/?api/?story). */
export function AwardLink({ shopId, jobId, phone = false, className }: { shopId: string; jobId: string; phone?: boolean; className?: string }) {
  const wp = usePhoneHref()
  return (
    <Link
      href={wp(awardHref(shopId, jobId, phone))}
      className={cn(
        "inline-flex items-center gap-1.5 font-medium text-brand underline-offset-4 hover:underline",
        phone ? "min-h-12 text-base" : "min-h-8 text-sm",
        className
      )}
      data-testid="award-link"
    >
      Open award package
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  )
}
