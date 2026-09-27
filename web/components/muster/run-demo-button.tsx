"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, LoaderCircle, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { c } from "@/lib/ui/copy"
import { atLeast, firstOpenStep, withParams } from "@/lib/ui/steps"
import { Button } from "@/components/ui/button"

const SIZE = {
  lg: "h-11 px-4 text-[0.95rem]",
  xl: "h-14 px-7 text-lg font-semibold",
} as const

/**
 * One click to reach a stage (docs/ux-simplification.md §4, §5.0). Only calls existing
 * useDemo() methods; funding is never automatic.
 *
 * - stage below `upTo`: uploads (and routes, for upTo="routed"), then navigates to `navigateTo`
 *   if given, else stays on the page.
 * - stage already at `upTo` (e.g. landing after routing): "Continue the demo →" to the first
 *   step that isn't done, plus a small "Start over" link.
 */
export function RunDemoButton({
  upTo = "routed",
  navigateTo,
  label,
  size = "lg",
  showStartOver = true,
  className,
}: {
  upTo?: "uploaded" | "routed"
  navigateTo?: string
  label?: string
  size?: keyof typeof SIZE
  showStartOver?: boolean
  className?: string
}) {
  const router = useRouter()
  const { stage, uploadParts, route, reset, busy, ready, demoShopId, offerStatus } = useDemo()
  const [phase, setPhase] = React.useState<"upload" | "route" | "reset" | null>(null)
  const reached = atLeast(stage, upTo)
  // Latest stage, so a failed upload (the store toasts and swallows errors) stops before routing.
  const stageRef = React.useRef(stage)
  React.useEffect(() => {
    stageRef.current = stage
  }, [stage])

  /** Wait (≤ 1.5 s) for the committed stage to reach `s`; false if the action failed. */
  const reachedStage = async (s: "uploaded" | "routed") => {
    for (let i = 0; i < 30; i++) {
      if (atLeast(stageRef.current, s)) return true
      await new Promise((r) => setTimeout(r, 50))
    }
    return atLeast(stageRef.current, s)
  }

  const anyAccepted = Object.entries(offerStatus).some(
    ([k, v]) => v === "accepted" && (!demoShopId || k.startsWith(`${demoShopId}:`))
  )

  const run = async () => {
    try {
      if (reached) {
        router.push(withParams(firstOpenStep(stage, demoShopId, anyAccepted).href))
        return
      }
      if (stage === "empty") {
        setPhase("upload")
        await uploadParts()
        if (!(await reachedStage("uploaded"))) return
      }
      if (upTo === "routed") {
        setPhase("route")
        await route()
        if (!(await reachedStage("routed"))) return
      }
      if (navigateTo) router.push(withParams(navigateTo))
    } finally {
      setPhase(null)
    }
  }

  const startOver = async () => {
    setPhase("reset")
    try {
      await reset()
    } finally {
      setPhase(null)
    }
  }

  const working = phase !== null || !!busy
  const busyText =
    phase === "upload"
      ? c("busy.upload")
      : phase === "route"
        ? c("busy.route")
        : phase === "reset"
          ? c("busy.reset")
          : busy
  const text = reached && navigateTo !== undefined ? c("run.continue") : (label ?? (reached ? c("run.continue") : upTo === "routed" ? c("run.loadAndMatch") : c("program.next.load")))
  const shownText = text.replace(/\s*→\s*$/, "")
  const arrow = /→\s*$/.test(text)

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <Button
        onClick={() => void run()}
        disabled={!ready || working}
        aria-busy={working || undefined}
        data-run-demo
        className={cn("gap-2 shadow-sm", SIZE[size])}
      >
        {working ? <LoaderCircle className="animate-spin" aria-hidden /> : reached ? null : <Play aria-hidden />}
        <span aria-live="polite">{working && busyText ? busyText : shownText}</span>
        {!working && arrow ? <ArrowRight aria-hidden /> : null}
      </Button>
      {reached && showStartOver && navigateTo !== undefined ? (
        <button
          type="button"
          onClick={() => void startOver()}
          disabled={!ready || working}
          aria-label={c("nav.startOver.aria")}
          className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
        >
          {c("run.startOver")}
        </button>
      ) : null}
    </span>
  )
}
