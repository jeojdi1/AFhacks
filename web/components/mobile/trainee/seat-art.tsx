"use client"

import * as React from "react"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ProcessGlyph } from "@/components/mobile/art/process-art"

/** Small (i) button that opens a popover. The hit area is 44 px, the icon stays small. */
export function InfoTip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          "-m-2.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
      >
        <Info className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm leading-snug">{children}</PopoverContent>
    </Popover>
  )
}

/**
 * Hero picture for every trade other than welding: a hard hat and the trade's process
 * pictogram on a bench (a circuit board, a harness, a milling cutter, …). Decorative.
 */
export function TradeHeroArt({ processes, className }: { processes: string[]; className?: string }) {
  return (
    <svg viewBox="0 0 240 120" className={className} aria-hidden focusable="false">
      {/* bench */}
      <rect x="120" y="96" width="104" height="8" rx="2" className="fill-muted-foreground/25" />
      {/* the trade's process, drawn big on the bench */}
      <g transform="translate(134 18) scale(1.95)" className="text-brand">
        <ProcessGlyph tags={processes} />
      </g>
      {/* hard hat */}
      <path d="M26 78 C26 46 46 28 72 28 C98 28 118 46 118 78 Z" className="fill-brand" />
      <rect x="16" y="76" width="112" height="12" rx="6" className="fill-brand" />
      <path d="M64 30 h16 v26 h-16z" className="fill-white/20" />
      <path d="M36 72 C36 52 50 38 70 36" className="fill-none stroke-white/30" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

/** Hero picture: a welding helmet and a torch throwing sparks onto a plate. Decorative. */
export function WelderArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 120" className={className} aria-hidden focusable="false">
      {/* work plate */}
      <rect x="120" y="92" width="104" height="10" rx="2" className="fill-muted-foreground/25" />
      <rect x="150" y="89" width="44" height="4" rx="2" className="fill-muted-foreground/40" />
      {/* weld bead */}
      <path d="M150 90 q4 -3 8 0 t8 0 t8 0 t8 0" className="fill-none stroke-brand" strokeWidth="2.5" strokeLinecap="round" />
      {/* torch */}
      <g transform="rotate(-35 196 70)">
        <rect x="186" y="28" width="16" height="44" rx="6" className="fill-foreground/80" />
        <rect x="190" y="70" width="8" height="12" rx="2" className="fill-muted-foreground" />
        <rect x="192" y="81" width="4" height="7" rx="1" className="fill-foreground/70" />
      </g>
      {/* arc glow */}
      <circle cx="175" cy="88" r="12" className="fill-amber-300/50" />
      <circle cx="175" cy="88" r="5" className="fill-amber-200" />
      {/* sparks */}
      <g className="stroke-amber-500" strokeWidth="2.5" strokeLinecap="round">
        <path d="M168 80 l-10 -14" />
        <path d="M164 86 l-16 -6" />
        <path d="M172 76 l-3 -16" />
        <path d="M180 78 l6 -14" />
        <path d="M160 92 l-14 2" />
      </g>
      <g className="fill-amber-400">
        <circle cx="152" cy="60" r="2" />
        <circle cx="142" cy="74" r="1.8" />
        <circle cx="190" cy="58" r="1.8" />
        <circle cx="140" cy="94" r="1.5" />
      </g>
      {/* helmet */}
      <path d="M22 70 C22 34 46 16 72 16 C98 16 118 34 118 64 L118 92 C118 100 110 106 100 106 L44 106 C32 106 22 96 22 84 Z" className="fill-brand" />
      <path d="M30 70 C30 40 50 24 72 24" className="fill-none stroke-white/30" strokeWidth="4" strokeLinecap="round" />
      <rect x="54" y="54" width="54" height="24" rx="5" className="fill-foreground/85" />
      <rect x="60" y="59" width="42" height="14" rx="3" className="fill-emerald-400/70" />
      <path d="M64 62 l10 0" className="stroke-white/70" strokeWidth="2" strokeLinecap="round" />
      <circle cx="30" cy="66" r="7" className="fill-foreground/70" />
      <circle cx="30" cy="66" r="3" className="fill-muted" />
    </svg>
  )
}

/** Part thumbnail: a welded frame with bead marks at the corners. Decorative. */
export function PartThumb({ variant = 0, className }: { variant?: number; className?: string }) {
  const v = variant % 3
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      {v === 0 ? (
        <>
          <rect x="8" y="14" width="32" height="22" rx="2" className="fill-none stroke-foreground/70" strokeWidth="3" />
          <path d="M8 25 H40" className="stroke-foreground/40" strokeWidth="2" />
        </>
      ) : v === 1 ? (
        <>
          <rect x="9" y="9" width="30" height="30" rx="2" className="fill-none stroke-foreground/70" strokeWidth="3" />
          <rect x="17" y="17" width="14" height="14" rx="1" className="fill-foreground/15" />
        </>
      ) : (
        <>
          <path d="M8 36 L20 12 H40 V36 Z" className="fill-none stroke-foreground/70" strokeWidth="3" strokeLinejoin="round" />
          <path d="M14 30 H40" className="stroke-foreground/40" strokeWidth="2" />
        </>
      )}
      <g className="fill-brand">
        <circle cx={v === 2 ? 20 : 9} cy={v === 1 ? 9 : 14} r="2.5" />
        <circle cx="39" cy={v === 1 ? 9 : 14} r="2.5" />
        <circle cx="39" cy={v === 0 ? 36 : 38} r="2.5" />
      </g>
    </svg>
  )
}
