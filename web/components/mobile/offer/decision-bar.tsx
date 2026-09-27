"use client"

import * as React from "react"
import { Check, CircleHelp, MessageSquareReply, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { t } from "@/lib/app/strings"
import type { OfferDecisionRec } from "@/lib/app/types"
import { Button } from "@/components/ui/button"
import { SimulatedChip } from "@/components/mobile/shell/simulation"
import { WillSendChip, decisionLine, type OfferState } from "./shared"
import "./strings"

const STATUS_TONE: Record<OfferState, string> = {
  accepted: "border-assigned/25 bg-assigned-soft text-assigned",
  declined: "border-blocked/30 bg-blocked-soft text-blocked",
  question: "border-controlled/25 bg-controlled-soft text-controlled",
  open: "border-border bg-background text-foreground",
}
const STATUS_ICON: Record<OfferState, typeof Check> = { accepted: Check, declined: X, question: CircleHelp, open: Check }

/**
 * Sticky bottom bar: Accept · Decline · Ask Northgate (56 px each).
 * After an accept/decline it becomes a status row with "Change answer".
 * A question keeps the three buttons, with the question (and Northgate's reply, once sent) above them.
 * A simulated decision (the demo simulator answered for this shop) is labelled as such.
 */
export function DecisionBar({
  state,
  decision,
  pending,
  busy,
  onAccept,
  onDecline,
  onAsk,
  simulated = false,
  reply = null,
  prime = "Northgate",
}: {
  state: OfferState
  decision: OfferDecisionRec | null
  pending: boolean
  busy: boolean
  simulated?: boolean
  reply?: { text: string; via: "engine" | "local" } | null
  prime?: string
  onAccept: () => void
  onDecline: () => void
  onAsk: () => void
}) {
  const [changing, setChanging] = React.useState(false)
  const decided = state === "accepted" || state === "declined"
  // A new answer arrived (or was undone): leave "change" mode.
  const stamp = `${state}:${decision?.at ?? ""}`
  const [lastStamp, setLastStamp] = React.useState(stamp)
  if (stamp !== lastStamp) {
    setLastStamp(stamp)
    setChanging(false)
  }
  const showButtons = !decided || changing
  const Icon = STATUS_ICON[state]

  return (
    <div
      role="region"
      aria-label={t("o.bar.label")}
      className="sticky bottom-0 z-20 -mx-4 mt-4 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur supports-backdrop-filter:bg-background/90"
    >
      {state !== "open" ? (
        <div aria-live="polite" className={cn("mb-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2", STATUS_TONE[state])}>
          <Icon className="size-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-base leading-snug font-semibold">{decisionLine(state, decision, simulated)}</p>
            {simulated ? <p className="text-sm text-foreground/80">{t("o.status.simBody")}</p> : null}
            {state === "question" && reply ? (
              <p className="mt-1 flex items-start gap-1.5 text-sm text-foreground" data-testid="offer-reply-bar">
                <MessageSquareReply className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-semibold">{t("o.reply.title", { prime })}:</span> “{reply.text}”
                </span>
              </p>
            ) : null}
            {state === "question" ? (
              <p className="text-sm text-foreground/80">{reply ? t("o.status.questionReplied") : t("o.status.questionBody")}</p>
            ) : null}
            {state === "declined" && decision?.note ? <p className="text-sm break-words text-foreground/80">“{decision.note}”</p> : null}
          </div>
          {simulated ? <SimulatedChip /> : null}
          {pending ? <WillSendChip /> : null}
        </div>
      ) : null}

      {showButtons ? (
        <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-2">
          <Button size="touch-lg" className="bg-emerald-700 px-2 text-white hover:bg-emerald-800" disabled={busy || state === "accepted"} onClick={onAccept}>
            <Check className="size-5" aria-hidden />
            {t("decision.accept")}
          </Button>
          <Button size="touch-lg" variant="outline" className="px-2" disabled={busy || state === "declined"} onClick={onDecline}>
            {t("decision.decline")}
          </Button>
          <Button size="touch-lg" variant="outline" className="px-2 leading-tight whitespace-normal" disabled={busy} onClick={onAsk}>
            {t("decision.ask")}
          </Button>
        </div>
      ) : null}

      {decided ? (
        changing ? (
          <Button size="touch" variant="ghost" className="mt-2 w-full" onClick={() => setChanging(false)}>
            {t("o.status.keep")}
          </Button>
        ) : (
          <Button size="touch" variant="outline" className="w-full" onClick={() => setChanging(true)}>
            {t("decision.change")}
          </Button>
        )
      ) : null}
    </div>
  )
}
