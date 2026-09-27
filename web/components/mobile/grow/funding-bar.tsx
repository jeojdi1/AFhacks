"use client"

import * as React from "react"
import { HandCoins, LoaderCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import type { ShopActions } from "@/lib/app/types"
import type { GrowItem } from "@/lib/app/readiness"
import { t } from "@/lib/app/strings"
import { FundingChip } from "./grow-chips"

/**
 * Sticky thumb-zone bar: "Ask Northgate to fund this" (touch-lg), then the
 * request chip ("Requested Sep 26 · awaiting Northgate"), then "Funded · 4
 * welders in training" linking to the trainee seat.
 */
export function FundingBar({ item, actions }: { item: GrowItem; actions: ShopActions }) {
  const [sending, setSending] = React.useState(false)
  if (!item.pkg && item.funding === "none") return null

  async function ask() {
    if (sending) return
    setSending(true)
    try {
      const rec = await actions.requestFunding(item.requirement)
      if (rec && !rec.pending) toast.success(t("ready.requestedToast"), { description: t("ready.requestedToastBody") })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-2 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur supports-backdrop-filter:bg-background/85">
      <div aria-live="polite">
        {item.funding === "none" ? (
          <Button size="touch-lg" className="w-full" onClick={ask} disabled={sending}>
            {sending ? (
              <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <HandCoins className="size-5" aria-hidden />
            )}
            {sending ? t("ready.ctaSending") : t("ready.cta")}
          </Button>
        ) : (
          <div className="flex min-h-14 items-center">
            <FundingChip item={item} link className="min-h-12 w-full justify-center px-4 text-base" />
          </div>
        )}
      </div>
    </div>
  )
}
