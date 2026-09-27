"use client"

import * as React from "react"
import { t } from "@/lib/app/strings"
import { DECISION_NOTE_MAX, REASON_CODES, type ReasonCode } from "@/lib/app/types"
import { Button } from "@/components/ui/button"
import { BottomSheet, ChoiceChips } from "./bottom-sheet"
import "./strings"

/** Decline with a reason chip and an optional note (≤ 280 characters). No typing required. */
export function DeclineSheet({
  open,
  onOpenChange,
  jobId,
  primeName,
  busy = false,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string
  primeName: string
  busy?: boolean
  onSubmit: (reason: ReasonCode, note: string | null) => void
}) {
  const [reason, setReason] = React.useState<ReasonCode | null>(null)
  const [note, setNote] = React.useState("")
  const noteId = React.useId()
  const helpId = React.useId()

  const change = (o: boolean) => {
    if (!o) {
      setReason(null)
      setNote("")
    }
    onOpenChange(o)
  }

  const options = REASON_CODES.map((r) => ({ value: r, label: t(`reason.${r}`) }))

  return (
    <BottomSheet
      open={open}
      onOpenChange={change}
      title={t("o.decline.title", { job: jobId })}
      description={t("o.decline.body", { prime: primeName })}
      footer={
        <Button
          size="touch-lg"
          className="w-full"
          disabled={!reason || busy}
          onClick={() => reason && onSubmit(reason, note.trim() ? note.trim() : null)}
        >
          {reason ? t("o.decline.submit") : t("o.decline.pick")}
        </Button>
      }
    >
      <p className="mb-2 text-sm font-semibold text-muted-foreground">{t("o.decline.reasons")}</p>
      <ChoiceChips label={t("o.decline.reasons")} options={options} value={reason} onChange={setReason} />
      <label htmlFor={noteId} className="mt-4 mb-1.5 block text-sm font-semibold text-muted-foreground">
        {t("o.decline.note")}
      </label>
      <textarea
        id={noteId}
        value={note}
        maxLength={DECISION_NOTE_MAX}
        rows={2}
        onChange={(e) => setNote(e.target.value.slice(0, DECISION_NOTE_MAX))}
        placeholder={t("decision.notePlaceholder")}
        aria-describedby={helpId}
        className="block min-h-12 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <p id={helpId} className="mt-1 flex justify-between gap-2 text-sm text-muted-foreground">
        <span>{t("o.decline.noteHelp")}</span>
        <span className="shrink-0 whitespace-nowrap tabular-nums">{t("o.decline.count", { n: note.length })}</span>
      </p>
    </BottomSheet>
  )
}
