"use client"

// <SignInCards />: four big demo-account cards. Used on /signin and exported
// for the landing page. Demo sign-in — fictional accounts, no real authentication.

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, CircleCheck, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { ACCOUNTS, DEMO_SIGNIN_LABEL, type Role } from "@/lib/auth/accounts"
import { useSession } from "@/lib/auth/session"
import { buttonVariants } from "@/components/ui/button"
import { ROLE_ICON } from "./role-icon"

export function DemoSignInNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-start gap-2 rounded-lg border border-dashed border-slate-400 bg-muted/60 px-3 py-2 text-sm text-slate-700",
        className
      )}
      data-testid="demo-signin-label"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
      <span>{DEMO_SIGNIN_LABEL}. Nothing is sent anywhere; your choice stays in this browser.</span>
    </p>
  )
}

export function SignInCards({
  className,
  /** Show the "Just watch the guided demo" link under the cards. */
  showWatchLink = true,
  /** Show the demo sign-in label above the cards. */
  showNote = true,
}: {
  className?: string
  showWatchLink?: boolean
  showNote?: boolean
}) {
  const router = useRouter()
  const { session, signIn } = useSession()

  const go = (role: Role) => {
    const acc = signIn(role)
    if (acc) router.push(acc.home)
  }

  return (
    <div className={cn("flex flex-col gap-4", className)} data-testid="signin-cards">
      {showNote ? <DemoSignInNote /> : null}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ACCOUNTS.map((a) => {
          const Icon = ROLE_ICON[a.role]
          const current = session?.role === a.role
          const headingId = `signin-${a.role}`
          return (
            <li key={a.role} className="min-w-0">
              <article
                aria-labelledby={headingId}
                data-role={a.role}
                className={cn(
                  "flex h-full flex-col gap-3 rounded-xl border bg-card p-5 transition-colors",
                  current ? "border-assigned ring-2 ring-assigned/30" : "border-border hover:border-slate-400"
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 id={headingId} className="text-lg leading-snug font-semibold tracking-tight">
                      {a.org}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {a.title} · <span className="text-slate-600">{a.label}</span>
                    </p>
                  </div>
                </div>
                <p className="text-[0.95rem] leading-relaxed text-slate-700">{a.does}</p>
                <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => go(a.role)}
                    className={cn(
                      buttonVariants({ size: "touch" }),
                      "min-w-40 bg-foreground text-background hover:bg-foreground/85"
                    )}
                    aria-label={`Sign in as ${a.who}`}
                  >
                    {current ? "Continue" : "Sign in"}
                    <ArrowRight data-icon="inline-end" aria-hidden />
                  </button>
                  {current ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-assigned">
                      <CircleCheck className="size-4" aria-hidden /> Signed in
                    </span>
                  ) : null}
                </div>
              </article>
            </li>
          )
        })}
      </ul>
      {showWatchLink ? (
        <p className="text-base">
          <Link href="/" className="font-medium text-foreground underline underline-offset-4 hover:text-slate-600">
            Just watch the guided demo →
          </Link>
        </p>
      ) : null}
    </div>
  )
}
