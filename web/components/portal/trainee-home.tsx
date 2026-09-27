"use client"

// /trainee: the trainee's seat lives in the phone app. Signed in as the
// trainee → go straight to /m/trainee/TP-01?seat=3; otherwise show the link.

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, HardHat } from "lucide-react"
import { cn } from "@/lib/utils"
import { TRAINEE_SEAT_HREF } from "@/lib/auth/accounts"
import { useSession } from "@/lib/auth/session"
import { buttonVariants } from "@/components/ui/button"
import { RoleBanner } from "./role-banner"
import { usePackageFunded } from "./use-funded"

/** The trainee's seat belongs to training plan TP-01 (TRAINEE_SEAT_HREF). */
const SEAT_PACKAGE = "TP-01"

export function TraineeHome() {
  const router = useRouter()
  const { session, hydrated, signIn } = useSession()
  const isTrainee = session?.role === "trainee"
  // Same funding check as the phone's seat card, so this page and "Open my seat" agree.
  const funded = usePackageFunded()(SEAT_PACKAGE)

  React.useEffect(() => {
    if (hydrated && isTrainee) router.replace(TRAINEE_SEAT_HREF)
  }, [hydrated, isTrainee, router])

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6" data-testid="trainee-home">
      <RoleBanner role="trainee" desk="the trainee's seat" />
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
        <span className="flex size-12 items-center justify-center rounded-lg bg-secondary">
          <HardHat className="size-6" aria-hidden />
        </span>
        <p className="text-sm font-medium text-muted-foreground">Seat 3 of 4 · TP-01 · pseudonymous</p>
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">Your training seat</h1>
        <p className="text-base leading-relaxed text-slate-700" data-testid="trainee-funding" data-funded={funded ? "yes" : "no"}>
          {funded ? (
            <>
              Northgate paid for this welder training seat. Follow it from enrolment to your welding test, and see the
              shop job waiting after it. It opens in the phone app.
            </>
          ) : (
            <>
              Northgate is deciding whether to fund this welder training seat. Once it does, follow it from enrolment to
              your welding test, and see the shop job waiting after it. It opens in the phone app.
            </>
          )}
        </p>
        {hydrated && isTrainee ? (
          <p className="text-sm text-muted-foreground" role="status">
            Opening your seat…
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Link href={TRAINEE_SEAT_HREF} className={cn(buttonVariants({ size: "touch" }))} prefetch={false}>
            Open my seat
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Link>
          {hydrated && !isTrainee ? (
            <button
              type="button"
              className={cn(buttonVariants({ variant: "outline", size: "touch" }))}
              onClick={() => signIn("trainee")}
            >
              Sign in as the trainee
            </button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">No personal names are stored. Demo sign-in — fictional accounts, no real authentication.</p>
      </div>
    </div>
  )
}
