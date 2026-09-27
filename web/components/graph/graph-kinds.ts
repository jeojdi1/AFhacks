// Plain names, colours and shapes for the graph's node and edge types.
// Colour = the reference categorical order (fixed, never cycled) and every type also has
// its own shape and a text label, so identity never rests on colour alone.

import { certFirst, processPlain } from "@/lib/search/labels"

export type Shape = "circle" | "square" | "diamond" | "triangle" | "hexagon" | "pentagon" | "ring" | "cross"

export interface KindStyle {
  /** Legend / list name (plural). */
  plural: string
  /** One node of this type. */
  singular: string
  color: string
  shape: Shape
}

export const KIND_ORDER = [
  "Prime",
  "Program",
  "Job",
  "Shop",
  "Process",
  "Cert",
  "Region",
  "Occupation",
  "DNDVendor",
  "Manufacturer",
] as const

export const KIND: Record<string, KindStyle> = {
  Shop: { plural: "Shops", singular: "Shop", color: "#2a78d6", shape: "circle" },
  Process: { plural: "Skills", singular: "Skill", color: "#eb6834", shape: "square" },
  Cert: { plural: "Certificates", singular: "Certificate", color: "#1baf7a", shape: "diamond" },
  Region: { plural: "Places", singular: "Place", color: "#eda100", shape: "triangle" },
  Job: { plural: "Northgate jobs", singular: "Northgate job", color: "#e87ba4", shape: "pentagon" },
  DNDVendor: { plural: "Past National Defence suppliers (public record)", singular: "Past National Defence supplier (public record)", color: "#008300", shape: "hexagon" },
  Occupation: { plural: "Trades (hiring outlook)", singular: "Trade", color: "#4a3aa7", shape: "ring" },
  Manufacturer: { plural: "Other manufacturers (public list)", singular: "Manufacturer (public list)", color: "#e34948", shape: "cross" },
  Prime: { plural: "Big defence companies", singular: "Big defence company", color: "#334155", shape: "square" },
  Program: { plural: "Defence programs", singular: "Defence program", color: "#64748b", shape: "diamond" },
}

export function kindStyle(type: string): KindStyle {
  return KIND[type] ?? { plural: type, singular: type, color: "#64748b", shape: "circle" }
}

/** Edge types in plain words ("shop → does → skill"). */
export const EDGE_PLAIN: Record<string, string> = {
  HAS_PROCESS: "Shop does a skill",
  HOLDS_CERT: "Shop holds a certificate",
  IN_REGION: "Located in a place",
  MATCHES_DND_VENDOR: "Matches a past National Defence supplier (by name, unverified)",
  SAME_AS: "Same company as one on the public manufacturers list",
  NEEDS_PROCESS: "Job needs a skill",
  NEEDS_CERT: "Job needs a certificate",
  HAS_JOB: "Program has a job",
  HAS_PROGRAM: "Company has a program",
  ITB_OBLIGATION: "Company owes Canada business (ITB)",
  OUTLOOK: "Hiring outlook for a trade in a place",
  PART_OF: "Place is part of a larger area",
}

export function edgePlain(type: string): string {
  return EDGE_PLAIN[type] ?? type.replace(/_/g, " ").toLowerCase()
}

/** SVG path for a shape centred at 0,0 with radius r. */
export function shapePath(shape: Shape, r: number): string {
  const poly = (n: number, rot: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = rot + (i * 2 * Math.PI) / n
      return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`
    })
      .map((p, i) => `${i ? "L" : "M"}${p}`)
      .join(" ") + " Z"
  switch (shape) {
    case "square": {
      const s = r * 0.85
      return `M${-s},${-s} L${s},${-s} L${s},${s} L${-s},${s} Z`
    }
    case "diamond":
      return poly(4, -Math.PI / 2)
    case "triangle":
      return poly(3, -Math.PI / 2)
    case "hexagon":
      return poly(6, 0)
    case "pentagon":
      return poly(5, -Math.PI / 2)
    case "cross": {
      const a = r * 0.38
      return `M${-a},${-r} L${a},${-r} L${a},${-a} L${r},${-a} L${r},${a} L${a},${a} L${a},${r} L${-a},${r} L${-a},${a} L${-r},${a} L${-r},${-a} L${-a},${-a} Z`
    }
    case "ring":
    case "circle":
    default:
      return `M${r},0 A${r},${r} 0 1,1 ${-r},0 A${r},${r} 0 1,1 ${r},0 Z`
  }
}

/** Node label in plain words: certificates and processes use the app's plain labels. */
export function displayLabel(node: { type: string; label: string; props: Record<string, unknown> }): string {
  if (node.type === "Cert" && typeof node.props.type === "string") return certFirst(node.props.type)
  if (node.type === "Process" && typeof node.props.name === "string") return processPlain(node.props.name)
  return node.label
}
