"use client"

import type * as React from "react"
import { Eye } from "lucide-react"
import { cn } from "@/lib/utils"
import { c } from "@/lib/ui/copy"
import { STEPS } from "@/lib/ui/steps"
import { useStoryChrome } from "@/components/shell/chrome-gate"

/**
 * The card directly under the story bar on every story page (docs/ux-simplification.md §5.0).
 * Always visible, in Story mode and detail mode alike.
 *
 *   <StoryBanner step={2} summary={<Rich text={c("program.b2", {...})} />} lookAt={c("program.b2.look")}
 *                next={<AutoNextStep />} secondary={<Link …>Why are 4 stuck? →</Link>} />
 */
export function StoryBanner({
  step,
  tone,
  summary,
  lookAt,
  next,
  secondary,
  eyebrow,
  className,
}: {
  /** 1–5, or null for the Shops directory ("extra"). */
  step: 1 | 2 | 3 | 4 | 5 | null
  /** Defaults: step 5 → "shop", no step → "extra", else "prime". */
  tone?: "prime" | "shop" | "extra"
  summary: React.ReactNode
  lookAt?: React.ReactNode
  next?: React.ReactNode
  /** Small secondary link beside the Next button. */
  secondary?: React.ReactNode
  /** Override the eyebrow text. */
  eyebrow?: React.ReactNode
  className?: string
}) {
  // Northgate's numbered steps are the prime's story: hidden for a shop, college or trainee.
  const storyChrome = useStoryChrome()
  if (step !== null && !storyChrome) return null
  const t = tone ?? (step === 5 ? "shop" : step === null ? "extra" : "prime")
  const label = step ? STEPS[step - 1]?.label : null
  const eyebrowText = eyebrow ?? (step && label ? c("banner.step", { n: step, label }) : c("banner.extra"))

  return (
    <section
      data-story-banner
      data-tone={t}
      aria-label={typeof eyebrowText === "string" ? eyebrowText : undefined}
      className={cn(
        "mb-6 flex flex-col gap-4 rounded-xl border px-5 py-4 md:flex-row md:items-center md:justify-between md:gap-6 md:px-6",
        t === "shop" ? "border-teal-200 bg-teal-50/70" : t === "extra" ? "border-border bg-muted/60" : "border-border bg-card shadow-xs",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-xs font-semibold tracking-[0.08em] uppercase",
            t === "shop" ? "text-teal-800" : "text-muted-foreground"
          )}
        >
          {eyebrowText}
        </p>
        <div className="mt-1 text-lg leading-snug font-semibold text-balance text-foreground md:text-xl">{summary}</div>
        {lookAt ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-[15px] leading-snug text-muted-foreground">
            <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <span className="font-medium text-slate-700">{c("banner.lookAt")}</span> {lookAt}
            </span>
          </p>
        ) : null}
      </div>
      {next || secondary ? (
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 md:flex-col md:items-end">
          {next}
          {secondary ? <div className="text-sm">{secondary}</div> : null}
        </div>
      ) : null}
    </section>
  )
}
