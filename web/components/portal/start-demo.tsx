"use client"

// Shown on a desk before Northgate's parts list is matched: one button that
// loads the demo parts list and matches it (it stops at "matched"; funding is
// never automatic), or a link to the parts-list screen.

import Link from "next/link"
import { LoaderCircle, PlayCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { useSession } from "@/lib/auth/session"
import { Button, buttonVariants } from "@/components/ui/button"

export function useRouted(): boolean {
  const { stage } = useDemo()
  return stage === "routed" || stage === "funded"
}

/** Only Northgate (prime) and signed-out Story mode may load and match the parts list. */
const WAITING_ROLES = new Set(["shop", "college", "trainee"])

export function StartDemo({
  message,
  roleMessage,
  className,
}: {
  message: string
  /** Shown instead of `message` to shop, college and trainee sessions (who get no button). */
  roleMessage?: string
  className?: string
}) {
  const { stage, busy, ready, uploadParts, route } = useDemo()
  const { session, hydrated } = useSession()
  const running = !!busy && ready
  const waiting = !!session && WAITING_ROLES.has(session.role)
  // Until the session is known show no button, so a shop never sees it flash in and out.
  const showActions = hydrated && !waiting

  const run = async () => {
    if (stage === "empty") await uploadParts()
    await route()
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 bg-muted/40 p-5 sm:flex-row sm:items-center",
        className
      )}
      data-testid="start-demo"
    >
      <p className="min-w-0 flex-1 text-[0.95rem] text-slate-700" data-empty-role={waiting ? session?.role : undefined}>
        {waiting ? (roleMessage ?? message) : message}
      </p>
      {showActions ? (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="touch" onClick={() => void run()} disabled={!ready || !!busy}>
          {running ? (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" data-icon="inline-start" aria-hidden />
          ) : (
            <PlayCircle data-icon="inline-start" aria-hidden />
          )}
          {running ? busy : "Load and match the parts list"}
        </Button>
        <Link href="/program" className={cn(buttonVariants({ variant: "ghost", size: "touch" }))}>
          Open the parts list
        </Link>
      </div>
      ) : null}
    </div>
  )
}
