"use client"

import * as React from "react"
import { ChevronDown, CircleAlert, CircleCheck, CircleX } from "lucide-react"
import { cn } from "@/lib/utils"
import { t } from "@/lib/app/strings"
import { fitSummary, type FitItem, type FitResult } from "@/lib/app/fit"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import "./strings"

const ICON: Record<FitResult, typeof CircleCheck> = { pass: CircleCheck, warn: CircleAlert, fail: CircleX }
const TONE: Record<FitResult, string> = { pass: "text-assigned", warn: "text-amber-700", fail: "text-blocked" }
const WORD: Record<FitResult, string> = { pass: "OK", warn: "Check", fail: "No" }
const HEAD_TONE: Record<FitResult, string> = {
  pass: "border-assigned/25 bg-assigned-soft text-assigned",
  warn: "border-amber-300 bg-amber-50 text-amber-800",
  fail: "border-blocked/30 bg-blocked-soft text-blocked",
}

/**
 * "Can we do it?": one row per check, each with icon + word + text (never colour alone).
 * With `collapsible`, the verdict chip shows first and the rows open on tap; they start
 * open when something needs a look (warn / fail), so a problem is never hidden.
 */
export function FitChecklist({ items, className, collapsible = false }: { items: FitItem[]; className?: string; collapsible?: boolean }) {
  const summary = fitSummary(items)
  const SumIcon = ICON[summary]
  const [open, setOpen] = React.useState(!collapsible || summary !== "pass")
  const listId = React.useId()

  const verdict = (
    <span className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[15px] font-medium", HEAD_TONE[summary])}>
      <SumIcon className="size-4" aria-hidden />
      {t(`o.card.canWe.${summary}`)}
    </span>
  )

  return (
    <section aria-labelledby="fit-title" className={cn("rounded-xl border border-border bg-card", className)}>
      {collapsible ? (
        // Disclosure pattern: the heading holds the button (a button may not hold a heading).
        <h2 id="fit-title" className={cn("text-lg font-semibold", open && "border-b border-border")}>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span>{t("o.card.canWe")}</span>
            <span className="flex items-center gap-2 text-base font-normal">
              {verdict}
              <ChevronDown className={cn("size-5 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
              <span className="sr-only">{open ? t("o.card.canWe.hide") : t("o.card.canWe.show", { count: items.length })}</span>
            </span>
          </button>
        </h2>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id="fit-title" className="text-lg font-semibold">
            {t("o.card.canWe")}
          </h2>
          {verdict}
        </div>
      )}
      <ul id={listId} hidden={!open} className="divide-y divide-border">
        {items.map((it) => {
          const Icon = ICON[it.result]
          return (
            <li key={it.key} className="flex gap-3 px-4 py-3">
              <Icon className={cn("mt-0.5 size-5 shrink-0", TONE[it.result])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-base leading-snug font-medium">
                  <span className="sr-only">{WORD[it.result]}: </span>
                  {it.label}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-base text-muted-foreground">
                  <span>{it.detail}</span>
                  {it.assumption ? <AssumptionTag note="Weekly hours per job are demo estimates, not quoted figures" /> : null}
                </p>
              </div>
              <span className={cn("shrink-0 text-[15px] font-semibold", TONE[it.result])} aria-hidden>
                {WORD[it.result]}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
