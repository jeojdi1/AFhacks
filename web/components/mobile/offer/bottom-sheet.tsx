"use client"

// A bottom sheet on the Base UI dialog: modal, focus-trapped, Esc/backdrop to
// close, padded for the home indicator. Used by DeclineSheet and AskSheet.

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { t } from "@/lib/app/strings"
import "./strings"

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  /** Sticky footer (the submit button). */
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 duration-150 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-[430px] flex-col rounded-t-2xl border border-b-0 border-border bg-background text-base text-foreground shadow-lg outline-none",
            "duration-200 data-closed:animate-out data-closed:slide-out-to-bottom data-open:animate-in data-open:slide-in-from-bottom motion-reduce:animate-none",
            className
          )}
        >
          <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />
          <div className="flex shrink-0 items-start gap-2 px-4 pt-2">
            <div className="min-w-0 flex-1 pt-2">
              <DialogPrimitive.Title className="text-lg leading-tight font-semibold">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-base text-muted-foreground">{description}</DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              aria-label={t("o.sheet.close")}
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-4">{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** A single-choice group of big chips (radio semantics, arrow keys move). */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = 2,
}: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T | null
  onChange: (v: T) => void
  columns?: 1 | 2
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0
    if (!d) return
    e.preventDefault()
    const n = (i + d + options.length) % options.length
    onChange(options[n].value)
    refs.current[n]?.focus()
  }
  const focusIdx = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === focusIdx ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-base leading-tight font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              on ? "border-brand bg-brand/10 text-foreground" : "border-border bg-background text-foreground hover:bg-muted"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                on ? "border-brand" : "border-muted-foreground/50"
              )}
            >
              {on ? <span className="size-2.5 rounded-full bg-brand" /> : null}
            </span>
            <span className="min-w-0 break-words">{o.label.replace(/\//g, "/\u200b")}</span>
          </button>
        )
      })}
    </div>
  )
}
