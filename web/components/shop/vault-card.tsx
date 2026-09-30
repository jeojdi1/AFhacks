"use client"

// "Paperwork on file" (docs/api.md §6.2): the reusable paperwork a shop keeps on its profile
// so every new award package reuses it. Shieldworks records only that a document is on file
// (type and dates); no file is stored, and no banking details.

import * as React from "react"
import { toast } from "sonner"
import { CalendarClock, CalendarX, CheckCircle2, CircleDashed, FolderCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtLongDate } from "@/lib/app/today"
import { useVault, type VaultItem, type VaultStatus } from "@/lib/vault"
import { AssumptionPill } from "./badges"

const STATUS: Record<VaultStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  on_file: { label: "On file", cls: "border-emerald-200 bg-emerald-50 text-emerald-800", Icon: CheckCircle2 },
  expiring_soon: { label: "Expires soon", cls: "border-amber-300 bg-amber-50 text-amber-900", Icon: CalendarClock },
  expired: { label: "Expired", cls: "border-red-200 bg-red-50 text-red-800", Icon: CalendarX },
  missing: { label: "Not on file", cls: "border-dashed border-slate-300 bg-background text-slate-600", Icon: CircleDashed },
}

function StatusChip({ status }: { status: VaultStatus }) {
  const s = STATUS[status] ?? STATUS.missing
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium", s.cls)}>
      <s.Icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  )
}

function dates(item: VaultItem): string | null {
  const parts: string[] = []
  if (item.on_file_at) parts.push(`On file since ${fmtLongDate(item.on_file_at)}`)
  if (item.expires_at) parts.push(`${item.status === "expired" ? "Expired" : "Expires"} ${fmtLongDate(item.expires_at)}`)
  return parts.length ? parts.join(" · ") : null
}

function Row({
  item,
  busy,
  readOnly,
  onMark,
}: {
  item: VaultItem
  busy: boolean
  readOnly: boolean
  onMark: (item: VaultItem, onFile: boolean, expiresAt: string | null) => Promise<void>
}) {
  const [adding, setAdding] = React.useState(false)
  const [expiry, setExpiry] = React.useState("")
  const needsAction = item.status === "missing" || item.status === "expired"
  const when = dates(item)
  const inputId = `vault-expiry-${item.key}`
  return (
    <li className="grid gap-x-4 gap-y-2 px-5 py-3.5 sm:px-6 md:grid-cols-[minmax(0,1.6fr)_auto_minmax(0,1.2fr)] md:items-start" data-vault-item={item.key} data-status={item.status}>
      <div className="min-w-0">
        <div className="font-medium text-foreground">{item.title}</div>
        <div className="text-sm text-muted-foreground">{item.why}</div>
      </div>
      <div className="md:pt-0.5">
        <StatusChip status={item.status} />
      </div>
      <div className="min-w-0 space-y-2 text-sm text-muted-foreground">
        {when ? <div className="tabular-nums">{when}</div> : null}
        {item.source === "synthetic" ? <div>Synthetic shop: illustrative record</div> : null}
        {item.award_document && item.reusable ? (
          <div className="text-emerald-800">Reused on every award package</div>
        ) : item.status === "expired" ? (
          <div className="text-red-800">Not reused until you send a current one</div>
        ) : null}
        {readOnly ? null : needsAction && !adding ? (
          <Button variant="outline" disabled={busy} onClick={() => setAdding(true)} data-testid={`vault-add-${item.key}`}>
            Mark on file
          </Button>
        ) : needsAction && adding ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void onMark(item, true, expiry || null).then(() => setAdding(false))
            }}
          >
            {item.has_expiry ? (
              <label htmlFor={inputId} className="flex flex-col gap-1 text-sm text-foreground">
                Expiry date (optional)
                <input
                  id={inputId}
                  type="date"
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                />
              </label>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy} data-testid={`vault-save-${item.key}`}>
                Save (demo, no file stored)
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="ghost" className="px-0 text-muted-foreground" disabled={busy} onClick={() => void onMark(item, false, null)}>
            Remove from profile
          </Button>
        )}
      </div>
    </li>
  )
}

/** Laptop shop page: the shop's reusable paperwork. `readOnly` for a viewer who is not the shop. */
export function VaultCard({ shopId, readOnly = false }: { shopId: string; readOnly?: boolean }) {
  const v = useVault(shopId)
  const onMark = async (item: VaultItem, onFile: boolean, expiresAt: string | null) => {
    try {
      await v.mark(item.key, { onFile, expiresAt })
      toast.success(onFile ? `On file: ${item.title}` : `Removed: ${item.title}`, {
        description: onFile
          ? item.award_document
            ? "Your next award package reuses it. Demo: no file is stored."
            : "Kept on your profile. Demo: no file or banking details are stored."
          : "The next award asks for it again.",
      })
    } catch {
      toast.error("Could not save that", { description: v.error ?? "Try again." })
    }
  }

  if (v.loading && !v.vault) {
    return <Skeleton className="h-48 w-full rounded-xl" />
  }
  if (!v.vault) {
    return (
      <section className="rounded-xl border border-border bg-card px-5 py-5 text-sm text-muted-foreground sm:px-6" data-vault-card>
        Paperwork on file is not available right now{v.error ? `: ${v.error}` : "."}
      </section>
    )
  }
  const vault = v.vault
  const saved = vault.time_saved_per_award
  return (
    <section className="rounded-xl border border-border bg-card" data-vault-card>
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-5 sm:px-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
            <FolderCheck className="size-5 text-emerald-700" aria-hidden />
            Paperwork on file
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            Do the paperwork once. Every new award package reuses what is on file here, so a second job runs like any other
            project.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm text-muted-foreground" data-vault-summary>
          <span className="tabular-nums">
            <span className="text-2xl font-semibold text-foreground">{vault.on_file}</span> of {vault.total} on file
            {vault.expired ? <span className="font-medium text-red-800"> · {vault.expired} expired</span> : null}
            {vault.expiring_soon ? <span className="font-medium text-amber-900"> · {vault.expiring_soon} expiring soon</span> : null}
          </span>
          {saved.minutes > 0 ? (
            <span className="flex items-center gap-1.5">
              Saves {saved.label} per award <AssumptionPill />
            </span>
          ) : null}
        </div>
      </header>
      <ul className="divide-y divide-border">
        {vault.items.map((item) => (
          <Row key={item.key} item={item} busy={v.busy} readOnly={readOnly} onMark={onMark} />
        ))}
      </ul>
      <p className="border-t border-border bg-muted/40 px-5 py-2.5 text-xs text-muted-foreground sm:px-6">
        {vault.note}
        {v.source === "local" ? " Saved on this device (demo data)." : null}
      </p>
    </section>
  )
}
