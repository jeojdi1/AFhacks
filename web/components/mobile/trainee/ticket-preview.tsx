"use client"

import { IdCard } from "lucide-react"
import { t } from "@/lib/app/strings"
import { welderTicketRule } from "@/lib/app/readiness"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { SourceLink } from "@/components/mobile/grow/grow-chips"

/** What the CWB welder ticket will say, and how it stays valid (CWB_WELDER_TICKET rule). */
export function TicketPreview() {
  const rows = [
    { k: t("seat.ticket.process"), v: t("seat.ticket.processValue") },
    { k: t("seat.ticket.class"), v: t("seat.ticket.classValue") },
    { k: t("seat.ticket.position"), v: t("seat.ticket.positionValue") },
  ]
  return (
    <section aria-labelledby="ticket-title" className="rounded-xl border border-border bg-card p-4">
      <h3 id="ticket-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <IdCard className="size-5 text-muted-foreground" aria-hidden />
        {t("seat.ticket")}
        <AssumptionTag label="example" note="Example ticket fields; your test centre sets the real ones" />
      </h3>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
        {rows.map((r) => (
          <div key={r.k} className="contents">
            <dt className="text-muted-foreground">{r.k}</dt>
            <dd className="font-medium">{r.v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded-lg bg-muted p-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("seat.ticket.keepValid")}</p>
        <p className="mt-1 text-[15px] leading-snug">{welderTicketRule.text}</p>
        <SourceLink href={welderTicketRule.source_url} label={t("ready.source")} />
      </div>
    </section>
  )
}
