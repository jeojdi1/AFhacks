import type * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Title + one-sentence explanation. Use size="page" for the top of every page
 * (the video narrator relies on it), default "section" for blocks within a page.
 */
export function SectionHeader({
  title,
  subtitle,
  right,
  eyebrow,
  size = "section",
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  right?: React.ReactNode
  eyebrow?: React.ReactNode
  size?: "page" | "section"
  className?: string
}) {
  const Heading = size === "page" ? "h1" : "h2"
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", size === "page" ? "mb-6" : "mb-4", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</div>
        ) : null}
        <Heading
          className={cn(
            "font-semibold tracking-tight text-foreground",
            size === "page" ? "text-[1.75rem] leading-tight" : "text-lg"
          )}
        >
          {title}
        </Heading>
        {subtitle ? (
          <p className={cn("mt-1 max-w-3xl text-muted-foreground", size === "page" ? "text-base" : "text-sm")}>{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  )
}
