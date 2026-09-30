"use client"

import * as React from "react"
import { fmtMoney } from "@/lib/format"
import { t } from "@/lib/app/strings"
import { DECISION_NOTE_MAX, type CounterTerms } from "@/lib/app/types"
import { Button } from "@/components/ui/button"
import { BottomSheet, ChoiceChips } from "./bottom-sheet"
import "./strings"

const SETUP = ["none", "1500", "3000", "5000"] as const
const QTY = ["none", "100", "250", "500"] as const
type Setup = (typeof SETUP)[number]
type Qty = (typeof QTY)[number]

/**
 * Counter-offer (docs/api.md §9): a one-time setup charge and/or a minimum run, picked
 * from chips (no typing needed), plus an optional note. Northgate accepts the terms or
 * keeps its original offer.
 */
export function CounterSheet({
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
  onSubmit: (terms: CounterTerms, note: string | null) => void
}) {
  const [setup, setSetup] = React.useState<Setup>("none")
  const [qty, setQty] = React.useState<Qty>("none")
  const [note, setNote] = React.useState("")
  const noteId = React.useId()

  const change = (o: boolean) => {
    if (!o) {
      setSetup("none")
      setQty("none")
      setNote("")
    }
    onOpenChange(o)
  }
  const terms: CounterTerms = {
    setup_charge_cad: setup === "none" ? null : Number(setup),
    min_quantity: qty === "none" ? null : Number(qty),
  }
  const ready = terms.setup_charge_cad !== null || terms.min_quantity !== null

  return (
    <BottomSheet
      open={open}
      onOpenChange={change}
      title={t("o.counter.title", { job: jobId })}
      description={t("o.counter.body", { prime: primeName })}
      footer={
        <Button
          size="touch-lg"
          className="w-full"
          disabled={!ready || busy}
          onClick={() => ready && onSubmit(terms, note.trim() ? note.trim() : null)}
          data-testid="counter-submit"
        >
          {ready ? t("o.counter.submit") : t("o.counter.pick")}
        </Button>
      }
    >
      <p className="mb-2 text-sm font-semibold text-muted-foreground">{t("o.counter.setup")}</p>
      <ChoiceChips
        label={t("o.counter.setup")}
        options={SETUP.map((v) => ({ value: v, label: v === "none" ? t("o.counter.none") : fmtMoney(Number(v)) }))}
        value={setup}
        onChange={setSetup}
      />
      <p className="mt-4 mb-2 text-sm font-semibold text-muted-foreground">{t("o.counter.qty")}</p>
      <ChoiceChips
        label={t("o.counter.qty")}
        options={QTY.map((v) => ({ value: v, label: v === "none" ? t("o.counter.none") : Number(v).toLocaleString("en-US") }))}
        value={qty}
        onChange={setQty}
      />
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
        className="block min-h-12 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <p className="mt-1 text-sm text-muted-foreground">
        {t("o.decline.noteHelp")} {t("o.counter.demo")}
      </p>
    </BottomSheet>
  )
}
