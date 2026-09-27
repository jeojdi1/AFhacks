"use client"

import * as React from "react"
import type { GraphEdge, GraphNode } from "@/lib/search/types"
import { KIND_ORDER, displayLabel, edgePlain, kindStyle, shapePath } from "./graph-kinds"

/** Canvas geometry: wide on desktop, near-square on phones so marks stay readable. */
interface Geo {
  W: number
  H: number
  /** Horizontal stretch of the rings. */
  SX: number
  /** Ring radius scale. */
  RS: number
}
const WIDE: Geo = { W: 900, H: 600, SX: 1.45, RS: 1 }
const NARROW: Geo = { W: 420, H: 470, SX: 1, RS: 0.8 }

export interface Placed {
  node: GraphNode
  x: number
  y: number
  /** Angle on the ring, for label placement. */
  angle: number
  ring: number
}

function kindRank(t: string): number {
  const i = (KIND_ORDER as readonly string[]).indexOf(t)
  return i < 0 ? 99 : i
}

/**
 * Deterministic ego layout: root in the centre, neighbours on concentric rings, grouped by
 * type (kind order) then label, so the same answer always draws the same picture.
 */
export function layoutEgo(
  nodes: GraphNode[],
  rootId: string,
  geo: Geo = WIDE,
): { root: GraphNode | null; ring: Placed[] } {
  const CX = geo.W / 2
  const CY = geo.H / 2
  const root = nodes.find((n) => n.id === rootId) ?? null
  const others = nodes
    .filter((n) => n.id !== rootId)
    .sort(
      (a, b) =>
        kindRank(a.type) - kindRank(b.type) ||
        displayLabel(a).localeCompare(displayLabel(b)) ||
        a.id.localeCompare(b.id),
    )
  const n = others.length
  const radii = (n <= 18 ? [185] : n <= 44 ? [150, 235] : [120, 190, 260]).map((r) => r * geo.RS)
  // Capacity proportional to circumference; the outer ring takes the rest.
  const total = radii.reduce((s, r) => s + r, 0)
  const caps = radii.map((r) => Math.round((n * r) / total))
  caps[caps.length - 1] = n - caps.slice(0, -1).reduce((s, x) => s + x, 0)
  const ring: Placed[] = []
  let k = 0
  radii.forEach((r, ri) => {
    const cap = caps[ri]
    const offset = -Math.PI / 2 + (ri % 2 ? Math.PI / Math.max(cap, 1) : 0)
    for (let i = 0; i < cap && k < n; i++, k++) {
      const angle = offset + (2 * Math.PI * i) / cap
      ring.push({
        node: others[k],
        x: CX + geo.SX * r * Math.cos(angle),
        y: CY + r * Math.sin(angle),
        angle,
        ring: ri,
      })
    }
  })
  return { root, ring }
}

function short(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

/** Label for the canvas: jobs show their id only; others are shortened. */
function canvasLabel(node: GraphNode, dense: boolean): string {
  if (node.type === "Job") return node.label.split(" · ")[0]
  return short(displayLabel(node), dense ? 18 : 26)
}

export function EgoSvg({
  nodes,
  edges,
  rootId,
  selectedId,
  onSelect,
  onRecentre,
  title,
}: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  rootId: string
  selectedId: string | null
  onSelect: (id: string) => void
  onRecentre: (id: string) => void
  title: string
}) {
  const [narrow, setNarrow] = React.useState(false)
  const wrap = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = wrap.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver((entries) => setNarrow((entries[0]?.contentRect.width ?? 900) < 560))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const geo = narrow ? NARROW : WIDE
  const CX = geo.W / 2
  const CY = geo.H / 2
  const { root, ring } = React.useMemo(() => layoutEgo(nodes, rootId, geo), [nodes, rootId, geo])
  const [hover, setHover] = React.useState<string | null>(null)
  const dense = ring.length > 24
  const typeCount = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const p of ring) m.set(p.node.type, (m.get(p.node.type) ?? 0) + 1)
    return m
  }, [ring])
  const edgeTypes = React.useMemo(() => {
    const m = new Map<string, string[]>()
    for (const e of edges) {
      const other = e.source === rootId ? e.target : e.target === rootId ? e.source : null
      if (!other) continue
      m.set(other, [...(m.get(other) ?? []), e.type])
    }
    return m
  }, [edges, rootId])

  if (!root) return <div ref={wrap} />
  const rootStyle = kindStyle(root.type)

  return (
    <div ref={wrap}>
      <svg
        viewBox={`0 0 ${geo.W} ${geo.H}`}
        role="group"
        aria-label={title}
        className="h-auto w-full select-none"
        data-ego-root={rootId}
        data-ego-count={ring.length}
      >
        <g aria-hidden>
          {ring.map((p) => {
            const types = edgeTypes.get(p.node.id) ?? []
            const on = hover === p.node.id || selectedId === p.node.id
            return (
              <line
                key={`e-${p.node.id}`}
                x1={CX}
                y1={CY}
                x2={p.x}
                y2={p.y}
                stroke={on ? "#334155" : "#cbd5e1"}
                strokeWidth={on ? 2 : 1}
              >
                <title>{types.map(edgePlain).join(" · ")}</title>
              </line>
            )
          })}
        </g>
        {ring.map((p) => {
          const s = kindStyle(p.node.type)
          const on = hover === p.node.id || selectedId === p.node.id
          const showLabel = on || !dense || (typeCount.get(p.node.type) ?? 0) <= 10
          const right = Math.cos(p.angle) >= 0
          const nearVertical = Math.abs(Math.cos(p.angle)) < 0.2
          const r = on ? 11 : 9
          return (
            <g
              key={p.node.id}
              transform={`translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`}
              role="button"
              tabIndex={0}
              aria-label={`${s.singular}: ${displayLabel(p.node)}. Press Enter to put it in the centre.`}
              data-node-id={p.node.id}
              className="cursor-pointer outline-none [&:focus-visible>path]:stroke-[#0f172a] [&:focus-visible>path]:stroke-[3px]"
              onMouseEnter={() => setHover(p.node.id)}
              onMouseLeave={() => setHover((h) => (h === p.node.id ? null : h))}
              onFocus={() => {
                setHover(p.node.id)
                onSelect(p.node.id)
              }}
              onBlur={() => setHover((h) => (h === p.node.id ? null : h))}
              onClick={() => onRecentre(p.node.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onRecentre(p.node.id)
                }
              }}
            >
              <title>{`${s.singular}: ${displayLabel(p.node)} (click to put it in the centre)`}</title>
              {/* Larger invisible hit target than the mark. */}
              <circle r={16} fill="transparent" />
              <path
                d={shapePath(s.shape, r)}
                fill={s.shape === "ring" ? "#ffffff" : s.color}
                stroke={s.shape === "ring" ? s.color : "#ffffff"}
                strokeWidth={s.shape === "ring" ? 3 : 2}
              />
              {showLabel ? (
                <text
                  x={nearVertical ? 0 : right ? 14 : -14}
                  y={nearVertical ? (Math.sin(p.angle) > 0 ? 24 : -16) : 4}
                  textAnchor={nearVertical ? "middle" : right ? "start" : "end"}
                  className="hidden fill-slate-800 text-[13px] sm:block"
                  style={{
                    paintOrder: "stroke",
                    stroke: "#ffffff",
                    strokeWidth: 4,
                    strokeLinejoin: "round",
                  }}
                  fontWeight={on ? 600 : 400}
                >
                  {canvasLabel(p.node, dense && !on)}
                </text>
              ) : null}
            </g>
          )
        })}
        <g
          transform={`translate(${CX},${CY})`}
          data-node-id={root.id}
          aria-label={`Centre: ${rootStyle.singular}: ${displayLabel(root)}`}
          role="img"
        >
          <title>{`${rootStyle.singular}: ${displayLabel(root)}`}</title>
          <path
            d={shapePath(rootStyle.shape, 24)}
            fill={rootStyle.shape === "ring" ? "#ffffff" : rootStyle.color}
            stroke={rootStyle.shape === "ring" ? rootStyle.color : "#0f172a"}
            strokeWidth={rootStyle.shape === "ring" ? 5 : 3}
          />
          <text
            y={46}
            textAnchor="middle"
            className="fill-slate-950 text-[16px] font-semibold"
            style={{
              paintOrder: "stroke",
              stroke: "#ffffff",
              strokeWidth: 5,
              strokeLinejoin: "round",
            }}
          >
            {short(root.type === "Job" ? root.label.split(" · ")[0] : displayLabel(root), 34)}
          </text>
        </g>
      </svg>
    </div>
  )
}
