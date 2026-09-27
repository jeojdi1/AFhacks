"use client"

import type * as React from "react"
import { ArrowDown, ArrowRight, Building2, ChevronUp, Factory, HardHat, RotateCcw } from "lucide-react"

import { useDemo } from "@/lib/data/store"
import { c } from "@/lib/ui/copy"
import { cn } from "@/lib/utils"

type Tone = "neutral" | "brand" | "done"

interface FlowNode {
  key: string
  title: string
  tag?: string
  body: string
  icon: React.ReactNode
  tone: Tone
}

/**
 * How Muster works, in four boxes (docs/ux-simplification.md §7.1). HTML + CSS only.
 * Northgate → Muster → Small Canadian shops → Welder training, with a green return arrow
 * from training back to the shops ("unsticks work"). Neutral slate; brand only on Muster.
 * Stacks vertically below 640 px. One role="img" with the §1 sentence as its label.
 */
export function FlowDiagram({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { assignments, stage } = useDemo()
  const routed = stage === "routed" || stage === "funded" || assignments.length > 0
  const shops = new Set(assignments.map((a) => a.shop_id)).size

  const iconCls = compact ? "size-5" : "size-6"
  const nodes: FlowNode[] = [
    {
      key: "prime",
      title: c("landing.flow.n1.title"),
      tag: c("landing.flow.n1.tag"),
      body: c("landing.flow.n1.body"),
      icon: <Building2 className={iconCls} aria-hidden />,
      tone: "neutral",
    },
    {
      key: "muster",
      title: c("landing.flow.n2.title"),
      body: c("landing.flow.n2.body"),
      icon: <MusterGlyph compact={compact} />,
      tone: "brand",
    },
    {
      key: "shops",
      title: c("landing.flow.n3.title"),
      body: routed && assignments.length
        ? c("landing.flow.n3.body", { assigned: assignments.length, shops })
        : c("landing.flow.n3.bodyEmpty"),
      icon: <Factory className={iconCls} aria-hidden />,
      tone: "neutral",
    },
    {
      key: "training",
      title: c("landing.flow.n4.title"),
      body: c("landing.flow.n4.body"),
      icon: <HardHat className={iconCls} aria-hidden />,
      tone: "neutral",
    },
  ]

  return (
    <figure role="img" aria-label={c("app.sentence")} data-flow-diagram className={cn("m-0 w-full", className)}>
      {/* ≥ 640 px: one row, arrows between, return arrow under nodes 3–4. */}
      <div
        className="hidden sm:grid"
        style={{ gridTemplateColumns: "minmax(0,1fr) 2rem minmax(0,1fr) 2rem minmax(0,1fr) 2rem minmax(0,1fr)" }}
      >
        {nodes.map((n, i) => (
          <Cell key={n.key} col={i * 2 + 1}>
            <Node node={n} compact={compact} />
          </Cell>
        ))}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center justify-center text-slate-500"
            style={{ gridColumn: i * 2 + 2, gridRow: 1 }}
          >
            <ArrowRight className="size-5" aria-hidden />
          </div>
        ))}
        <div className={cn("relative", compact ? "h-7" : "h-9")} style={{ gridColumn: "5 / 8", gridRow: 2 }}>
          <ReturnArrow compact={compact} />
        </div>
      </div>

      {/* < 640 px: stacked, arrows down; the return arrow becomes a green note under training. */}
      <ol className="flex flex-col items-stretch gap-1 sm:hidden">
        {nodes.map((n, i) => (
          <li key={n.key} className="flex flex-col items-stretch gap-1">
            <Node node={n} compact={compact} />
            {i < nodes.length - 1 ? (
              <ArrowDown className="mx-auto size-4 text-slate-500" aria-hidden />
            ) : (
              <p className="mt-1 inline-flex items-center gap-1.5 self-start rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                <RotateCcw className="size-3.5" aria-hidden />
                {c("landing.flow.return")} · {c("landing.flow.n3.title")}
              </p>
            )}
          </li>
        ))}
      </ol>
    </figure>
  )
}

function Cell({ col, children }: { col: number; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0" style={{ gridColumn: col, gridRow: 1 }}>
      {children}
    </div>
  )
}

function Node({ node: n, compact }: { node: FlowNode; compact: boolean }) {
  return (
    <div
      data-flow-node={n.key}
      className={cn(
        "flex w-full min-w-0 items-start gap-2.5 rounded-lg border text-left",
        compact ? "px-3 py-2" : "px-4 py-3",
        n.tone === "brand" ? "border-brand/35 bg-brand/[0.06]" : "border-slate-300 bg-card"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex shrink-0 items-center justify-center rounded-md",
          compact ? "size-8" : "size-10",
          n.tone === "brand" ? "bg-transparent" : "bg-slate-100 text-slate-700"
        )}
      >
        {n.icon}
      </span>
      <span className="min-w-0">
        <span className={cn("block leading-tight font-semibold text-foreground", compact ? "text-[0.95rem]" : "text-base")}>
          {n.title}
          {n.tag ? <span className="ml-1 text-xs font-normal text-muted-foreground">({n.tag})</span> : null}
        </span>
        <span className={cn("mt-0.5 block leading-snug text-slate-600", compact ? "text-[13px]" : "text-sm")}>{n.body}</span>
      </span>
    </div>
  )
}

/** U-shaped green arrow from under "Welder training" back up to "Small Canadian shops". */
function ReturnArrow({ compact }: { compact: boolean }) {
  // Node centres sit a quarter of the way in from each end of the 3-column span (two equal nodes + a 2rem gap).
  const inset = "calc((100% - 2rem) / 4)"
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "absolute top-0 rounded-b-xl border-x-2 border-b-2 border-emerald-600",
          compact ? "h-4" : "h-5"
        )}
        style={{ left: inset, right: inset }}
      />
      <ChevronUp
        aria-hidden
        className="absolute -top-2 size-4 -translate-x-1/2 text-emerald-600"
        style={{ left: `calc(${inset} + 1px)` }}
        strokeWidth={3}
      />
      <span
        className={cn(
          "absolute left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 font-medium whitespace-nowrap text-emerald-800",
          compact ? "top-1.5 py-0 text-xs" : "top-2 py-0.5 text-[13px]"
        )}
      >
        <RotateCcw className="size-3" aria-hidden />
        {c("landing.flow.return")}
      </span>
    </>
  )
}

/** The Muster mark (three stacked bars), sized for a flow node. Brand colour only here. */
function MusterGlyph({ compact }: { compact: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex flex-col items-start justify-center gap-[3px] rounded-md bg-brand px-[6px]",
        compact ? "size-7" : "size-9"
      )}
    >
      <span className="h-[3px] w-full rounded-full bg-white" />
      <span className="h-[3px] w-3/4 rounded-full bg-white/85" />
      <span className="h-[3px] w-1/2 rounded-full bg-white/70" />
    </span>
  )
}
