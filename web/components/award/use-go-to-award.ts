"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { keepPhoneParams } from "@/components/mobile/shell/use-phone-href"
import { awardHref } from "@/lib/award"

/** Navigate to an award page (or any internal href) keeping ?api / ?mode / ?story. */
export function useGoTo(): (href: string) => void {
  const router = useRouter()
  return React.useCallback(
    (href: string) => router.push(keepPhoneParams(href, typeof window === "undefined" ? "" : window.location.search)),
    [router]
  )
}

/** After a successful Accept: jump to the award package. */
export function useGoToAward(phone: boolean): (shopId: string, jobId: string) => void {
  const go = useGoTo()
  return React.useCallback((shopId: string, jobId: string) => go(awardHref(shopId, jobId, phone)), [go, phone])
}
