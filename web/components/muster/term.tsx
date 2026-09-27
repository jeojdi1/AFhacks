"use client"

import { useId, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { GLOSSARY } from "@/lib/format"
import { plainFor } from "@/lib/ui/plain"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * A term with a dotted underline; hover or focus shows its plain-language meaning
 * (docs/ux-simplification.md §2).
 *
 *   <Term k="CGP" first />   → "Security-cleared (Controlled Goods)"   (PLAIN.first)
 *   <Term k="CGP" />         → "security-cleared"                       (PLAIN.label)
 *   <Term k="CGP">CGP</Term> → custom visible text, same tooltip
 *   <Term abbr="CWB" />      → legacy: visible text = the key, tooltip from PLAIN (else GLOSSARY)
 *
 * Always renders a native `title` as well, so hover shows the meaning even if the tooltip fails.
 */
export function Term({
  k,
  abbr,
  first,
  children,
  className,
}: {
  /** Key into PLAIN (PlainKey or alias such as "SME", "CWB"). */
  k?: string
  /** Legacy prop: key into PLAIN/GLOSSARY; visible text defaults to the key itself. */
  abbr?: string
  /** Render PLAIN.first (the screen's first use: "plain label (ACRONYM)"). */
  first?: boolean
  /** Visible text override. */
  children?: ReactNode
  className?: string
}) {
  const id = useId()
  const key = k ?? abbr ?? ""
  const plain = plainFor(key)
  const tip = plain?.tip || GLOSSARY[key] || ""
  const visible: ReactNode = children ?? (k && plain ? (first ? plain.first : plain.label) : key)
  if (!tip) return <>{visible}</>
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={<abbr />}
          tabIndex={0}
          title={tip}
          aria-describedby={id}
          data-term={key}
          className={cn("cursor-help underline decoration-slate-500 decoration-dotted underline-offset-4", className)}
        >
          {visible}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{tip}</TooltipContent>
      </Tooltip>
      {/* Screen readers get the meaning as the description even when the tooltip is closed. */}
      <span id={id} hidden>
        {tip}
      </span>
    </>
  )
}
