import { Database, HardDrive, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DataOrigin, SearchEngine } from "@/lib/search/types"

/**
 * Which backend answered: "Powered by Neo4j" or "In-memory graph" (the response's `engine`),
 * plus "demo data" when the answer is a saved one. Icon + text, never colour alone.
 */
export function EngineBadge({
  engine,
  origin,
  className,
}: {
  engine: SearchEngine | null | undefined
  origin: DataOrigin
  className?: string
}) {
  const neo = engine === "neo4j" && origin === "live"
  const Icon = origin === "demo-fallback" ? TriangleAlert : neo ? Database : HardDrive
  const text = neo ? "Powered by Neo4j" : origin === "live" ? "In-memory graph" : "In-memory graph · demo data"
  const title = neo
    ? "Answered by the Neo4j graph database (one Cypher query)."
    : origin === "live"
      ? "Answered by the engine's in-memory graph (Neo4j is not running or not loaded)."
      : "Demo data: computed in your browser from the saved demo files. Nothing calls the engine."
  return (
    <span
      data-engine={neo ? "neo4j" : "memory"}
      data-origin={origin}
      title={title}
      className={cn(
        "inline-flex h-7 w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        neo ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white text-slate-700",
        className
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {text}
    </span>
  )
}
