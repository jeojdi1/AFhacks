import { cn } from "@/lib/utils"

/** Muster wordmark: a solid accent square with three stacked bars (a muster roll), no national symbols. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="flex size-8 flex-col items-start justify-center gap-[3px] rounded-lg bg-brand px-[7px] shadow-[inset_0_-2px_0_rgb(0_0_0/0.15)]"
      >
        <span className="h-[3px] w-full rounded-full bg-white" />
        <span className="h-[3px] w-3/4 rounded-full bg-white/85" />
        <span className="h-[3px] w-1/2 rounded-full bg-white/70" />
      </span>
      <span className="text-[1.2rem] font-semibold tracking-tight text-foreground">Muster</span>
    </span>
  )
}
