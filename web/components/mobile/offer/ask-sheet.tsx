"use client"

import * as React from "react"
import { t } from "@/lib/app/strings"
import { QUESTION_CODES, type QuestionCode } from "@/lib/app/types"
import { Button } from "@/components/ui/button"
import { BottomSheet, ChoiceChips } from "./bottom-sheet"
import "./strings"

/** Ask the prime a templated question. No free text, so no technical data lands in Muster. */
export function AskSheet({
  open,
  onOpenChange,
  jobId,
  busy = false,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string
  busy?: boolean
  onSubmit: (question: QuestionCode) => void
}) {
  const [q, setQ] = React.useState<QuestionCode | null>(null)
  const change = (o: boolean) => {
    if (!o) setQ(null)
    onOpenChange(o)
  }
  const options = QUESTION_CODES.map((c) => ({ value: c, label: t(`question.${c}`) }))

  return (
    <BottomSheet
      open={open}
      onOpenChange={change}
      title={t("o.ask.title", { job: jobId })}
      description={t("o.ask.body")}
      footer={
        <Button size="touch-lg" className="w-full" disabled={!q || busy} onClick={() => q && onSubmit(q)}>
          {q ? t("o.ask.submit") : t("o.ask.pick")}
        </Button>
      }
    >
      <p className="mb-2 text-sm font-semibold text-muted-foreground">{t("o.ask.questions")}</p>
      <ChoiceChips label={t("o.ask.questions")} options={options} value={q} onChange={setQ} columns={1} />
    </BottomSheet>
  )
}
