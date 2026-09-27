"use client"

import type * as React from "react"
import Link from "next/link"
import { ArrowRight, Factory, HardHat, Landmark } from "lucide-react"

import { SignInCards } from "@/components/auth/sign-in-cards"
import { RunDemoButton } from "@/components/muster/run-demo-button"
import { Term } from "@/components/muster/term"
import { useDemo } from "@/lib/data/store"
import { c } from "@/lib/ui/copy"
import { cb } from "@/lib/ui/copy-b"
import { atLeast, stepHref } from "@/lib/ui/steps"
import { useWithParams } from "@/lib/ui/use-with-params"
import { cn } from "@/lib/utils"

import { FlowDiagram } from "./flow-diagram"

/**
 * The landing page `/` (docs/ux-simplification.md §4): what Muster does in 3 panels,
 * the flow diagram, then one button. Everything above the fold at 1280×720; the demo
 * sign-in cards sit below the fold ("Or sign in as…").
 */
export function LandingView() {
  const { stage, demoShopId } = useDemo()
  const wp = useWithParams()
  const reached = atLeast(stage, "routed")

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col px-4 sm:px-6">
      <section className="flex flex-col gap-4 pt-5 pb-8 sm:gap-5" aria-labelledby="landing-h1">
        <header className="flex flex-col gap-2">
          <h1
            id="landing-h1"
            className="max-w-[26ch] text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance text-foreground sm:max-w-none sm:text-[2.5rem]"
          >
            {c("landing.h1")}
          </h1>
          <p className="max-w-[68rem] text-base leading-snug text-slate-700 sm:text-lg">{c("app.sentence")}</p>
        </header>

        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
          <Panel
            icon={<Landmark className="size-6" aria-hidden />}
            title={c("landing.p1.title")}
            body={c("landing.p1.body")}
            caption={<CaptionWithTerm text={c("landing.p1.caption")} />}
          />
          <Panel
            icon={<Factory className="size-6" aria-hidden />}
            title={c("landing.p2.title")}
            body={c("landing.p2.body")}
          />
          <Panel
            icon={<HardHat className="size-6" aria-hidden />}
            title={c("landing.p3.title")}
            body={c("landing.p3.body")}
          />
        </ul>

        <FlowDiagram compact />

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
            {/* RunDemoButton directly (not AutoNextStep): it must stay mounted while the stage moves
                to "routed" so it can finish by navigating to /program#map. */}
            <RunDemoButton upTo="routed" navigateTo="/program#map" label={reached ? undefined : c("run.start")} size="xl" />
            <p className="max-w-[22rem] text-sm leading-snug text-slate-600">
              {reached ? cb("landing.run.continueSub") : c("run.start.sub")}
            </p>
          </div>
          <nav aria-label="More ways in" className="flex flex-wrap gap-x-5 gap-y-1.5 text-[15px]">
            <TextLink href={wp(stepHref("shop", demoShopId ?? "syn-012"))}>{c("landing.link.shop")}</TextLink>
            <TextLink href={wp("/network")}>{c("landing.link.dir")}</TextLink>
            <TextLink href={wp("/m")}>{c("landing.link.phone")}</TextLink>
          </nav>
        </div>

        <p className="text-[13px] leading-snug text-muted-foreground" data-honesty>
          {c("honesty")}
        </p>
      </section>

      <section
        className="flex flex-col gap-4 border-t border-border pt-8 pb-12"
        aria-labelledby="landing-signin"
        data-landing-signin
      >
        <header className="flex flex-col gap-1">
          <h2 id="landing-signin" className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {cb("landing.signin.title")}
          </h2>
          <p className="max-w-3xl text-[15px] text-slate-700">{cb("landing.signin.sub")}</p>
        </header>
        <SignInCards showWatchLink={false} />
      </section>
    </div>
  )
}

function Panel({
  icon,
  title,
  body,
  caption,
}: {
  icon: React.ReactNode
  title: string
  body: string
  caption?: React.ReactNode
}) {
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-card px-4 py-3.5 shadow-xs">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-800">
          {icon}
        </span>
        <h2 className="text-[1.05rem] leading-snug font-semibold text-foreground">{title}</h2>
      </div>
      <p className="text-[15px] leading-snug text-slate-700">{body}</p>
      {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
    </li>
  )
}

/** "Canada's ITB rule, simplified for this demo" with ITB as a <Term> (hover explains it). */
function CaptionWithTerm({ text }: { text: string }) {
  const at = text.indexOf("ITB")
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <Term k="ITB">ITB</Term>
      {text.slice(at + 3)}
    </>
  )
}

function TextLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 font-medium text-slate-800 underline-offset-4 hover:text-foreground hover:underline"
      )}
    >
      {children.replace(/\s*→$/, "")}
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  )
}
