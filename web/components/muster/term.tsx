"use client"

import type * as React from "react"
import { cn } from "@/lib/utils"
import { GLOSSARY } from "@/lib/format"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** An acronym with a dotted underline; hover or focus shows its plain-language meaning. */
export function Term({
  abbr,
  children,
  className,
}: {
  /** Key into GLOSSARY, e.g. "CWB". */
  abbr: string
  /** Visible text (defaults to the acronym itself). */
  children?: React.ReactNode
  className?: string
}) {
  const meaning = GLOSSARY[abbr]
  if (!meaning) return <>{children ?? abbr}</>
  return (
    <Tooltip>
      <TooltipTrigger
        render={<abbr />}
        tabIndex={0}
        className={cn("cursor-help underline decoration-slate-400 decoration-dotted underline-offset-4", className)}
      >
        {children ?? abbr}
      </TooltipTrigger>
      <TooltipContent>{meaning}</TooltipContent>
    </Tooltip>
  )
}
