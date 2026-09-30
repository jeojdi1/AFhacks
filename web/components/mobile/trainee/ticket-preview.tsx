"use client"

import { IdCard } from "lucide-react"
import { t } from "@/lib/app/strings"
import { welderTicketRule } from "@/lib/app/readiness"
import { isWeldingTrade, type Trade } from "@/lib/trades"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { SourceLink } from "@/components/mobile/grow/grow-chips"
import { InfoTip } from "./seat-art"

/**
 * What the CWB welder ticket will say, drawn as a ticket. "Keeping it valid" sits behind an (i).
 * With another trade (`trade`, e.g. electronics assembly): the trade and its certificate
 * instead of the welding process, class and position, and no CWB validity rule.
 */
export function TicketPreview({ trade }: { trade?: Trade | null } = {}) {
  const other = trade && !isWeldingTrade(trade) ? trade : null
  if (other) return <TradeCertificatePreview trade={other} />
  const rows = [
    { k: t("seat.ticket.process"), v: t("seat.ticket.processValue") },
    { k: t("seat.ticket.class"), v: t("seat.ticket.classValue") },
    { k: t("seat.ticket.position"), v: t("seat.ticket.positionValue") },
  ]
  return (
    <section aria-labelledby="ticket-title" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 bg-brand/10 px-4 py-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
          <IdCard className="size-6" aria-hidden />
        </span>
        <h3 id="ticket-title" className="flex flex-1 flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
          {t("seat.ticket")}
          <AssumptionTag label="example" note="Example ticket fields; your test centre sets the real ones" />
        </h3>
        <InfoTip label={t("seat.ticket.keepValid")}>
          <p className="font-medium">{t("seat.ticket.keepValid")}</p>
          <p>{welderTicketRule.text}</p>
          <SourceLink href={welderTicketRule.source_url} label={t("ready.source")} />
        </InfoTip>
      </div>
      <div className="relative border-t-2 border-dashed border-border" aria-hidden>
        <span className="absolute -top-2.5 -left-2.5 size-5 rounded-full border border-border bg-background" />
        <span className="absolute -top-2.5 -right-2.5 size-5 rounded-full border border-border bg-background" />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
        {rows.map((r) => (
          <div key={r.k} className="contents">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{r.k}</dt>
            <dd className="leading-snug font-medium">{r.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Another trade's certificate (no CWB ticket fields): the trade, the certificate, who confirms it. */
function TradeCertificatePreview({ trade }: { trade: Trade }) {
  const rows = [
    { k: t("seat.ticket.trade"), v: trade.label },
    { k: t("seat.ticket.credential"), v: trade.credential ?? t("seat.ticket.credentialFallback") },
    { k: t("seat.ticket.details"), v: t("seat.ticket.detailsValue") },
  ]
  return (
    <section aria-labelledby="ticket-title" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 bg-brand/10 px-4 py-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
          <IdCard className="size-6" aria-hidden />
        </span>
        <h3 id="ticket-title" className="flex flex-1 flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
          {t("seat.ticketTrade")}
          <AssumptionTag label="example" note={t("seat.ticket.tradeNote")} />
        </h3>
      </div>
      <div className="relative border-t-2 border-dashed border-border" aria-hidden>
        <span className="absolute -top-2.5 -left-2.5 size-5 rounded-full border border-border bg-background" />
        <span className="absolute -top-2.5 -right-2.5 size-5 rounded-full border border-border bg-background" />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
        {rows.map((r) => (
          <div key={r.k} className="contents">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{r.k}</dt>
            <dd className="leading-snug font-medium">{r.v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
