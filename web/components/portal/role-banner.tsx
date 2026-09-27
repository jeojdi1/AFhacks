"use client"

// Soft role gating: every desk is open to everyone (demo-friendly), with a
// banner when the viewer is signed out or signed in as a different account.

import Link from "next/link"
import { Eye } from "lucide-react"
import { accountFor, type Role } from "@/lib/auth/accounts"
import { useSession } from "@/lib/auth/session"
import { ROLE_NOUN } from "@/components/auth/role-icon"

export function RoleBanner({ role, desk }: { role: Role; desk: string }) {
  const { session, hydrated, signIn } = useSession()
  if (!hydrated || session?.role === role) return null
  const owner = accountFor(role)
  const viewer = session ? ROLE_NOUN[session.role] : null

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
