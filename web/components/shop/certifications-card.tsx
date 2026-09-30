"use client"

import type { ReactNode } from "react"
import { CheckCircle2, Circle, Clock, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { Details } from "@/components/muster/details"
import { c } from "@/lib/ui/copy"
import { ce } from "@/lib/ui/copy-e"
import { certPlain } from "@/lib/ui/plain"
import { certDisplay } from "@/lib/format"
import { CertName, CertStatusBadge, certLabel, certStatusMeta, glossNote } from "./badges"
import type { CertT as CertBase } from "./types"

/** A certificate, optionally with where its date comes from (the shop's own declared expiry reads "shop-declared"). */
type CertT = CertBase & { date_basis?: string | null }

/** The checklist framing: one group per requirement a defence company will ask about. */
const GROUPS: { key: string; match: (type: string) => boolean }[] = [
  { key: "CGP", match: (t) => t === "CGP" },
  { key: "CPCSC_L1", match: (t) => t === "CPCSC_L1" },
  { key: "ISO9001", match: (t) => t === "ISO9001" },
  { key: "AS9100", match: (t) => t === "AS9100" },
  { key: "NADCAP", match: (t) => t.startsWith("NADCAP") },
  { key: "CWB_W47.1", match: (t) => t === "CWB_W47.1" },
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

function SourceText({ cert }: { cert: CertT }) {
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
  if (certDisplay(cert.status) === "in_training") return <span>{ce("shop.certs.paidTraining")}</span>
  if (cert.status === "unknown") return null
  return <span>{ce("shop.certs.selfDeclared")}</span>
}

function GroupIcon({ status }: { status: string }) {
  const d = certDisplay(status)
  if (d === "in_training") return <Clock className="size-5 shrink-0 text-amber-500" aria-hidden />
  if (d === "held") return <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden />
  return <Circle className="size-5 shrink-0 text-slate-300" aria-hidden />
}

const RANK: Record<string, number> = { verified: 3, declared: 2, pending_training: 1, unknown: 0 }

interface Row {
  key: string
  certs: CertT[]
  best: CertT
  /** Held now (verified / declared). */
  held: boolean
  /** Workers in training for it, paid by Northgate (pending_training): shown, never counted as held. */
  training: boolean
  needed: boolean
}

function CertRow({ row }: { row: Row }) {
  const { key, certs } = row
  return (
    <>
      {certs.map((cert, i) => {
        const bits: ReactNode[] = []
        const src = <SourceText cert={cert} />
        if (cert.source_url || cert.status !== "unknown") bits.push(<span key="src">{src}</span>)
        if (cert.verified_at) bits.push(<span key="chk">{ce("shop.certs.checked", { date: fmtDate(cert.verified_at) })}</span>)
        if (cert.expires_at)
          bits.push(
            <span key="exp" data-cert-expiry={cert.date_basis === "shop-declared" ? "shop-declared" : undefined}>
              {ce("shop.certs.expires", { date: fmtDate(cert.expires_at) })}
              {cert.date_basis === "shop-declared" ? ` · ${ce("shop.certs.shopDeclared")}` : ""}
            </span>
          )
        const plain = certPlain(key === "NADCAP" && cert.type.startsWith("NADCAP:") ? cert.type : key)
        return (
          <li
            key={`${key}:${cert.type}`}
            data-cert-row={key}
            className="grid gap-x-4 gap-y-2 px-5 py-3.5 sm:px-6 md:grid-cols-[minmax(0,1.5fr)_auto_minmax(0,1.5fr)] md:items-start"
          >
            <div className={cn("flex min-w-0 items-start gap-2.5", i > 0 && "md:pl-[30px]")}>
              {i === 0 ? <GroupIcon status={cert.status} /> : null}
              <div className="min-w-0">
                <div className="font-medium text-foreground">
                  {key === "NADCAP" && cert.type.startsWith("NADCAP:") ? certLabel(cert.type) : <CertName type={key} />}
                </div>
                {i === 0 && plain.tip ? <div className="text-sm text-muted-foreground">{plain.tip}</div> : null}
              </div>
            </div>
            <div className="md:pt-0.5">
              <CertStatusBadge status={cert.status} label={cert.status === "unknown" ? c("shop.certs.notHeld") : undefined} />
            </div>
            <div className="min-w-0 space-y-0.5 text-sm text-muted-foreground">
              {bits.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">{bits}</div>
              )}
              {key === "CPCSC_L1" && <div className="text-slate-700">{ce("shop.certs.cpcsc")}</div>}
              {cert.note ? <div>{glossNote(cert.note)}</div> : null}
            </div>
          </li>
        )
      })}
    </>
  )
}

/**
 * Certificates (docs/ux-simplification.md §5.5). Story mode lists only the certificates held
 * plus the ones this shop's offers or one-step jobs need; the rest collapse into
 * "{n} more not held · show". The counter and the lit dots come from the listed rows.
 */
export function CertificationsCard({
  certifications,
  shopId,
  neededTypes,
  offerTypes,
}: {
  certifications: CertT[]
  shopId: string
  /** Cert types required by this shop's offers and its one-step (readiness) jobs: the rows listed. */
  neededTypes: string[]
  /**
   * Cert types required by this shop's current offers only: the counter's "needed for its
   * offers" (C3-11). A one-step job's certificate is listed but is not needed for an offer.
   * Without it the counter shows only what is held.
   */
  offerTypes?: string[]
}) {
  const needed = new Set(neededTypes)
  const forOffers = offerTypes ? new Set(offerTypes) : null
  const rows: Row[] = GROUPS.map((g) => {
    const certs = certifications.filter((cert) => g.match(cert.type))
    const list: CertT[] =
      certs.length > 0
        ? certs
        : [
            {
              shop_id: shopId,
              type: g.key,
              status: "unknown",
              source_url: null,
              verified_at: null,
              expires_at: null,
              note: null,
            } as unknown as CertT,
          ]
    const best = list.reduce((a, x) => ((RANK[x.status] ?? 0) > (RANK[a.status] ?? 0) ? x : a), list[0])
    return {
      key: g.key,
      certs: list,
      best,
      held: certDisplay(best.status) === "held",
      training: certDisplay(best.status) === "in_training",
      needed: [...needed].some((t) => g.match(t)),
    }
  })
  const listed = rows.filter((r) => r.held || r.training || r.needed)
  const others = rows.filter((r) => !r.held && !r.training && !r.needed)
  const held = listed.filter((r) => r.held).length
  const inTraining = listed.filter((r) => r.training).length
  const offerRows = forOffers ? rows.filter((r) => [...forOffers].some((t) => GROUPS.find((g) => g.key === r.key)?.match(t))) : null
  const offerHeld = offerRows ? offerRows.filter((r) => r.held).length : 0
  const offerNote = !offerRows
    ? null
    : offerRows.length === 0
      ? "none needed for its offers"
      : `${offerHeld} of ${offerRows.length} needed for its offers`
  const synthetic = certifications.some((x) => (x.note ?? "").toLowerCase().includes("illustrative"))

  return (
    <section className="rounded-xl border border-border bg-card" data-certs-card>
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-5 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{c("shop.certs.title")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{ce("shop.certs.sub")}</p>
        </div>
        {listed.length > 0 && (
          <div className="flex items-center gap-3" data-cert-counter>
            <div className="flex gap-1" aria-hidden>
              {listed.map((r) => (
                <span
                  key={r.key}
                  className={cn("h-2 w-6 rounded-full", r.held || r.training ? certStatusMeta(r.best.status).dot : "bg-slate-200")}
                />
              ))}
            </div>
            <span className="text-sm text-muted-foreground tabular-nums">
              <span className="text-2xl font-semibold text-foreground">{held}</span> held
              {offerNote ? <span data-cert-offer-count> · {offerNote}</span> : null}
              {inTraining ? " " : null}
              {inTraining ? (
                <span className="font-medium text-amber-800" data-cert-training-count>
                  · {inTraining} in training
                </span>
              ) : null}
            </span>
          </div>
        )}
      </header>

      {listed.length > 0 && (
        <ul className="divide-y divide-border">
          {listed.map((r) => (
            <CertRow key={r.key} row={r} />
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <div className={cn("px-5 py-3 sm:px-6", listed.length > 0 && "border-t border-border")}>
          <Details
            summary={c("shop.certs.more", { n: others.length })}
            openSummary={ce("shop.certs.less", { n: others.length })}
          >
            <ul className="-mx-5 divide-y divide-border sm:-mx-6">
              {others.map((r) => (
                <CertRow key={r.key} row={r} />
              ))}
            </ul>
          </Details>
        </div>
      )}

      {synthetic && (
        <p className="border-t border-border bg-muted/40 px-5 py-2.5 text-xs text-muted-foreground sm:px-6">
          {ce("shop.certs.illustrative")}
        </p>
      )}
    </section>
  )
}
