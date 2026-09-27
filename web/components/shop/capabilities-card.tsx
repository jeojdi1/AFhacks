import type { ReactNode } from "react"
import { ExternalLink } from "lucide-react"
import { MATERIAL_LABEL, PROCESS_LABEL } from "@/lib/format"
import type { ShopT } from "./types"

const TOLERANCE_LABEL: Record<string, string> = {
  standard: "Standard",
  precision: "Precision",
  ultra: "Ultra-precision",
}

const FIELD_LABEL: Record<string, string> = {
  "*": "All fields",
  processes: "Processes",
  machines: "Machines",
  materials: "Materials",
  max_envelope_mm: "Max envelope",
  tolerance_class: "Tolerance",
  capacity_hours_week: "Capacity",
  lead_time_days: "Lead time",
  employee_band: "Employees",
  naics: "Industry code",
  name: "Name",
  city: "Location",
}

function Fact({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

export function CapabilitiesCard({ shop }: { shop: ShopT }) {
  const env = shop.max_envelope_mm
  const provenance = shop.provenance ?? []
  const synthetic = shop.source === "synthetic"

  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <header className="border-b border-zinc-100 px-5 py-5 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Capabilities</h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          What Muster matches jobs against: processes, part size, weekly hours and lead time.
        </p>
      </header>

      <div className="grid gap-6 px-5 py-5 sm:px-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Processes</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {shop.processes.map((p) => (
                <span
                  key={p}
                  className="inline-flex h-7 items-center rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-sm font-medium text-zinc-800"
                >
                  {PROCESS_LABEL?.[p] ?? p}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Machines</div>
            <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm text-zinc-800 sm:grid-cols-2">
              {shop.machines.map((m) => (
                <li key={m} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-zinc-400" aria-hidden />
                  {m}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Materials</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {shop.materials.map((m) => (
                <span
                  key={m}
                  className="inline-flex h-7 items-center rounded-md border border-zinc-200 px-2.5 text-sm text-zinc-700"
                >
                  {MATERIAL_LABEL[m] ?? m}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 self-start">
          <Fact
            label="Weekly hours"
            value={`${shop.capacity_hours_week}`}
            sub="hours a week, all processes"
          />
          <Fact label="Lead time" value={`${shop.lead_time_days} days`} />
          <Fact
            label="Largest part"
            value={env ? `${env.join(" × ")}` : "—"}
            sub={env ? "mm (x × y × z)" : undefined}
          />
          <Fact
            label="Tolerance"
            value={TOLERANCE_LABEL[shop.tolerance_class] ?? shop.tolerance_class}
          />
        </div>
      </div>

      <footer className="border-t border-zinc-100 bg-zinc-50/60 px-5 py-3 text-xs text-zinc-500 sm:px-6">
        <span className="font-medium text-zinc-600">Provenance: </span>
        {synthetic ? (
          <>Synthetic shop: every field is illustrative and generated for the demo.</>
        ) : provenance.length === 0 ? (
          <>Public data (Statistics Canada ODBus, Open Government Licence) — unverified, not affiliated.</>
        ) : (
          <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
            {provenance.map((p, i) => (
              <span key={`${p.field}-${i}`}>
                {FIELD_LABEL[p.field] ?? p.field}:{" "}
                {p.source_url ? (
                  <a
                    href={p.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-sky-700 hover:underline"
                  >
                    {hostOf(p.source_url)}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : (
                  <span>no source</span>
                )}
                {p.confidence ? <span className="text-zinc-400"> ({p.confidence})</span> : null}
              </span>
            ))}
          </span>
        )}
      </footer>
    </section>
  )
}
