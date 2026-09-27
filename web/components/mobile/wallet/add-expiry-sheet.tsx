"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { toast } from "sonner"
import { Info, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/app/strings"
import { addDays, appToday, toISODate } from "@/lib/app/today"
import { certShortName } from "@/lib/app/renewals"
import { CERT_NUMBER_MAX, type CertDeclaration } from "@/lib/app/types"
import "./wallet-strings"

/**
 * Bottom sheet: native date input + optional certificate number. Saves a
 * shop-declared expiry through useShopBundle().actions.declareCertExpiry
 * (live: POST /shops/{id}/certifications/{type}; fixtures: muster.app.v1).
 * Never marks anything verified. No file or photo field.
 */
export function AddExpirySheet({
  open,
  onOpenChange,
  certType,
  initialDate,
  initialNumber,
  declare,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  certType: string
  initialDate: string | null
  initialNumber: string | null
  declare: (certType: string, expiresAt: string, certNumber?: string) => Promise<CertDeclaration | null>
}) {
  const [date, setDate] = React.useState(initialDate ?? "")
  const [num, setNum] = React.useState(initialNumber ?? "")
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const dateId = React.useId()
  const numId = React.useId()
  const errId = React.useId()

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDate(initialDate ?? "")
      setNum(initialNumber ?? "")
      setErr(null)
    }
    onOpenChange(next)
  }

  const today = appToday()
  const min = toISODate(today)
  const max = toISODate(addDays(today, 3652))
  const name = certShortName(certType)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) {
      setErr(t("wallet.sheet.pickDate"))
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const rec = await declare(certType, date, num.trim() || undefined)
      if (rec) {
        // Queued offline: the outbox toast already says "Saved on this phone".
        if (!rec.pending) toast.success(t("wallet.sheet.saved", { cert: name }), { description: t("wallet.sheet.savedBody") })
        onOpenChange(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none" />
        <DialogPrimitive.Popup
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-[430px] flex-col overflow-y-auto rounded-t-2xl bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-base text-foreground shadow-xl outline-none data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom motion-reduce:animate-none"
        >
          <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
          <div className="flex items-start justify-between gap-3">
            <DialogPrimitive.Title className="text-lg leading-snug font-semibold">
              {t("wallet.sheet.title", { cert: name })}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              render={<Button variant="ghost" size="icon-touch" className="-mt-2 -mr-2" />}
              aria-label={t("wallet.sheet.cancel")}
            >
              <XIcon aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="mt-1 text-[15px] text-muted-foreground">
            {t("wallet.sheet.body")}
          </DialogPrimitive.Description>

          <form className="mt-4 flex flex-col gap-4" onSubmit={submit} noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={dateId} className="text-base font-medium">
                {t("wallet.sheet.date")}
              </label>
              <input
                id={dateId}
                type="date"
                required
                min={min}
                max={max}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? errId : undefined}
                className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={numId} className="text-base font-medium">
                {t("wallet.sheet.number")}
              </label>
              <input
                id={numId}
                type="text"
                inputMode="text"
                autoComplete="off"
                maxLength={CERT_NUMBER_MAX}
                value={num}
                onChange={(e) => setNum(e.target.value)}
                className="h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <span className="text-sm text-muted-foreground">{t("wallet.sheet.numberHint")}</span>
            </div>
            {err ? (
              <p id={errId} role="alert" className="text-[15px] font-medium text-destructive">
                {err}
              </p>
            ) : null}
            <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("wallet.sheet.noDrawings")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <DialogPrimitive.Close render={<Button type="button" variant="outline" size="touch-lg" className="w-full" />}>
                {t("wallet.sheet.cancel")}
              </DialogPrimitive.Close>
              <Button type="submit" size="touch-lg" className="w-full" disabled={busy}>
                {busy ? t("wallet.sheet.saving") : t("wallet.sheet.save")}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
