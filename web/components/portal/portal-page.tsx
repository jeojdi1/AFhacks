"use client"

import type * as React from "react"
import Link from "next/link"
import { ArrowRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Role } from "@/lib/auth/accounts"
import { RoleBanner } from "./role-banner"

/** Page frame for a role portal: soft-gating banner, title block, content. */
export function PortalPage({
  role,
  desk,
  eyebrow,
  title,
  lede,
  badges,
  children,
  testId,
}: {
  role: Role
  /** "Northgate's desk", used in the soft-gating banner. */
  desk: string
  eyebrow: React.ReactNode
  title: React.ReactNode
  /** One plain sentence: what this screen is for. */
  lede: React.ReactNode
  badges?: React.ReactNode
  children: React.ReactNode
  testId?: string
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8" data-testid={testId}>
      <RoleBanner role={role} desk={desk} />
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-[2rem]">{title}</h1>
          {badges}
        </div>
        <p className="max-w-3xl text-base leading-relaxed text-slate-700 sm:text-lg">{lede}</p>
      </header>
      {children}
    </div>
  )
}

/** A card with a heading and optional action link in the corner. */
export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
  id,
  testId,
}: {
  title: React.ReactNode
  icon?: LucideIcon
  action?: { label: string; href: string } | null
  children: React.ReactNode
  className?: string
  id?: string
  testId?: string
}) {
  const headingId = id ? `${id}-title` : undefined
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-testid={testId}
      className={cn("flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-5", className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {Icon ? <Icon className="size-5 text-muted-foreground" aria-hidden /> : null}
          {title}
        </h2>
        {action ? (
          <Link href={action.href} className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
            {action.label} →
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/** Big navigation button: icon, label, one-line hint. */
export function BigAction({
  href,
  icon: Icon,
  label,
  hint,
  primary,
  external,
}: {
  href: string
  icon: LucideIcon
  label: string
  hint: string
  primary?: boolean
  /** Opens a route owned by another app surface (e.g. /m); still same-origin. */
  external?: boolean
}) {
  return (
    <Link
      href={href}
      prefetch={external ? false : undefined}
      className={cn(
        "group flex min-h-20 items-center gap-3 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring",
        primary
          ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
          : "border-border bg-card text-foreground hover:border-slate-400 hover:bg-muted/50"
      )}
    >
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-lg",
          primary ? "bg-white/15" : "bg-secondary"
        )}
      >
        <Icon className="size-6" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[1.05rem] leading-snug font-semibold">{label}</span>
        <span className={cn("text-sm", primary ? "text-background/80" : "text-muted-foreground")}>{hint}</span>
      </span>
      <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
    </Link>
  )
}
