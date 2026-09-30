"use client"

// Right-sized work on the laptop shop page (docs/api.md §9): the work package banner (all of
// Northgate's offers as one yearly figure, checked against the shop's own minimum), the
// shop's work preferences with a small editor, the size line on each offer, and the inline
// counter-offer picker. Plain words only; the 8-year duration is labelled "assumption".

import { useId, useState } from "react"
import { CircleCheck, Package, Pencil, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { cn } from "@/lib/utils"
import { fmtMoney } from "@/lib/format"
import { useDemo } from "@/lib/data/store"
import { useAppActions } from "@/lib/app/actions-store"
import { savePreferences } from "@/lib/app/preferences"
import { extendStrings, t } from "@/lib/app/strings"
import {
  MIN_ANNUAL_CHIPS,
  forYears,
  minAnnualLabel,
  minimumText,
  packageLine,
  packageVerdict,
  perYear,
  type OfferSize,
  type PackageSize,
  type ShopPrefs,
} from "@/lib/app/sizing"
import { DECISION_NOTE_MAX, MIN_QUANTITY_MAX, SETUP_CHARGE_MAX, type CounterTerms } from "@/lib/app/types"

extendStrings("en", {
  "wp.title": "Your work from {prime}, as one package",
  "wp.prefs": "What's worth your time",
  "wp.prefs.edit": "Change",
  "wp.prefs.save": "Save",
  "wp.prefs.cancel": "Cancel",
  "wp.prefs.saved": "Saved",
  "wp.prefs.savedBody": "Offers now show whether they meet {min}.",
  "wp.prefs.savedDemo": "Saved on this device (demo)",
  "wp.prefs.failed": "Could not save",
  "wp.prefs.note": "Only you and Northgate see this. It never changes which jobs you are offered.",
  "wp.prefs.ongoingYes": "Prefers ongoing work",
  "wp.prefs.ongoingNo": "One-off jobs are fine",
  "wp.prefs.none": "Tell Northgate the smallest work worth your time.",
  "wp.counter.title": "Counter-offer on {job}: what would make this job work for you?",
  "wp.counter.setup": "One-time setup charge ($)",
  "wp.counter.qty": "Minimum run (parts per order)",
  "wp.counter.note": "Note (optional). No drawings, dimensions or technical data.",
  "wp.counter.send": "Send counter-offer",
  "wp.counter.pick": "Add a setup charge or a minimum run",
  "wp.counter.cancel": "Cancel",
  "wp.counter.help": "{prime} can accept your terms or keep its original offer. The job's value and credit don't change in this demo.",
})

const money = (n: number) => fmtMoney(n, { compact: true })

/** Northgate's offers as one yearly figure, checked against the shop's minimum. */
export function WorkPackageBanner({ pkg, prefs, className }: { pkg: PackageSize; prefs: ShopPrefs; className?: string }) {
  const verdict = packageVerdict(pkg)
  // Small on their own, fine as a package: the "bundle" story in one sentence.
  const bundled = pkg.meets === true && pkg.belowIds.length > 0
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3",
        pkg.meets === false ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-zinc-50",
        className
      )}
      data-work-package
      data-meets-minimum={pkg.meets === null ? "none" : String(pkg.meets)}
    >
      <Package className={cn("mt-0.5 size-5 shrink-0", pkg.meets === false ? "text-amber-700" : "text-zinc-600")} aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-zinc-900">
          {packageLine(pkg)}
          {pkg.assumed ? <AssumptionTag note={t("size.assumption", { years: pkg.years })} /> : null}
        </p>
        {verdict ? (
          <p
            className={cn(
              "mt-1 flex items-center gap-1.5 font-medium",
              pkg.meets ? "text-emerald-800" : "text-amber-900"
            )}
          >
            {pkg.meets ? <CircleCheck className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}
            {verdict}
          </p>
        ) : null}
        {bundled ? (
          <p className="mt-0.5 text-zinc-600">{t("size.packageBundle", { count: pkg.belowIds.length })}</p>
        ) : null}
        {prefs.min_annual_value_cad == null && prefs.basis == null ? (
          <p className="mt-0.5 text-zinc-600">{t("wp.prefs.none")}</p>
        ) : null}
      </div>
    </div>
  )
}

/** The shop's work preferences, with an inline editor (chips, no typing needed). */
export function PreferencesEditor({ shopId, prefs, className }: { shopId: string; prefs: ShopPrefs; className?: string }) {
  const demo = useDemo()
  const actions = useAppActions()
  const [editing, setEditing] = useState(false)
  const [min, setMin] = useState<number | null>(prefs.min_annual_value_cad)
  const [ongoing, setOngoing] = useState<boolean>(prefs.prefers_ongoing ?? false)
  const [busy, setBusy] = useState(false)
  const groupId = useId()
  const ongoingId = useId()

  const open = () => {
    setMin(prefs.min_annual_value_cad)
    setOngoing(prefs.prefers_ongoing ?? false)
    setEditing(true)
  }
  const save = async () => {
    setBusy(true)
    try {
      const engine = demo.mode === "live" && actions.source === "engine" ? demo.apiUrl : null
      const r = await savePreferences(engine, shopId, { min_annual_value_cad: min, prefers_ongoing: ongoing }, prefs)
      if (r.via === "engine") toast.success(t("wp.prefs.saved"), { description: t("wp.prefs.savedBody", { min: minAnnualLabel(r.min_annual_value_cad) }) })
      else toast.success(t("wp.prefs.savedDemo"), { description: t("wp.prefs.savedBody", { min: minAnnualLabel(r.min_annual_value_cad) }) })
      setEditing(false)
    } catch (e) {
      toast.error(t("wp.prefs.failed"), { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const chips = MIN_ANNUAL_CHIPS.includes(prefs.min_annual_value_cad as (typeof MIN_ANNUAL_CHIPS)[number])
    ? MIN_ANNUAL_CHIPS
    : [...MIN_ANNUAL_CHIPS, prefs.min_annual_value_cad]

  return (
    <div className={cn("text-sm", className)} data-work-preferences>
      {!editing ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-zinc-600">
          <span className="font-medium text-zinc-800">{t("size.min.label")}:</span>
          <span data-min-annual>{minAnnualLabel(prefs.min_annual_value_cad)}</span>
          {prefs.prefers_ongoing != null ? (
            <>
              <span aria-hidden>·</span>
              <span>{prefs.prefers_ongoing ? t("wp.prefs.ongoingYes") : t("wp.prefs.ongoingNo")}</span>
            </>
          ) : null}
          {prefs.basis === "illustrative" ? (
            <AssumptionTag label={t("size.basis.illustrative")} note="A synthetic demo shop: this preference is made up for the demo." />
          ) : null}
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={open} data-edit-preferences>
            <Pencil className="size-3.5" aria-hidden />
            {t("wp.prefs.edit")}
          </Button>
        </p>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <p id={groupId} className="font-medium text-zinc-900">
            {t("size.min.label")}
          </p>
          <div role="radiogroup" aria-labelledby={groupId} className="mt-2 flex flex-wrap gap-2">
            {chips.map((v) => (
              <button
                key={String(v)}
                type="button"
                role="radio"
                aria-checked={min === v}
                onClick={() => setMin(v)}
                data-min-chip={v ?? "none"}
                className={cn(
                  "h-8 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  min === v ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                )}
              >
                {minAnnualLabel(v)}
              </button>
            ))}
          </div>
          <label htmlFor={ongoingId} className="mt-3 flex items-center gap-2 text-zinc-800">
            <input
              id={ongoingId}
              type="checkbox"
              checked={ongoing}
              onChange={(e) => setOngoing(e.target.checked)}
              className="size-4 accent-zinc-900"
            />
            {t("size.ongoing.label")}
          </label>
          <p className="mt-2 text-xs text-zinc-500">{t("wp.prefs.note")}</p>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => void save()} data-save-preferences>
              {t("wp.prefs.save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t("wp.prefs.cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** "$115K a year · for about 8 years" plus a "Below your $100K minimum" chip when it is. */
export function OfferSizeLine({ size, prefs, className }: { size: OfferSize; prefs: ShopPrefs; className?: string }) {
  const verdict = minimumText(size, prefs)
  return (
    <div className={cn("flex flex-col items-end gap-1 text-sm", className)} data-offer-size>
      <span className="tabular-nums text-zinc-600" title={t("size.assumption", { years: size.years })}>
        {perYear(size.annual)} · {forYears(size.years)}
      </span>
      {verdict ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            size.meets ? "bg-emerald-50 text-emerald-800" : "bg-amber-100 text-amber-900"
          )}
          data-meets-minimum={String(size.meets)}
        >
          {size.meets ? <CircleCheck className="size-3" aria-hidden /> : <TriangleAlert className="size-3" aria-hidden />}
          {verdict}
        </span>
      ) : null}
    </div>
  )
}

const SETUP_CHIPS = [1500, 3000, 5000]
const QTY_CHIPS = [100, 250, 500]

/** Inline counter-offer: a one-time setup charge and/or a minimum run, plus an optional note. */
export function CounterPicker({
  jobId,
  prime,
  busy,
  onCancel,
  onSubmit,
}: {
  jobId: string
  prime: string
  busy: boolean
  onCancel: () => void
  onSubmit: (terms: CounterTerms, note: string | null) => void
}) {
  const [setup, setSetup] = useState("")
  const [qty, setQty] = useState("")
  const [note, setNote] = useState("")
  const setupId = useId()
  const qtyId = useId()
  const noteId = useId()
  const setupN = setup.trim() ? Number(setup) : null
  const qtyN = qty.trim() ? Number(qty) : null
  const setupOk = setupN === null || (Number.isFinite(setupN) && setupN > 0 && setupN <= SETUP_CHARGE_MAX)
  const qtyOk = qtyN === null || (Number.isInteger(qtyN) && qtyN >= 1 && qtyN <= MIN_QUANTITY_MAX)
  const ready = (setupN !== null || qtyN !== null) && setupOk && qtyOk

  const chip = (active: boolean) =>
    cn(
      "h-7 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
    )
  const input =
    "h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"

  return (
    <div className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-4" data-counter-picker={jobId}>
      <p className="text-sm font-medium text-zinc-900">{t("wp.counter.title", { job: jobId })}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={setupId} className="block text-sm text-zinc-700">
            {t("wp.counter.setup")}
          </label>
          <input
            id={setupId}
            inputMode="numeric"
            value={setup}
            onChange={(e) => setSetup(e.target.value.replace(/[^\d.]/g, "").slice(0, 9))}
            aria-invalid={!setupOk || undefined}
            className={cn(input, "mt-1")}
            placeholder="e.g. 3000"
            data-counter-setup
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SETUP_CHIPS.map((v) => (
              <button key={v} type="button" className={chip(setupN === v)} onClick={() => setSetup(String(v))}>
                {money(v)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor={qtyId} className="block text-sm text-zinc-700">
            {t("wp.counter.qty")}
          </label>
          <input
            id={qtyId}
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, "").slice(0, 8))}
            aria-invalid={!qtyOk || undefined}
            className={cn(input, "mt-1")}
            placeholder="e.g. 500"
            data-counter-qty
          />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {QTY_CHIPS.map((v) => (
              <button key={v} type="button" className={chip(qtyN === v)} onClick={() => setQty(String(v))}>
                {v.toLocaleString("en-US")}
              </button>
            ))}
          </div>
        </div>
      </div>
      <label htmlFor={noteId} className="mt-3 block text-sm text-zinc-600">
        {t("wp.counter.note")}
      </label>
      <input
        id={noteId}
        value={note}
        maxLength={DECISION_NOTE_MAX}
        onChange={(e) => setNote(e.target.value.slice(0, DECISION_NOTE_MAX))}
        placeholder={t("decision.notePlaceholder")}
        className={cn(input, "mt-1")}
      />
      <p className="mt-2 text-xs text-zinc-500">{t("wp.counter.help", { prime })}</p>
      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          disabled={!ready || busy}
          onClick={() =>
            ready && onSubmit({ setup_charge_cad: setupN, min_quantity: qtyN }, note.trim() ? note.trim() : null)
          }
          data-send-counter
        >
          {ready ? t("wp.counter.send") : t("wp.counter.pick")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("wp.counter.cancel")}
        </Button>
      </div>
    </div>
  )
}
