"use client"

// Soft role gating: every desk is open to everyone (demo-friendly), with a
// banner when the viewer is signed out or signed in as a different account.
// Signed out in Story mode (the video / judge path) it shrinks to a one-line chip, and
// a page opened from the phone app (?from=m) shows nothing: the phone already chose the role.

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Eye } from "lucide-react"
import { accountFor, type Role } from "@/lib/auth/accounts"
import { useSession } from "@/lib/auth/session"
import { useStoryMode } from "@/lib/ui/story-mode"
import { ROLE_NOUN } from "@/components/auth/role-icon"

const noopSubscribe = () => () => {}
const readFromPhone = () => {
  try {
    return new URLSearchParams(window.location.search).get("from") === "m"
  } catch {
    return false
  }
}
const serverFromPhone = () => false

/** True on a desktop page opened from the phone app (?from=m). Hydration-safe. */
export function useFromPhone(): boolean {
  usePathname() // re-read on navigation
  return React.useSyncExternalStore(noopSubscribe, readFromPhone, serverFromPhone)
}

export function RoleBanner({ role, desk }: { role: Role; desk: string }) {
  const { session, hydrated, signIn } = useSession()
  const { story } = useStoryMode()
  const fromPhone = useFromPhone()
  if (!hydrated || session?.role === role) return null
  const owner = accountFor(role)
  const viewer = session ? ROLE_NOUN[session.role] : null

  if (!session && fromPhone) return null

  if (!session && story) {
    return (
      <p
        role="status"
        data-testid="role-banner"
        data-compact
        className="-mb-3 inline-flex w-fit max-w-full items-center gap-1.5 self-start rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-muted-foreground"
      >
        <Eye className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">Viewing as {owner?.short ?? desk} (demo)</span>
        <span aria-hidden>·</span>
        <Link href="/signin" className="shrink-0 font-medium text-slate-700 underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    )
  }

  return (
    <div
      role="status"
      data-testid="role-banner"
      className="flex flex-col items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-[0.95rem] text-slate-700 sm:flex-row sm:items-center sm:gap-3"
    >
      <p className="flex min-w-0 flex-1 items-start gap-2">
        <Eye className="mt-1 size-4 shrink-0 text-slate-500" aria-hidden />
        <span className="min-w-0">
          {viewer ? (
            <>
              You&apos;re viewing {desk} as {viewer} —{" "}
              <Link href="/signin" className="font-medium text-foreground underline underline-offset-4">
                switch account
              </Link>
            </>
          ) : (
            <>
              You&apos;re viewing {desk} without signing in —{" "}
              <Link href="/signin" className="font-medium text-foreground underline underline-offset-4">
                choose an account
              </Link>
            </>
          )}
        </span>
      </p>
      {owner ? (
        <button
          type="button"
          onClick={() => signIn(role)}
          className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
        >
          Sign in as {owner.org}
        </button>
      ) : null}
    </div>
  )
}
