"use client"

// Weekly one-tap capacity check-in (docs/app-spec.md §2.7, T7). Owner: Agent T.
// Opens from the Today card and from a "Confirm capacity" row on the Grow tab
// (import CapacityCheckinRow). Chips only, no typing: answerable in under 5 s,
// and works on a shared floor tablet.

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Check, ChevronRight, Clock, CloudUpload, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { PROCESS_LABEL, label } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { useDemo } from "@/lib/data/store"
import { decisionKey, shopInfo, useAppActions, useShopActions } from "@/lib/app/actions-store"
import { extendStrings, t } from "@/lib/app/strings"
import { fmtDay } from "@/lib/app/today"
import {
  CAPACITY_CHIPS,
  HORIZON_WEEKS,
  type CapacityCheckin,
  type CapacityResult,
  type HorizonWeeks,
  type HoursByProcess,
  type ProcessTag,
  type Shop,
} from "@/lib/app/types"

extendStrings("en", {
  "checkin.title": "Free hours per week, next {weeks} weeks?",
  "checkin.subtitle": "One tap per process. Hours you could take on new work, not hours already booked.",
  "checkin.context": "Accepted work: {accepted} h/wk · profile capacity {capacity} h/wk",
  "checkin.same": "Same as last time ✓",
  "checkin.sameDetail": "{hours} h/wk · {weeks} weeks",
  "checkin.horizon": "How far ahead",
  "checkin.horizonWeeks": "{weeks} weeks",
  "checkin.chip": "{hours}",
  "checkin.chipMax": "120+",
  "checkin.processLegend": "{process} · h/wk",
  "checkin.chipLabel": "{process}: {hours} hours per week free",
  "checkin.confirm": "Confirm {hours} h/wk free",
  "checkin.confirmEmpty": "Tap an amount to confirm",
  "checkin.sending": "Saving…",
  "checkin.confirmed": "Confirmed {date} · {hours} h/wk free",
  "checkin.confirmedHorizon": "For the next {weeks} weeks",
  "checkin.fine": "Routing still uses your profile capacity; confirmed capacity feeds routing in the next release.",
  "checkin.done": "Done",
  "checkin.change": "Change",
  "checkin.close": "Close",
  "checkin.row": "Confirm capacity",
  "checkin.rowNever": "Weekly check-in · not confirmed yet",
  "checkin.rowLast": "Confirmed {date} · {hours} h/wk free",
})

/** Chip value → label ("0 h" … "120+ h"). */
function chipText(h: number): string {
  return h >= CAPACITY_CHIPS[CAPACITY_CHIPS.length - 1] ? t("checkin.chipMax") : t("checkin.chip", { hours: h })
}

function sumHours(by: HoursByProcess): number {
  return Object.values(by).reduce<number>((s, h) => s + (typeof h === "number" ? h : 0), 0)
}

/** Accepted weekly load for a shop from the demo assignments plus stored decisions. */
function useAcceptedHours(shopId: string): number {
  const { assignments } = useDemo()
  const { decisions } = useAppActions()
  return React.useMemo(
    () =>
      assignments
        .filter((a) => a.shop_id === shopId && (decisions[decisionKey(shopId, a.job_id)]?.decision ?? a.status) === "accepted")
        .reduce((s, a) => s + a.hours_week, 0),
    [assignments, decisions, shopId]
  )
}

// ---------------------------------------------------------------------------

export interface CapacitySheetProps {
  shopId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The shop profile (processes, capacity). Falls back to the seeded shop list. */
  shop?: Shop | null
  /** Accepted weekly hours; computed from the demo assignments when omitted. */
  acceptedHours?: number
  /** Called after a successful check-in. */
  onConfirmed?: (r: CapacityResult) => void
}

/** Bottom sheet: "Free hours per week, next 4 weeks?" with one chip row per process. */
export function CapacitySheet({ shopId, open, onOpenChange, shop, acceptedHours, onConfirmed }: CapacitySheetProps) {
  const profile = shop ?? shopInfo(shopId)
  const actions = useShopActions(shopId)
  const computed = useAcceptedHours(shopId)
  const accepted = acceptedHours ?? computed
  // Remount the form each time the sheet opens so it starts from the last
  // check-in (adjusting state during render, not in an effect).
  const [gen, setGen] = React.useState(0)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setGen((g) => g + 1)
  }
  const handleOpenChange = (next: boolean) => onOpenChange(next)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => handleOpenChange(next)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none" />
        <DialogPrimitive.Popup
          data-testid="capacity-sheet"
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[430px] flex-col rounded-t-2xl bg-background text-base text-foreground shadow-lg ring-1 ring-foreground/10 outline-none",
            "duration-200 data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom motion-reduce:animate-none"
          )}
        >
          <CapacityForm
            key={gen}
            processes={(profile?.processes ?? []) as ProcessTag[]}
            capacityHours={profile?.capacity_hours_week ?? null}
            accepted={accepted}
            last={actions.capacity}
            confirm={actions.confirmCapacity}
            onDone={() => handleOpenChange(false)}
            onConfirmed={onConfirmed}
          />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function CapacityForm({
  processes,
  capacityHours,
  accepted,
  last,
  confirm,
  onDone,
  onConfirmed,
}: {
  processes: ProcessTag[]
  capacityHours: number | null
  accepted: number
  last: CapacityCheckin | null
  confirm: ReturnType<typeof useShopActions>["confirmCapacity"]
  onDone: () => void
  onConfirmed?: (r: CapacityResult) => void
}) {
  const [by, setBy] = React.useState<HoursByProcess>(() => {
    const init: HoursByProcess = {}
    for (const p of processes) {
      const v = last?.by_process?.[p]
      if (typeof v === "number") init[p] = v
    }
    return init
  })
  const [horizon, setHorizon] = React.useState<HorizonWeeks>(last?.horizon_weeks ?? 4)
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<CapacityResult | null>(null)
  const titleId = React.useId()

  const chosen = processes.filter((p) => typeof by[p] === "number")
  const total = sumHours(by)

  const submit = async (input: { hours_week: number | null; by_process: HoursByProcess | null; horizon_weeks: HorizonWeeks }) => {
    if (busy) return
    setBusy(true)
    try {
      const r = await confirm(input)
      if (r) {
        setResult(r)
        onConfirmed?.(r)
      }
    } finally {
      setBusy(false)
    }
  }

  const sameAsLast = () => {
    if (!last) return
    const lastBy = last.by_process && Object.keys(last.by_process).length ? last.by_process : null
    if (lastBy) setBy(lastBy)
    void submit({ hours_week: lastBy ? null : last.hours_week, by_process: lastBy, horizon_weeks: horizon })
  }

  const header = (
    <div className="flex items-start gap-2 border-b border-border px-4 pt-2 pb-3">
      <div className="min-w-0 flex-1 pt-2">
        <span aria-hidden className="mx-auto mb-3 block h-1.5 w-10 rounded-full bg-border" />
        <DialogPrimitive.Title id={titleId} className="text-lg leading-snug font-semibold">
          {t("checkin.title", { weeks: result?.capacity.horizon_weeks ?? horizon })}
        </DialogPrimitive.Title>
        {!result ? (
          <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">{t("checkin.subtitle")}</DialogPrimitive.Description>
        ) : null}
      </div>
      <DialogPrimitive.Close
        render={<Button variant="ghost" size="icon-touch" className="shrink-0" />}
        aria-label={t("checkin.close")}
      >
        <X aria-hidden />
      </DialogPrimitive.Close>
    </div>
  )

  if (result) {
    const cap = result.capacity
    return (
      <>
        {header}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4">
          <div role="status" className="flex items-start gap-3 rounded-xl border border-assigned/25 bg-assigned-soft p-4 text-assigned">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-assigned text-white">
              <Check className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold">{t("checkin.confirmed", { date: fmtDay(cap.confirmed_at), hours: cap.hours_week })}</p>
              <p className="mt-0.5 text-sm">{t("checkin.confirmedHorizon", { weeks: cap.horizon_weeks })}</p>
              {cap.pending ? (
                <span className="mt-2 inline-flex h-6 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 text-xs font-semibold text-amber-800">
                  <CloudUpload className="size-3.5" aria-hidden />
                  {t("offline.willSend")}
                </span>
              ) : null}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{t("checkin.fine")}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" size="touch-lg" onClick={() => setResult(null)}>
            {t("checkin.change")}
          </Button>
          <Button size="touch-lg" onClick={onDone}>
            {t("checkin.done")}
          </Button>
        </div>
      </>
    )
  }

  return (
    <>
      {header}
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-4">
        {capacityHours !== null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-4 shrink-0" aria-hidden />
            {t("checkin.context", { accepted, capacity: capacityHours })}
          </p>
        ) : null}

        {last ? (
          <button
            type="button"
            onClick={sameAsLast}
            disabled={busy}
            className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border-2 border-brand/40 bg-brand/5 px-4 py-2 text-left outline-none transition-colors hover:bg-brand/10 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 motion-reduce:transition-none"
          >
            <span className="text-base font-semibold text-brand">{t("checkin.same")}</span>
            <span className="text-sm text-muted-foreground">{t("checkin.sameDetail", { hours: last.hours_week, weeks: horizon })}</span>
          </button>
        ) : null}

        {processes.map((p) => {
          const pid = `${titleId}-${p}`
          const name = label(PROCESS_LABEL, p)
          return (
            <fieldset key={p} className="flex flex-col gap-2">
              <legend id={pid} className="mb-2 text-base font-semibold">
                {t("checkin.processLegend", { process: name })}
              </legend>
              <div role="radiogroup" aria-labelledby={pid} className="grid grid-cols-5 gap-2">
                {CAPACITY_CHIPS.map((h) => {
                  const on = by[p] === h
                  return (
                    <button
                      key={h}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={t("checkin.chipLabel", { process: name, hours: h >= 120 ? "120 or more" : h })}
                      onClick={() => setBy((cur) => ({ ...cur, [p]: h }))}
                      className={cn(
                        "flex min-h-12 items-center justify-center rounded-lg border px-1 text-base font-semibold tabular-nums outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                        on ? "border-brand bg-brand text-white" : "border-border bg-card text-foreground hover:bg-muted"
                      )}
                    >
                      {chipText(h)}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )
        })}

        <fieldset className="flex flex-col gap-2">
          <legend id={`${titleId}-h`} className="mb-2 text-base font-semibold">
            {t("checkin.horizon")}
          </legend>
          <div role="radiogroup" aria-labelledby={`${titleId}-h`} className="grid grid-cols-3 gap-2">
            {HORIZON_WEEKS.map((w) => {
              const on = horizon === w
              return (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setHorizon(w)}
                  className={cn(
                    "flex min-h-12 items-center justify-center gap-1.5 rounded-lg border text-base font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                    on ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted"
                  )}
                >
                  {on ? <Check className="size-4" aria-hidden /> : null}
                  {t("checkin.horizonWeeks", { weeks: w })}
                </button>
              )
            })}
          </div>
        </fieldset>

        <p className="text-sm text-muted-foreground">{t("checkin.fine")}</p>
      </div>
      <div className="border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          size="touch-lg"
          className="w-full"
          disabled={busy || chosen.length === 0}
          onClick={() => {
            const byProcess: HoursByProcess = {}
            for (const p of chosen) byProcess[p] = by[p]
            void submit({ hours_week: total, by_process: byProcess, horizon_weeks: horizon })
          }}
        >
          {busy ? t("checkin.sending") : chosen.length ? t("checkin.confirm", { hours: total }) : t("checkin.confirmEmpty")}
        </Button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

/**
 * "Confirm capacity" row for other shop screens (the Grow tab): shows the last
 * check-in and opens the sheet. Self-contained; just pass the shop id.
 */
export function CapacityCheckinRow({ shopId, shop, className }: { shopId: string; shop?: Shop | null; className?: string }) {
  const [open, setOpen] = React.useState(false)
  const { capacity } = useShopActions(shopId)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-xs outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted motion-reduce:transition-none",
          className
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Clock className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">{t("checkin.row")}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            {capacity ? t("checkin.rowLast", { date: fmtDay(capacity.confirmed_at), hours: capacity.hours_week }) : t("checkin.rowNever")}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      <CapacitySheet shopId={shopId} shop={shop} open={open} onOpenChange={setOpen} />
    </>
  )
}
