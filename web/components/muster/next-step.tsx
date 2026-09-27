"use client"

import type * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowDown, ArrowRight, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { c } from "@/lib/ui/copy"
import { nextStep, scrollToFund } from "@/lib/ui/steps"
import { useWithParams } from "@/lib/ui/use-with-params"
import { Button, buttonVariants } from "@/components/ui/button"
import { RunDemoButton } from "./run-demo-button"

const SIZE = {
  lg: "h-11 px-4 text-[0.95rem]",
  xl: "h-14 px-6 text-base font-semibold",
} as const

/**
 * The page's one primary "Next step →" button (docs/ux-simplification.md §3.3).
 * Not sticky. Internal hrefs keep ?mode= and ?story=.
 *
 *   <NextStep label="See the credit Northgate earned →" href="/scorecard" />
 *   <NextStep label="Match jobs to shops →" onClick={route} busy={busy} />
 */
export function NextStep({
  label,
  href,
  onClick,
  busy = false,
  busyLabel,
  disabled,
  variant = "primary",
  size = "lg",
  className,
}: {
  label: React.ReactNode
  href?: string
  onClick?: () => void
  busy?: boolean
  busyLabel?: React.ReactNode
  disabled?: boolean
  variant?: "primary" | "secondary"
  size?: keyof typeof SIZE
  className?: string
}) {
  const wp = useWithParams()
  const text = typeof label === "string" ? label.replace(/\s*[→↓]\s*$/, "").replace(/^↓\s*/, "") : label
  const down = typeof label === "string" && label.trim().startsWith("↓")
  const arrow = typeof label === "string" && /[→]\s*$/.test(label)
  const bv = variant === "primary" ? "default" : "outline"
  // Extra classes only: <Button> adds its own variant classes, and `cn` here does not merge
  // Tailwind conflicts, so the variant must go through the prop (else outline renders white on white).
  const extra = cn(SIZE[size], "gap-2", variant === "primary" && "shadow-sm", className)
  const cls = cn(
    buttonVariants({ variant: bv, size: "lg" }),
    SIZE[size],
    "gap-2",
    variant === "primary" && "shadow-sm",
    className
  )
  const inner = (
    <>
      {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : down ? <ArrowDown aria-hidden /> : null}
      <span>{busy && busyLabel ? busyLabel : text}</span>
      {!busy && arrow ? <ArrowRight aria-hidden /> : null}
    </>
  )
  if (href && !onClick) {
    return (
      <Link href={wp(href)} className={cls} data-next-step>
        {inner}
      </Link>
    )
  }
  return (
    <Button
      onClick={onClick}
      variant={bv}
      size="lg"
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={extra}
      data-next-step
    >
      {inner}
    </Button>
  )
}

/**
 * NextStep wired to the §3.3 table for the current page: picks the label and does the right
 * thing (link, upload, route, scroll to the Fund button, or load + match in one click).
 */
export function AutoNextStep({
  blocked,
  size = "lg",
  className,
}: {
  /** Fills "Fix the {blocked} stuck jobs →" on the scorecard (defaults to the store's blocked count). */
  blocked?: number
  size?: keyof typeof SIZE
  className?: string
}) {
  const pathname = usePathname() ?? "/"
  const { stage, demoShopId, blocked: blockedJobs, offerStatus, uploadParts, route, busy, ready } = useDemo()
  const anyAccepted = Object.entries(offerStatus).some(
    ([k, v]) => v === "accepted" && (!demoShopId || k.startsWith(`${demoShopId}:`))
  )
  const spec = nextStep(pathname, stage, demoShopId, {
    blocked: blocked ?? (blockedJobs.length || undefined),
    anyAccepted,
  })

  if (spec.action === "run") {
    return <RunDemoButton upTo="routed" navigateTo={pathname === "/" ? spec.href : undefined} label={spec.label} size={size} className={className} />
  }
  if (spec.action === "upload") {
    return (
      <NextStep
        label={spec.label}
        onClick={() => void uploadParts()}
        busy={!!busy}
        busyLabel={c("busy.upload")}
        disabled={!ready}
        size={size}
        className={className}
      />
    )
  }
  if (spec.action === "route") {
    return (
      <NextStep
        label={spec.label}
        onClick={() => void route()}
        busy={!!busy}
        busyLabel={c("busy.route")}
        disabled={!ready}
        size={size}
        className={className}
      />
    )
  }
  if (spec.action === "scrollFund") {
    return <NextStep label={spec.label} onClick={() => void scrollToFund()} size={size} className={className} />
  }
  return <NextStep label={spec.label} href={spec.href} size={size} className={className} />
}
