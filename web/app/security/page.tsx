import type { Metadata } from "next"
import Link from "next/link"
import { Check, Lock, ShieldCheck } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { DEMO_FACTS, SECURITY_LAYERS } from "@/lib/security/layers"

export const metadata: Metadata = {
  title: "Security and demo notice · Shieldworks",
}

/** What this demo does today vs the security layer Shieldworks runs with in production (planned). */
export default function SecurityPage() {
  const active = SECURITY_LAYERS.filter((l) => l.activeNow).length
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-3">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-amber-900 uppercase">
          Demo only
        </span>
        <h1 className="flex items-center gap-2.5 text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-[2rem]">
          <ShieldCheck className="size-7 shrink-0 text-brand" aria-hidden />
          Security and demo notice
        </h1>
        <p className="max-w-[760px] text-base leading-relaxed text-slate-700 sm:text-lg">
          This site is a demo. It holds no real contracts, drawings or personal information. Defence supply chains
          do, so in production Shieldworks runs behind the security layer below.{" "}
          <strong className="font-semibold text-foreground">{active} of {SECURITY_LAYERS.length}</strong> controls are
          already enforced in this demo; the rest are planned and not active here.
        </p>
        <ul className="flex flex-col gap-1 text-[15px] leading-snug text-slate-700">
          {DEMO_FACTS.map((f) => (
            <li key={f} className="flex gap-2">
              <span aria-hidden className="mt-[8px] size-1.5 shrink-0 rounded-full bg-slate-400" />
              {f}
            </li>
          ))}
        </ul>
      </header>

      <section aria-labelledby="layers" className="overflow-hidden rounded-xl border border-border bg-card">
        <h2 id="layers" className="sr-only">
          Security layers
        </h2>
        <div className="hidden grid-cols-[1.1fr_1.3fr_1.6fr] gap-4 border-b border-border bg-muted px-5 py-2.5 text-[13px] font-semibold text-slate-600 md:grid">
          <span>Control</span>
          <span>In this demo</span>
          <span>In production (planned)</span>
        </div>
        <ul>
          {SECURITY_LAYERS.map((l) => (
            <li
              key={l.key}
              className="grid gap-2 border-b border-border px-5 py-4 last:border-b-0 md:grid-cols-[1.1fr_1.3fr_1.6fr] md:gap-4"
            >
              <div className="flex gap-2.5">
                {l.activeNow ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
                ) : (
                  <Lock className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
                )}
                <div className="flex flex-col gap-1">
                  <span className="text-[15px] leading-snug font-semibold">{l.title}</span>
                  <span
                    className={cn(
                      "w-fit rounded-full px-2 py-0.5 text-[12px] font-medium",
                      l.activeNow ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {l.activeNow ? "Enforced now" : "Planned · not active in demo"}
                  </span>
                </div>
              </div>
              <p className="text-[14px] leading-relaxed text-slate-700">
                <span className="font-medium text-slate-500 md:hidden">In this demo: </span>
                {l.demo}
              </p>
              <p className="text-[14px] leading-relaxed text-slate-700">
                <span className="font-medium text-slate-500 md:hidden">In production: </span>
                {l.production}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <p className="max-w-[760px] text-[14px] leading-relaxed text-muted-foreground">
        Shieldworks will register with the Controlled Goods Program before it handles any technical data. Until then it
        never stores drawings. Production controls are a plan, not a certification.
      </p>

      <div>
        <Link href="/" className={cn(buttonVariants({ size: "lg" }), "h-11 px-4 text-[0.95rem]")}>
          Back to the demo
        </Link>
      </div>
    </div>
  )
}
