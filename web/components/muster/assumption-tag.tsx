"use client"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** Small dotted "assumption" pill. Hover shows why the number is an estimate. */
export function AssumptionTag({
  label = "assumption",
  note = "Estimate for demo; not an official figure",
  className,
}: {
  label?: string
  note?: string
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span />}
        tabIndex={0}
        className={cn(
          "inline-flex h-5 cursor-help items-center rounded-full border border-dashed border-slate-400 px-2 text-[13px] font-medium tracking-wide text-slate-600 lowercase select-none",
          className
        )}
      >
        {label}
      </TooltipTrigger>
      <TooltipContent>{note}</TooltipContent>
    </Tooltip>
  )
}
