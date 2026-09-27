"use client"

// The award package: after a shop accepts an offer, the job-specific paperwork
// with Northgate (fictional) and a kickoff call. Formal, calm, plain language.
// Everything is demo: no real e-signature, no file is stored, no invite is sent.
// Numbers never change here: the award only reads the offer.

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowLeft,
  CalendarCheck,
  CalendarPlus,
  Check,
  CircleDashed,
  FileCheck2,
  FileLock2,
  FileSignature,
  FileUp,
  Handshake,
  Paperclip,
  PhoneCall,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtMoney } from "@/lib/format"
import { fmtMoney2 } from "@/components/muster/credit-equation"
import { shopInfo } from "@/lib/app/actions-store"
import { usePhoneHref } from "@/components/mobile/shell/use-phone-href"
import { useFromPrimeState } from "@/components/mobile/shell/use-from-prime"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BottomSheet } from "@/components/mobile/offer/bottom-sheet"
import {
  AWARD_STATUS_LABEL,
  downloadIcs,
  fmtSlot,
  paperworkCount,
  useAward,
  type Award,
  type AwardDocument,
  type AwardStatus,
} from "@/lib/award"

const PRIME_FULL = "Northgate Land Systems (fictional)"

const STATUS_TONE: Record<AwardStatus, string> = {
  not_started: "border-border bg-muted text-foreground",
  in_progress: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  complete: "border-assigned/25 bg-assigned-soft text-assigned",
}

type Variant = "desktop" | "phone"

export function AwardPage({ shopId, jobId, variant }: { shopId: string; jobId: string; variant: Variant }) {
  const a = useAward(shopId, jobId)
  const wp = usePhoneHref()
  const { fromPrime, known } = useFromPrimeState()
  const readOnly = !known || fromPrime
  const phone = variant === "phone"
  const offerHref = phone
    ? `/m/shops/${encodeURIComponent(shopId)}/offers/${encodeURIComponent(jobId)}`
    : `/shops/${encodeURIComponent(shopId)}`
  const back = (
    <Link
      href={wp(fromPrime ? (phone ? "/m/prime" : "/prime") : offerHref)}
      className={cn(
        "inline-flex items-center gap-1.5 self-start rounded-lg font-medium text-muted-foreground hover:text-foreground",
        phone ? "min-h-12 text-base" : "h-10 text-sm"
      )}
    >
      <ArrowLeft className="size-4" aria-hidden />
      {fromPrime ? "Back" : phone ? "Back to the offer" : "Back to your offers"}
    </Link>
  )

  if (a.loading) return <AwardSkeleton phone={phone} />
  if (!a.award) {
    const title =
      a.problem === "not_accepted"
        ? "This offer is not accepted yet"
        : a.problem === "not_found"
          ? "No award package for this job"
          : "Could not load the award package"
    const body =
      a.problem === "not_accepted"
        ? "The award package opens after the shop accepts the offer."
        : a.problem === "not_found"
          ? "This job was not offered to this shop."
          : (a.error ?? "Try again in a moment.")
    return (
      <div className={cn("flex flex-col gap-3", phone ? "pt-3" : "mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6")}>
        {back}
        <div className="rounded-xl border border-border bg-card px-5 py-6" data-testid="award-empty">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-1 text-base text-muted-foreground">{body}</p>
          {a.problem === "error" ? (
            <Button className="mt-3" variant="outline" size={phone ? "touch" : "default"} onClick={() => void a.refresh()}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return <AwardBody award={a.award} state={a} back={back} phone={phone} readOnly={readOnly} source={a.source} />
}

function AwardBody({
  award,
  state,
  back,
  phone,
  readOnly,
  source,
}: {
  award: Award
  state: ReturnType<typeof useAward>
  back: React.ReactNode
  phone: boolean
  readOnly: boolean
  source: "engine" | "local"
}) {
  const [signing, setSigning] = React.useState<AwardDocument | null>(null)
  const shop = shopInfo(award.shop_id)
  const shopName = shop?.name ?? award.shop_id
  const shopLabel = shop?.source === "synthetic" ? "Synthetic" : shop ? "Public data — unverified — not affiliated" : null
  const { done, total } = paperworkCount(award)

  const mark = async (doc: AwardDocument) => {
    try {
      await state.signDocument(doc.key)
      setSigning(null)
      toast.success(doc.kind === "sign" ? `Signed: ${doc.title}` : `Marked uploaded: ${doc.title}`, {
        description: "Northgate sees it now (demo).",
      })
    } catch {
      toast.error("Could not save that", { description: state.error ?? "Try again." })
    }
  }

  const header = (
    <AwardHeader award={award} shopName={shopName} shopLabel={shopLabel} phone={phone} readOnly={readOnly} />
  )
  const progress = <ProgressStrip done={done} total={total} status={award.status} phone={phone} call={award.call.booked ? award.call.slot : null} />
  const paperwork = <Paperwork award={award} phone={phone} readOnly={readOnly} busy={state.busy} onSign={setSigning} onUpload={(d) => void mark(d)} />
  const kickoff = <Kickoff award={award} phone={phone} readOnly={readOnly} busy={state.busy} onBook={state.bookCall} error={state.error} />
  const next = <NextSteps steps={award.next_steps} />
  const footer = (
    <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground" data-testid="award-footer">
      Demo paperwork · not a real contract · Simplified ITB rules for demo.
      {source === "local" ? " Saved on this device (demo data)." : null}
    </p>
  )

  const sheet = (
    <SignSheet
      doc={signing}
      award={award}
      busy={state.busy}
      onOpenChange={(o) => {
        if (!o) setSigning(null)
      }}
      onSign={(d) => void mark(d)}
      phone={phone}
    />
  )

  if (phone) {
    return (
      <div className="flex flex-col gap-4 pt-1" data-testid="award-page">
        {back}
        {header}
        <div className="sticky top-[calc(3.5rem+1px+env(safe-area-inset-top))] z-20 -mx-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur supports-backdrop-filter:bg-background/90">
          {progress}
        </div>
        {paperwork}
        {kickoff}
        {next}
        {footer}
        {sheet}
      </div>
    )
  }
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8" data-testid="award-page">
      {back}
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        {header}
        <div className="mt-4">{progress}</div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">{paperwork}</div>
        <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-6 lg:col-span-5">
          {kickoff}
          {next}
        </div>
      </div>
      {footer}
      {sheet}
    </div>
  )
}

function AwardHeader({
  award,
  shopName,
  shopLabel,
  phone,
  readOnly,
}: {
  award: Award
  shopName: string
  shopLabel: string | null
  phone: boolean
  readOnly: boolean
}) {
  const double = award.multiplier === 2
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          <Handshake className="size-4" aria-hidden />
          Award package
        </span>
        <span
          className={cn("inline-flex min-h-7 items-center rounded-full border px-2.5 text-sm font-medium", STATUS_TONE[award.status])}
          data-testid="award-status"
        >
          {AWARD_STATUS_LABEL[award.status]}
        </span>
      </div>
      <p className="text-base break-words text-foreground">
        <span className="font-medium">{PRIME_FULL}</span> <span aria-hidden>→</span>
        <span className="sr-only">to</span> <span className="font-medium">{shopName}</span>
        {shopLabel ? <span className="text-muted-foreground"> ({shopLabel})</span> : null}
      </p>
      <h1 className={cn("leading-snug font-semibold break-words", phone ? "text-xl" : "text-2xl")}>
        <span className="text-muted-foreground">Part {award.part_no} · </span>
        {award.description}
      </h1>
      <dl className={cn("mt-1 grid gap-2", phone ? "grid-cols-2" : "grid-cols-3")}>
        <Stat label="Job value" value={fmtMoney(award.value_cad, { compact: true })} title={fmtMoney(award.value_cad)} />
        <Stat label="Hours a week" value={`${award.hours_week} h`} />
        <div className={cn("rounded-xl border border-assigned/25 bg-assigned-soft p-3", phone ? "col-span-2" : "")}>
          <dt className="text-sm text-muted-foreground">Credit for Northgate</dt>
          <dd className="mt-0.5 text-base font-semibold text-foreground">
            Northgate earns {fmtMoney2(award.credit_cad)} credit{double ? " (counts double)" : ""}
          </dd>
        </div>
      </dl>
      {readOnly ? (
        <p className="text-sm text-muted-foreground">You are viewing the shop&apos;s award package. Only the shop signs and books.</p>
      ) : null}
    </header>
  )
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-2xl leading-none font-semibold tabular-nums" title={title}>
        {value}
      </dd>
    </div>
  )
}

function ProgressStrip({
  done,
  total,
  status,
  phone,
  call,
}: {
  done: number
  total: number
  status: AwardStatus
  phone: boolean
  call: string | null
}) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="flex flex-col gap-1.5" data-testid="award-progress">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
        <span className="font-semibold text-foreground">
          Paperwork {done} of {total}
        </span>
        <span className="text-muted-foreground">{call ? `Kickoff ${fmtSlot(call)}` : "Kickoff not booked"}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Paperwork done"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className={cn("w-full overflow-hidden rounded-full bg-muted", phone ? "h-2" : "h-1.5")}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", status === "complete" ? "bg-assigned" : "bg-emerald-600")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

const KIND_ICON = { sign: FileSignature, upload: FileUp, auto: Paperclip } as const

function Paperwork({
  award,
  phone,
  readOnly,
  busy,
  onSign,
  onUpload,
}: {
  award: Award
  phone: boolean
  readOnly: boolean
  busy: boolean
  onSign: (d: AwardDocument) => void
  onUpload: (d: AwardDocument) => void
}) {
  return (
    <section aria-labelledby="award-paperwork" className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <h2 id="award-paperwork" className="text-lg font-semibold">
          Paperwork for this job
        </h2>
        <p className="text-sm text-muted-foreground">What Northgate needs before work starts. Sign, mark uploaded, or check what we attached.</p>
      </div>
      {award.controlled ? (
        <p className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-controlled/25 bg-controlled-soft px-3 py-2.5 text-sm text-foreground sm:mx-5">
          <FileLock2 className="mt-0.5 size-4 shrink-0 text-controlled" aria-hidden />
          <span>
            <strong>Controlled job.</strong> Drawings and technical data move only through Northgate&apos;s secure channel after the
            Controlled Goods check. Shieldworks never stores drawings, and nothing here asks for them.
          </span>
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {award.documents.map((d) => (
          <DocRow key={d.key} doc={d} phone={phone} readOnly={readOnly} busy={busy} onSign={onSign} onUpload={onUpload} />
        ))}
      </ul>
    </section>
  )
}

function DocRow({
  doc,
  phone,
  readOnly,
  busy,
  onSign,
  onUpload,
}: {
  doc: AwardDocument
  phone: boolean
  readOnly: boolean
  busy: boolean
  onSign: (d: AwardDocument) => void
  onUpload: (d: AwardDocument) => void
}) {
  const Icon = KIND_ICON[doc.kind] ?? FileSignature
  const isDone = doc.status === "done"
  const size = phone ? "touch" : "default"
  return (
    <li className="flex flex-col gap-2 px-4 py-4 sm:px-5" data-testid={`award-doc-${doc.key}`} data-status={doc.status}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-base font-semibold break-words">{doc.title}</h3>
            <DocChip doc={doc} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{doc.why}</p>
          {doc.kind === "auto" ? (
            <p className="mt-1.5 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
              {/^attached/i.test(doc.detail) ? null : <span className="font-medium">Attached from the profile: </span>}
              {doc.detail}
            </p>
          ) : null}
        </div>
      </div>
      {!readOnly && !isDone && doc.kind === "sign" ? (
        <Button size={size} variant="outline" className="self-start sm:ml-8" disabled={busy} onClick={() => onSign(doc)}>
          <FileSignature aria-hidden />
          Review and sign
        </Button>
      ) : null}
      {!readOnly && !isDone && doc.kind === "upload" ? (
        <Button
          size={size}
          variant="outline"
          className="h-auto min-h-12 self-start py-2 text-left whitespace-normal sm:ml-8 sm:min-h-9"
          disabled={busy}
          onClick={() => onUpload(doc)}
        >
          <FileUp aria-hidden />
          Mark uploaded (demo — no file is stored)
        </Button>
      ) : null}
    </li>
  )
}

function DocChip({ doc }: { doc: AwardDocument }) {
  if (doc.status === "done") {
    const verb = doc.kind === "sign" ? "Signed" : doc.kind === "upload" ? "Uploaded" : "Attached"
    return (
      <span className="inline-flex min-h-6 items-center gap-1 rounded-full border border-assigned/25 bg-assigned-soft px-2 text-xs font-medium text-assigned">
        <Check className="size-3.5" aria-hidden />
        {verb}
      </span>
    )
  }
  return (
    <span className="inline-flex min-h-6 items-center gap-1 rounded-full border border-border bg-background px-2 text-xs font-medium text-muted-foreground">
      <CircleDashed className="size-3.5" aria-hidden />
      {doc.kind === "sign" ? "To sign" : "To upload"}
    </span>
  )
}

function SignSheet({
  doc,
  award,
  busy,
  onOpenChange,
  onSign,
  phone,
}: {
  doc: AwardDocument | null
  award: Award
  busy: boolean
  onOpenChange: (o: boolean) => void
  onSign: (d: AwardDocument) => void
  phone: boolean
}) {
  // Keep the last document while the sheet animates closed.
  const [last, setLast] = React.useState<AwardDocument | null>(doc)
  if (doc && doc !== last) setLast(doc)
  const d = doc ?? last
  const rows = d ? summaryRows(d, award) : []
  return (
    <BottomSheet
      open={!!doc}
      onOpenChange={onOpenChange}
      title={d?.title ?? ""}
      description={d?.why}
      className={phone ? undefined : "sm:max-w-lg"}
      footer={
        d ? (
          <div className="flex flex-col gap-2">
            <Button size="touch-lg" className="w-full bg-emerald-700 text-white hover:bg-emerald-800" disabled={busy} onClick={() => onSign(d)}>
              <FileCheck2 aria-hidden />
              Sign as Owner (demo)
            </Button>
            <p className="text-center text-sm text-muted-foreground">Demo: not a real e-signature. Nothing is sent to a real company.</p>
          </div>
        ) : null
      }
    >
      {d ? (
        <div className="flex flex-col gap-3" data-testid="award-sign-sheet">
          <p className="text-sm text-muted-foreground">
            Between {PRIME_FULL} and the shop · Job {award.job_id} · Part {award.part_no}
          </p>
          <dl className="divide-y divide-border rounded-xl border border-border">
            {rows.map(([k, v]) => (
              <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2.5">
                <dt className="text-sm text-muted-foreground">{k}</dt>
                <dd className="text-base font-medium break-words text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">Signing as: Owner (role only — no name is recorded).</p>
        </div>
      ) : null}
    </BottomSheet>
  )
}

function summaryRows(d: AwardDocument, award: Award): [string, string][] {
  if (d.key === "subcontract") {
    return [
      ["Quantity", award.qty != null ? award.qty.toLocaleString("en-US") : "—"],
      ["Unit price", award.unit_price_cad != null ? fmtMoney(award.unit_price_cad) : "—"],
      ["Total", fmtMoney(award.value_cad)],
      ["Delivery schedule", "To be agreed at kickoff"],
      ["Payment", "Net 30 (assumption)"],
    ]
  }
  // "Key: value · Key: value" → rows; otherwise one "Summary" row.
  const parts = d.detail.split(" · ")
  if (parts.every((p) => p.includes(": "))) {
    return parts.map((p) => {
      const i = p.indexOf(": ")
      return [p.slice(0, i), p.slice(i + 2)] as [string, string]
    })
  }
  return [["Summary", d.detail]]
}

function Kickoff({
  award,
  phone,
  readOnly,
  busy,
  onBook,
  error,
}: {
  award: Award
  phone: boolean
  readOnly: boolean
  busy: boolean
  onBook: (slot: string) => Promise<Award | null>
  error: string | null
}) {
  const [picked, setPicked] = React.useState<string | null>(null)
  const [rebooking, setRebooking] = React.useState(false)
  const booked = award.call.booked && !!award.call.slot
  const choose = !booked || rebooking

  const book = async () => {
    if (!picked) return
    try {
      await onBook(picked)
      setRebooking(false)
      setPicked(null)
      toast.success("Kickoff call booked", { description: `${fmtSlot(picked)} with Northgate (demo — no invite was sent).` })
    } catch {
      toast.error("Could not book that time", { description: error ?? "Try another time." })
    }
  }

  // Group slots by day for a calm grid.
  const days = React.useMemo(() => {
    const m = new Map<string, string[]>()
    for (const s of award.call.slots) {
      const d = new Date(s)
      const k = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
      m.set(k, [...(m.get(k) ?? []), s])
    }
    return [...m.entries()]
  }, [award.call.slots])

  return (
    <section aria-labelledby="award-kickoff" className="rounded-xl border border-border bg-card px-4 py-4 sm:px-5" data-testid="award-kickoff">
      <h2 id="award-kickoff" className="flex items-center gap-2 text-lg font-semibold">
        <PhoneCall className="size-5 text-muted-foreground" aria-hidden />
        Kickoff call with Northgate
      </h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{award.call.duration_min ?? 30} minutes with {award.call.with}. Pick a time that suits the shop.</p>

      {booked && !rebooking ? (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-assigned/25 bg-assigned-soft px-4 py-3" data-testid="award-call-booked">
          <p className="flex items-center gap-2 text-base font-semibold text-foreground">
            <CalendarCheck className="size-5 text-assigned" aria-hidden />
            Booked: {fmtSlot(award.call.slot)}
          </p>
          <p className="text-sm text-foreground/80">With {award.call.with}</p>
          <p className="text-sm text-foreground/80">Demo: no invite was sent.</p>
          <div className="flex flex-wrap gap-2">
            <Button size={phone ? "touch" : "default"} variant="outline" onClick={() => downloadIcs(award)}>
              <CalendarPlus aria-hidden />
              Add to calendar (.ics)
            </Button>
            {!readOnly ? (
              <Button size={phone ? "touch" : "default"} variant="ghost" onClick={() => setRebooking(true)}>
                Change time
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {choose && !readOnly ? (
        <div className="mt-3 flex flex-col gap-3">
          {days.map(([day, slots]) => (
            <fieldset key={day} className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium text-foreground">{day}</legend>
              <div className="grid grid-cols-2 gap-2">
                {slots.map((s) => {
                  const on = picked === s
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPicked(s)}
                      className={cn(
                        "rounded-lg border px-3 text-base font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        phone ? "min-h-12" : "min-h-10",
                        on ? "border-emerald-700 bg-emerald-700 text-white" : "border-border bg-background text-foreground hover:bg-muted"
                      )}
                      data-testid="award-slot"
                    >
                      {new Date(s).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              size={phone ? "touch-lg" : "lg"}
              className="flex-1 bg-emerald-700 text-white hover:bg-emerald-800"
              disabled={!picked || busy}
              onClick={() => void book()}
            >
              <CalendarCheck aria-hidden />
              {picked ? `Book kickoff call · ${fmtSlot(picked)}` : "Book kickoff call"}
            </Button>
            {rebooking ? (
              <Button size={phone ? "touch-lg" : "lg"} variant="ghost" onClick={() => setRebooking(false)}>
                Keep current time
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {!booked && readOnly ? <p className="mt-3 text-base text-muted-foreground">Not booked yet.</p> : null}

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-foreground">Agenda</h3>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-muted-foreground">
          {award.call.agenda.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function NextSteps({ steps }: { steps: string[] }) {
  return (
    <section aria-labelledby="award-next" className="rounded-xl border border-border bg-card px-4 py-4 sm:px-5">
      <h2 id="award-next" className="text-lg font-semibold">
        What happens next
      </h2>
      <ol className="mt-2 flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={s} className="flex items-start gap-3 text-base">
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold tabular-nums">
              {i + 1}
            </span>
            <span className="min-w-0">{s}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function AwardSkeleton({ phone }: { phone: boolean }) {
  return (
    <div
      className={cn("flex flex-col gap-3", phone ? "pt-3" : "mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6")}
      aria-busy="true"
      aria-label="Loading the award package"
    >
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
