import type * as React from "react"
import Link from "next/link"
import { ArrowRight, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { RunDemoButton } from "./run-demo-button"

type EmptyAction = React.ReactNode | { label: string; href: string }

function isLinkAction(a: EmptyAction): a is { label: string; href: string } {
  return typeof a === "object" && a !== null && !Array.isArray(a) && "href" in a && "label" in a
}

/**
 * Placeholder shown when the demo has not reached this step yet. Empty states perform the
 * prerequisite in one click (docs/ux-simplification.md §5.0):
 *
 *   <EmptyState title={c("score.empty.title")} body={c("score.empty.body")}
 *               action={<RunDemoButton upTo="routed" label={c("run.loadAndMatch")} />} />
 *   <EmptyState … run />                       // shorthand for the same button
 *   <EmptyState … run={{ label: c("run.loadAndMatch.shop") }} />
 */
export function EmptyState({
  title,
  body,
  action,
  icon,
  run,
  className,
}: {
  title: React.ReactNode
  body?: React.ReactNode
  /** A ReactNode, or { label, href } for a primary link button (e.g. to /program). */
  action?: EmptyAction
  icon?: React.ReactNode
  /** Render a RunDemoButton (load + match, staying on this page) when no `action` is given. */
  run?: boolean | { label?: string }
  className?: string
}) {
  const act: EmptyAction | undefined =
    action ?? (run ? <RunDemoButton upTo="routed" label={typeof run === "object" ? run.label : undefined} /> : undefined)
  return (
    <div
      data-empty-state
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted px-6 py-14 text-center",
        className
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
        {icon ?? <Inbox className="size-5" aria-hidden />}
      </div>
      <div className="text-lg font-semibold text-foreground">{title}</div>
      {body ? <p className="max-w-md text-sm text-muted-foreground">{body}</p> : null}
      {act ? (
        <div className="mt-2">
          {isLinkAction(act) ? (
            <Link href={act.href} className={cn(buttonVariants({ size: "lg" }), "px-4")}>
              {act.label}
              <ArrowRight data-icon="inline-end" />
            </Link>
          ) : (
            act
          )}
        </div>
      ) : null}
    </div>
  )
}
