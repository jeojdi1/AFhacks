"use client"

import { WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { Button } from "@/components/ui/button"

/**
 * Laptop twin of the phone's UnreachableNotice (components/mobile/shell/unreachable-notice.tsx).
 * Shown in place of a step's empty state when `useDemo().loadFailed`: live mode, the engine did
 * not answer at load and nothing was saved from an earlier live load, so "No credit yet" or
 * "Northgate owes Canada $500M" would be a guess, not a fact. The engine watcher reconnects on
 * its own (every few seconds) and the page fills in; "Use demo data" switches to the fixtures.
 */
export function EngineUnreachable({ className }: { className?: string }) {
  const { setMode } = useDemo()
  return (
    <div
      role="status"
      data-testid="engine-unreachable"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted px-6 py-14 text-center",
        className
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
        <WifiOff className="size-5" aria-hidden />
      </div>
      <div className="text-lg font-semibold text-foreground">Can&apos;t reach Shieldworks right now</div>
      <p className="max-w-md text-sm text-muted-foreground">
        The numbers will appear here when it&apos;s back. Shieldworks keeps trying on its own.
      </p>
      <Button variant="outline" size="lg" className="mt-2 bg-background px-4" onClick={() => setMode("fixtures")}>
        Use demo data instead
      </Button>
    </div>
  )
}
