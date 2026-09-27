"use client"

import type * as React from "react"
import Link from "next/link"
import { ArrowRight, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { useSession } from "@/lib/auth/session"
import type { Role } from "@/lib/auth/accounts"
import { c } from "@/lib/ui/copy"
import { RunDemoButton } from "./run-demo-button"

/**
 * Only Northgate (prime) and signed-out Story mode may load and match the parts list. From any
 * other desk a `run` empty state explains the wait instead of offering the button.
 */
const ROLE_LINE: Partial<Record<Role, string>> = {
  shop: "empty.role.shop",
  college: "empty.role.partner",
  trainee: "empty.role.partner",
}

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
 *
 * `run` is ignored for shop, college and trainee sessions: they get one line of role copy
 * (empty.role.*) in place of `body` and no button. Prime and signed-out viewers keep the button.
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
  const { session, hydrated } = useSession()
  const lineKey = run && session ? ROLE_LINE[session.role] : undefined
  let roleLine = lineKey ? c(lineKey) : undefined
  // "Northgate hasn't sent offers yet." is often the title already: don't say it twice.
  if (roleLine && typeof title === "string" && roleLine.startsWith(title) && roleLine.length > title.length) {
    roleLine = roleLine.slice(title.length).trim()
  }
  // Until the session is known (server render, first client render) show no button, so a shop
  // never sees it flash in and out.
  const showRun = !!run && hydrated && !lineKey
  const act: EmptyAction | undefined =
    action ?? (showRun ? <RunDemoButton upTo="routed" label={typeof run === "object" ? run.label : undefined} /> : undefined)
  const text = roleLine ?? body
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
      {text ? (
        <p className="max-w-md text-sm text-muted-foreground" data-empty-role={lineKey ? session?.role : undefined}>
          {text}
        </p>
      ) : null}
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
