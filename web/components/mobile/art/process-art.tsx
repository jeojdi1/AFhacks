"use client"

// Small inline-SVG pictograms for the shop's phone (decorative: aria-hidden).
// Drawn in code, no images. Colours come from currentColor + brand tokens.

import type * as React from "react"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type Kind = "weld" | "mill" | "turn" | "sheet" | "coat" | "harness" | "board" | "heat" | "fastener" | "part"

const TAG_KIND: Record<string, Kind> = {
  welding: "weld",
  cnc_milling: "mill",
  five_axis_milling: "mill",
  cnc_turning: "turn",
  sheet_metal: "sheet",
  anodizing: "coat",
  plating: "coat",
  painting: "coat",
  wire_harness: "harness",
  // Electronics subassemblies and box builds: a circuit board, not a harness.
  electronics_assembly: "board",
  heat_treat: "heat",
  fasteners: "fastener",
}

const KIND_TINT: Record<Kind, string> = {
  weld: "bg-amber-50 text-amber-700 ring-amber-200",
  mill: "bg-sky-50 text-sky-700 ring-sky-200",
  turn: "bg-sky-50 text-sky-700 ring-sky-200",
  sheet: "bg-slate-100 text-slate-700 ring-slate-200",
  coat: "bg-violet-50 text-violet-700 ring-violet-200",
  harness: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  board: "bg-teal-50 text-teal-700 ring-teal-200",
  heat: "bg-orange-50 text-orange-700 ring-orange-200",
  fastener: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  part: "bg-slate-100 text-slate-700 ring-slate-200",
}

/** Pick the most telling process from a job's tags. */
export function processKind(tags: string[] | null | undefined): Kind {
  const order: Kind[] = ["weld", "harness", "board", "heat", "coat", "sheet", "mill", "turn", "fastener"]
  const kinds = (tags ?? []).map((x) => TAG_KIND[x]).filter(Boolean) as Kind[]
  return order.find((k) => kinds.includes(k)) ?? "part"
}

function Glyph({ kind }: { kind: Kind }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const
  switch (kind) {
    case "weld":
      return (
        <g {...s}>
          <path d="M6 30h28" strokeWidth={3} />
          <path d="M14 30c2-3 4-3 6 0s4 3 6 0" />
          <path d="M22 8l-6 14" strokeWidth={3} />
          <path d="M20 26l-3-5M24 25l3-5M26 28l5-2M18 28l-5-2" className="text-amber-500" stroke="currentColor" />
        </g>
      )
    case "mill":
      return (
        <g {...s}>
          <rect x="16" y="4" width="8" height="8" rx="1" />
          <path d="M18 12v10l2 2 2-2V12" />
          <path d="M18 15l4 2M18 19l4 2" />
          <path d="M6 30h28v5H6z" />
          <path d="M12 30v-4h14v4" />
        </g>
      )
    case "turn":
      return (
        <g {...s}>
          <rect x="4" y="14" width="8" height="12" rx="1" />
          <path d="M12 16h18v8H12" />
          <path d="M16 16v8M20 16v8" />
          <path d="M30 28l4-6-6 2" />
        </g>
      )
    case "sheet":
      return (
        <g {...s}>
          <path d="M5 30h16l12-14" strokeWidth={3} />
          <path d="M21 30v4M5 34h16" />
          <circle cx="11" cy="24" r="1.5" />
          <circle cx="16" cy="24" r="1.5" />
        </g>
      )
    case "coat":
      return (
        <g {...s}>
          <rect x="6" y="14" width="10" height="14" rx="2" />
          <path d="M9 14v-4h4v4M16 18h4" />
          <path d="M24 14l6-3M24 18h8M24 22l6 3" className="text-violet-400" stroke="currentColor" strokeDasharray="1 3" />
        </g>
      )
    case "harness":
      return (
        <g {...s}>
          <rect x="4" y="16" width="7" height="8" rx="1.5" />
          <rect x="29" y="8" width="7" height="7" rx="1.5" />
          <rect x="29" y="25" width="7" height="7" rx="1.5" />
          <path d="M11 19c8 0 8-8 18-8M11 21c8 0 8 8 18 8M11 20h18" />
        </g>
      )
    case "board":
      return (
        <g {...s}>
          <rect x="6" y="8" width="28" height="24" rx="2" />
          <rect x="15" y="15" width="10" height="10" rx="1" />
          <path d="M15 18h-4M15 22h-4M25 18h4M25 22h4M20 15v-4M20 25v4" />
          <circle cx="30" cy="12" r="1.5" />
          <circle cx="10" cy="28" r="1.5" />
        </g>
      )
    case "heat":
      return (
        <g {...s}>
          <rect x="6" y="10" width="28" height="22" rx="3" />
          <path d="M6 16h28" />
          <path d="M16 28c-2-3 2-5 0-8M20 28c-2-3 2-5 0-8M24 28c-2-3 2-5 0-8" className="text-orange-500" stroke="currentColor" />
        </g>
      )
    case "fastener":
      return (
        <g {...s}>
          <path d="M14 6h12l3 5H11z" />
          <path d="M17 11v20l3 4 3-4V11" />
          <path d="M17 16l6 2M17 21l6 2M17 26l6 2" />
        </g>
      )
    default:
      return (
        <g {...s}>
          <path d="M8 12l12-6 12 6v16l-12 6-12-6z" />
          <path d="M8 12l12 6 12-6M20 18v16" />
        </g>
      )
  }
}

/** The bare process glyph (40 x 40 user units, currentColor) for use inside a larger SVG. */
export function ProcessGlyph({ tags }: { tags: string[] | null | undefined }) {
  return <Glyph kind={processKind(tags)} />
}

/** Process pictogram thumbnail for one job (tinted rounded tile). */
export function ProcessArt({ tags, className }: { tags: string[] | null | undefined; className?: string }) {
  const kind = processKind(tags)
  return (
    <span aria-hidden className={cn("flex size-14 shrink-0 items-center justify-center rounded-xl ring-1", KIND_TINT[kind], className)}>
      <svg viewBox="0 0 40 40" className="size-[70%]">
        <Glyph kind={kind} />
      </svg>
    </span>
  )
}

/** A fanned stack of up to 4 part thumbnails. */
export function PartStack({ tagsList, className }: { tagsList: (string[] | null | undefined)[]; className?: string }) {
  const shown = tagsList.slice(0, 4)
  return (
    <span aria-hidden className={cn("flex items-center", className)}>
      {shown.map((tags, i) => (
        <ProcessArt key={i} tags={tags} className={cn("size-12 bg-card shadow-sm ring-2 ring-card", i > 0 && "-ml-4")} />
      ))}
    </span>
  )
}

/** Welder in a helmet with a spark: the training card picture. */
export function WelderArt({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className={cn("size-12", className)}>
      <circle cx="24" cy="24" r="23" className="fill-funded-soft" />
      <path d="M12 40c0-8 5-12 12-12s12 4 12 12" className="fill-funded/70" />
      <path d="M14 22c0-7 4-12 10-12s10 5 10 12v4H14z" className="fill-funded" />
      <rect x="17" y="18" width="14" height="5" rx="1.5" className="fill-slate-800" />
      <path d="M36 30l4-3M37 34l5 0M35 26l2-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-amber-500" />
    </svg>
  )
}

/** A worker in a hard hat: the training card picture for every trade other than welding. */
export function WorkerArt({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className={cn("size-12", className)}>
      <circle cx="24" cy="24" r="23" className="fill-funded-soft" />
      <path d="M12 40c0-8 5-12 12-12s12 4 12 12" className="fill-funded/70" />
      <circle cx="24" cy="20" r="6.5" className="fill-funded/40" />
      <path d="M15 17c0-6 4-9.5 9-9.5s9 3.5 9 9.5z" className="fill-funded" />
      <rect x="13" y="16" width="22" height="3" rx="1.5" className="fill-funded" />
      <path d="M22 8.5v5M26 8.5v5" className="stroke-white/40" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  )
}

/** Training card picture for a trade: the welder for welding (or unknown), a hard hat otherwise. */
export function TrainingArt({ trade, className }: { trade?: string | null; className?: string }) {
  return trade && trade !== "welding" ? <WorkerArt className={className} /> : <WelderArt className={className} />
}

/** One dot per trainee seat. */
export function SeatDots({ count, className }: { count: number; className?: string }) {
  const n = Math.max(0, Math.min(8, Math.round(count)))
  if (!n) return null
  return (
    <span aria-hidden className={cn("flex gap-1", className)}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="size-2.5 rounded-full bg-funded" />
      ))}
    </span>
  )
}

/** Small (i) button that opens a short explanation (the 44 px hit area wraps a small icon). */
export function InfoTip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          "-m-3 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          className
        )}
      >
        <Info className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-64 text-sm leading-snug">{children}</PopoverContent>
    </Popover>
  )
}
