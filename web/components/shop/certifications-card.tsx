import { CheckCircle2, Circle, Clock, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { CertStatusBadge, certLabel, certStatusMeta } from "./badges"
import type { CertT } from "./types"

/** The readiness checklist framing: one group per requirement a prime will ask about. */
const GROUPS: { key: string; title: string; match: (type: string) => boolean; why: string }[] = [
  { key: "CGP", title: "Controlled Goods (CGP)", match: (t) => t === "CGP", why: "Controlled Goods Program registration; required for any controlled job" },
  {
    key: "CPCSC_L1",
    title: "CPCSC Level 1",
    match: (t) => t === "CPCSC_L1",
    why: "Canadian Program for Cyber Security Certification; self-assessed, no public registry",
  },
  { key: "ISO9001", title: "ISO 9001", match: (t) => t === "ISO9001", why: "Quality management baseline" },
  { key: "AS9100", title: "AS9100", match: (t) => t === "AS9100", why: "Aerospace and defence quality" },
  { key: "NADCAP", title: "Nadcap", match: (t) => t.startsWith("NADCAP"), why: "Aerospace accreditation for special processes (heat treat, coatings)" },
  { key: "CWB_W47.1", title: "CWB W47.1", match: (t) => t === "CWB_W47.1", why: "Canadian Welding Bureau certification for structural welding" },
]

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

function SourceCell({ cert }: { cert: CertT }) {
  if (cert.source_url) {
    return (
      <a
        href={cert.source_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-sky-700 hover:underline"
      >
        {hostOf(cert.source_url)}
        <ExternalLink className="size-3" aria-hidden />
      </a>
    )
  }
  if (cert.status === "pending_training") return <span className="text-zinc-700">Prime-funded training</span>
  if (cert.status === "unknown") return <span className="text-zinc-400">—</span>
  return <span className="text-zinc-700">Self-declared</span>
}

function dateLabel(cert: CertT): string {
  if (!cert.verified_at) return "—"
  const prefix =
    cert.status === "verified" ? "Verified" : cert.status === "declared" ? "Declared" : "Recorded"
  return `${prefix} ${fmtDate(cert.verified_at)}`
}

function GroupIcon({ status }: { status: string }) {
  if (status === "pending_training") return <Clock className="size-5 text-amber-500" aria-hidden />
  if (certStatusMeta(status).counts) return <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
  return <Circle className="size-5 text-zinc-300" aria-hidden />
}

const RANK: Record<string, number> = { verified: 3, declared: 2, pending_training: 1, unknown: 0 }

export function CertificationsCard({ certifications, shopId }: { certifications: CertT[]; shopId: string }) {
  const rows = GROUPS.map((g) => {
    const certs = certifications.filter((c) => g.match(c.type))
    const list: CertT[] =
      certs.length > 0
        ? certs
        : [
            {
              shop_id: shopId,
              type: g.key === "NADCAP" ? "NADCAP" : g.key,
              status: "unknown",
              source_url: null,
              verified_at: null,
              expires_at: null,
              note: null,
            } as unknown as CertT,
          ]
    const best = list.reduce((a, c) => ((RANK[c.status] ?? 0) > (RANK[a.status] ?? 0) ? c : a), list[0])
    return { group: g, certs: list, best }
  })
  const inPlace = rows.filter((r) => certStatusMeta(r.best.status).counts).length

  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-100 px-6 py-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Certifications and compliance</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Every certification with its source, date and expiry. Declared and synthetic entries are not
            independently verified.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1" aria-hidden>
            {rows.map((r) => (
              <span
                key={r.group.key}
                className={cn("h-2 w-6 rounded-full", certStatusMeta(r.best.status).dot)}
              />
            ))}
          </div>
          <span className="text-sm tabular-nums text-zinc-600">
            <span className="text-2xl font-semibold text-zinc-900">{inPlace}</span> of {rows.length} in place
          </span>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
              <th className="px-6 py-3">Requirement</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Source</th>
              <th className="px-3 py-3">Checked</th>
              <th className="px-3 py-3">Expires</th>
              <th className="px-6 py-3">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.flatMap(({ group, certs }) =>
              certs.map((c, i) => (
                <tr key={`${group.key}:${c.type}`} className="align-top">
                  <td className="px-6 py-3.5">
                    {i === 0 ? (
                      <div className="flex items-start gap-2.5">
                        <GroupIcon status={c.status} />
                        <div>
                          <div className="font-medium text-zinc-900">
                            {group.key === "NADCAP" && c.type.startsWith("NADCAP:")
                              ? certLabel(c.type)
                              : group.title}
                          </div>
                          <div className="text-sm text-zinc-500">{group.why}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2.5 pl-[30px]">
                        <div className="font-medium text-zinc-900">{certLabel(c.type)}</div>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    <CertStatusBadge status={c.status} />
                  </td>
                  <td className="px-3 py-3.5">
                    <SourceCell cert={c} />
                  </td>
                  <td className="px-3 py-3.5 tabular-nums text-zinc-700">{dateLabel(c)}</td>
                  <td className="px-3 py-3.5 tabular-nums text-zinc-700">{fmtDate(c.expires_at)}</td>
                  <td className="px-6 py-3.5 text-zinc-600">
                    {group.key === "CPCSC_L1" && (
                      <div className="text-zinc-700">Self-assessed · no public registry.</div>
                    )}
                    {c.note ? <div>{c.note}</div> : group.key !== "CPCSC_L1" ? <span className="text-zinc-400">—</span> : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
