import { cn } from "@/lib/utils"

/** Shieldworks wordmark: a brand-red rounded square holding a white shield, no national symbols. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <ShieldTile className="size-8" />
      <span className="text-[1.2rem] font-semibold tracking-tight text-foreground">Shieldworks</span>
    </span>
  )
}

/** The Shieldworks mark on its own (brand-red tile + white shield with two work bars). */
export function ShieldTile({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center justify-center rounded-lg bg-brand shadow-[inset_0_-2px_0_rgb(0_0_0/0.15)]",
        className
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[70%]" fill="none">
        <path d="M12 1.8l8.2 3.1v6.3c0 5.2-3.5 9.7-8.2 11-4.7-1.3-8.2-5.8-8.2-11V4.9L12 1.8z" fill="#ffffff" />
        <rect x="8" y="9" width="8" height="1.8" rx="0.9" fill="#b42318" />
        <rect x="8" y="12.4" width="5.5" height="1.8" rx="0.9" fill="#b42318" />
      </svg>
    </span>
  )
}
