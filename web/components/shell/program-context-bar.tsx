"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Check, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtMoney, fmtPct } from "@/lib/format"
import { useDemo } from "@/lib/data/store"
import { c, Rich, plainText } from "@/lib/ui/copy"
import { STEPS, currentStep, isDirectoryPath, isPublicShopPath, shopIdFromPath, stepDone, stepHref } from "@/lib/ui/steps"
import { useWithParams } from "@/lib/ui/use-with-params"

/**
 * Row 2 of the desktop chrome: the story bar (docs/ux-simplification.md §3.1, §3.2).
 * Left: the 5 numbered steps (exactly one current, or none; never red).
 * Right: the promise meter ("Credit so far $57.5M of $500M · 11.5%"), which animates after funding.
 * Shop pages get a teal tint; the Shops directory gets an "Extra" label and no current step.
 */
export function ProgramContextBar() {
  const pathname = usePathname() ?? "/"
  const { program, ledger, stage, demoShopId, offerStatus, busy, ready } = useDemo()
  const wp = useWithParams()

  const current = currentStep(pathname, stage, demoShopId)
  const directory = isDirectoryPath(pathname)
  const onShopSide = !!shopIdFromPath(pathname) && !isPublicShopPath(pathname)
  const anyAccepted = Object.entries(offerStatus).some(
    ([k, v]) => v === "accepted" && (!demoShopId || k.startsWith(`${demoShopId}:`))
  )

  // Keep the current pill in view when the steps scroll horizontally (390 px).
  const scroller = React.useRef<HTMLOListElement>(null)
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const box = scroller.current
      const el = box?.querySelector<HTMLElement>('[aria-current="step"]')
      if (!el || !box || box.scrollWidth <= box.clientWidth) return
      const b = box.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      if (r.left < b.left) box.scrollLeft -= b.left - r.left + 8
      else if (r.right > b.right) box.scrollLeft += r.right - b.right + 8
    })
    return () => cancelAnimationFrame(raf)
  }, [current, stage, pathname])

  return (
    <div
      className={cn("border-b", onShopSide ? "border-teal-200 bg-teal-50" : "border-border bg-muted")}
      data-story-bar
      data-side={onShopSide ? "shop" : directory ? "extra" : "prime"}
    >
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-x-6 gap-y-1.5 px-4 py-2 sm:px-6 lg:min-h-12 lg:flex-row lg:items-center lg:justify-between lg:py-1.5">
        <div className="flex min-w-0 items-center gap-3">
          {directory ? (
            <span className="hidden shrink-0 text-xs font-medium text-slate-600 xl:inline" data-extra-label title={c("bar.extra")}>
              {c("bar.extra.short")}
            </span>
          ) : null}
          <ol ref={scroller} className="relative -mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 py-1" aria-label={c("nav.stepsAria")}>
            {STEPS.map((s, i) => {
              const here = current === s.key
              const done = stepDone(s.key, stage, anyAccepted)
              const href = stepHref(s.key, demoShopId)
              return (
                <li key={s.key} className="flex shrink-0 items-center gap-1">
                  {i > 0 ? <span className="h-px w-3 bg-slate-300" aria-hidden /> : null}
                  <Link
                    href={wp(href)}
                    aria-current={here ? "step" : undefined}
                    data-step={s.key}
                    data-state={here ? "current" : done ? "done" : "todo"}
                    className={cn(
                      "relative inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring",
                      here
                        ? "border-slate-900 bg-slate-900 text-white"
                        : done
                          ? "border-assigned/30 bg-assigned-soft text-assigned hover:bg-assigned-soft/70"
                          : "border-slate-300 bg-background text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    {done && !here ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : (
                      <span
                        className={cn(
                          "flex size-4 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
                          here ? "bg-white text-slate-900" : "bg-slate-200 text-slate-700"
                        )}
                        aria-hidden
                      >
                        {s.n}
                      </span>
                    )}
                    <span className="sr-only">
                      Step {s.n}
                      {done ? ", done" : ""}:{" "}
                    </span>
                    <span>
                      {done && !here ? `${s.n} ` : ""}
                      {s.label}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 lg:justify-end">
          {busy && ready ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-700" role="status" aria-live="polite">
              <LoaderCircle className="size-4 animate-spin text-slate-500" aria-hidden />
              <span className="max-w-[14rem] truncate">{busy}</span>
            </span>
          ) : null}
          <PromiseMeter
            credit={ledger?.credit_total_cad ?? null}
            pct={ledger?.obligation_met_pct ?? null}
            obligation={ledger?.obligation_cad ?? program?.obligation_cad ?? 500_000_000}
          />
        </div>
      </div>
    </div>
  )
}

/** Ease a number toward its target in ≤ 600 ms (instant under reduced motion or on first paint). */
function useTween(target: number | null, ms = 600): number | null {
  const [shown, setShown] = React.useState(target)
  const from = React.useRef(target)
  React.useEffect(() => {
    if (target === null) {
      from.current = null
      queueMicrotask(() => setShown(null))
      return
    }
    const start = from.current
    from.current = target
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (start === null || start === target || reduce) {
      queueMicrotask(() => setShown(target))
      return
    }
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      setShown(start + (target - start) * e)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return shown
}

function PromiseMeter({ credit, pct, obligation }: { credit: number | null; pct: number | null; obligation: number }) {
  const shownCredit = useTween(credit)
  const shownPct = useTween(pct)
  const ob = fmtMoney(obligation, { compact: true })
  const final = credit !== null && pct !== null
  const text =
    final && shownCredit !== null && shownPct !== null
      ? c("bar.promise", { credit: fmtMoney(shownCredit, { compact: true }), obligation: ob, pct: fmtPct(shownPct) })
      : c("bar.promise.empty", { obligation: ob })
  const aria = final
    ? c("bar.promise.aria", { credit: fmtMoney(credit, { compact: true }), obligation: ob, pct: fmtPct(pct) })
    : plainText(text)

  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5 lg:items-end" data-promise-meter aria-label={aria} role="group">
      <span className="text-[11px] leading-tight text-slate-500">{c("bar.prime")}</span>
      <div className="flex items-center gap-2 text-[13px] leading-tight whitespace-nowrap text-slate-700 tabular-nums">
        {final && shownCredit !== null && shownPct !== null ? (
          <>
            <span title={fmtMoney(credit)}>
              <Rich text={c("bar.promise", { credit: fmtMoney(shownCredit, { compact: true }), obligation: ob, pct: "" }).replace(/\s*·\s*$/, "")} />
            </span>
            <span className="relative h-2 w-16 shrink-0 overflow-hidden rounded-full bg-slate-200 sm:w-[120px]" aria-hidden>
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-assigned"
                style={{ width: `${Math.max(0, Math.min(1, shownPct)) * 100}%` }}
              />
            </span>
            <span className="min-w-[3.25rem] text-right font-semibold text-foreground">{fmtPct(shownPct)}</span>
          </>
        ) : (
          <span>
            <Rich text={text} />
          </span>
        )}
      </div>
    </div>
  )
}
