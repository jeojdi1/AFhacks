import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Compass, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Page not found · Muster",
}

/** Any unknown route. Renders inside the Muster shell (header and footer come from the root layout). */
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col items-start gap-5 px-4 py-12 sm:px-6 sm:py-16">
      <span className="flex size-12 items-center justify-center rounded-xl bg-secondary text-slate-600">
        <Compass className="size-6" aria-hidden />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-[2rem]">
          This page doesn&apos;t exist
        </h1>
        <p className="text-base leading-relaxed text-slate-700 sm:text-lg">
          The link may be old or mistyped. Nothing in the demo was changed.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className={cn(buttonVariants({ size: "lg" }), "h-11 gap-2 px-4 text-[0.95rem]")} data-testid="not-found-home">
          <ArrowLeft aria-hidden />
          Back to start
        </Link>
        <Link
          href="/m"
          prefetch={false}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 gap-2 px-4 text-[0.95rem]")}
        >
          <Smartphone aria-hidden />
          Phone app
        </Link>
      </div>
    </div>
  )
}
