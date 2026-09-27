import type * as React from "react"
import { cn } from "@/lib/utils"
import { fmtMoney, fmtPct } from "@/lib/format"

const MULT_CAPTION: Record<number, string> = {
  1: "regular work",
  2: "small business",
  5: "training",
  10: "Indigenous workforce training",
}

/** Two decimals in millions so the equation reads true: "$2.81M × 90% × 2 = $5.06M". */
export function fmtMoney2(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e6 && a < 1e8) return `${n < 0 ? "-" : ""}$${(a / 1e6).toFixed(2)}M`
  return fmtMoney(n, { compact: true })
}

/**
 * "work × Canadian content × counts double = credit" (docs/ux-simplification.md §7.3).
 * Compact money on screen; exact dollars in the title tooltip.
 *
 *   <CreditEquation value={2812000} ccv={0.9} multiplier={2} credit={5061600} />
 */
export function CreditEquation({
  value,
  ccv,
  multiplier,
  credit,
  compact = false,
  className,
}: {
  value: number
  ccv: number
  multiplier: number
  credit: number
  compact?: boolean
  className?: string
}) {
  const multCaption = MULT_CAPTION[multiplier] ?? "multiplier"
  const tiles: { v: string; cap: string; title?: string; tone?: "accent" | "strong" }[] = [
    { v: fmtMoney2(value), cap: "work", title: fmtMoney(value) },
    { v: fmtPct(ccv, 0), cap: "Canadian content" },
    { v: `${multiplier}`, cap: `(${multCaption})`, tone: "accent" },
    { v: fmtMoney2(credit), cap: "credit", title: fmtMoney(credit), tone: "strong" },
  ]
  const ops = ["×", "×", "="]

  if (compact) {
    return (
      <p className={cn("text-sm leading-relaxed text-foreground tabular-nums", className)} data-credit-equation>
        {tiles.map((t, i) => (
          <span key={t.cap}>
            <span title={t.title} className={cn(t.tone === "strong" && "font-semibold")}>
              {t.v}
            </span>{" "}
            <span className="text-muted-foreground">{t.cap}</span>
            {i < ops.length ? <span className="mx-1.5 text-muted-foreground">{ops[i]}</span> : null}
          </span>
        ))}
      </p>
    )
  }

  return (
    <div
      className={cn("flex flex-wrap items-stretch gap-2 sm:flex-nowrap sm:items-center", className)}
      data-credit-equation
      role="group"
      aria-label={`${fmtMoney2(value)} of work times ${fmtPct(ccv, 0)} Canadian content times ${multiplier} (${multCaption}) equals ${fmtMoney2(credit)} credit`}
    >
      {tiles.map((t, i) => (
        <Frag key={t.cap} op={i < ops.length ? ops[i] : null}>
          <div
            title={t.title}
            className={cn(
              "flex min-w-[6.5rem] flex-1 flex-col items-center justify-center rounded-lg border px-3 py-2.5 text-center",
              t.tone === "strong"
                ? "border-assigned/30 bg-assigned-soft"
                : t.tone === "accent"
                  ? "border-slate-300 bg-slate-50"
                  : "border-border bg-card"
            )}
          >
            <span
              className={cn(
                "text-xl leading-tight font-semibold tracking-tight tabular-nums sm:text-2xl",
                t.tone === "strong" ? "text-assigned" : "text-foreground"
              )}
            >
              {t.v}
            </span>
            <span className="mt-0.5 text-xs text-muted-foreground">{t.cap}</span>
          </div>
        </Frag>
      ))}
    </div>
  )
}

function Frag({ children, op }: { children: React.ReactNode; op: string | null }) {
  return (
    <>
      {children}
      {op ? (
        <span className="self-center px-0.5 text-lg font-medium text-muted-foreground" aria-hidden>
          {op}
        </span>
      ) : null}
    </>
  )
}
