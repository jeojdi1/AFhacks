"use client"

// Phone wallet: "Paperwork on file" (docs/api.md §6.2). The same vault as the laptop shop
// page, in a compact list: each reusable document, its status, and one tap to mark it on file.
// Shieldworks records only that a document is on file; no file is stored.

import * as React from "react"
import { toast } from "sonner"
import { CalendarClock, CalendarX, CheckCircle2, CircleDashed, FolderCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { fmtLongDate } from "@/lib/app/today"
import { useVault, type VaultItem, type VaultStatus } from "@/lib/vault"

const STATUS: Record<VaultStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  on_file: { label: "On file", cls: "border-assigned/30 bg-assigned-soft text-assigned", Icon: CheckCircle2 },
  expiring_soon: { label: "Expires soon", cls: "border-orange-300 bg-orange-50 text-orange-800", Icon: CalendarClock },
  expired: { label: "Expired", cls: "border-destructive/40 bg-destructive/5 text-destructive", Icon: CalendarX },
  missing: { label: "Not on file", cls: "border-dashed border-slate-300 bg-background text-slate-600", Icon: CircleDashed },
}

function Row({ item, busy, onMark }: { item: VaultItem; busy: boolean; onMark: (i: VaultItem) => void }) {
  const s = STATUS[item.status] ?? STATUS.missing
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3" data-vault-item={item.key} data-status={item.status}>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-base leading-snug font-semibold">{item.title}</span>
        <span className={cn("inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-sm font-medium whitespace-nowrap", s.cls)}>
          <s.Icon className="size-3.5" aria-hidden />
          {s.label}
        </span>
      </div>
      {item.expires_at ? (
        <p className="text-sm text-muted-foreground">
          {item.status === "expired" ? "Expired" : "Expires"} {fmtLongDate(item.expires_at)}
        </p>
      ) : null}
      {item.status === "missing" || item.status === "expired" ? (
        <Button size="touch" variant="outline" className="w-full" disabled={busy} onClick={() => onMark(item)}>
          Mark on file (demo, no file stored)
        </Button>
      ) : null}
    </li>
  )
}

export function PaperworkSection({ shopId }: { shopId: string }) {
  const v = useVault(shopId)
  if (!v.vault) return null
  const vault = v.vault
  const onMark = async (item: VaultItem) => {
    try {
      await v.mark(item.key)
      toast.success(`On file: ${item.title}`, { description: "Your next award reuses it." })
    } catch {
      toast.error("Could not save that", { description: v.error ?? "Try again." })
    }
  }
  return (
    <section aria-labelledby="wallet-paperwork" className="flex flex-col gap-2 pt-2" data-testid="wallet-paperwork">
      <h2 id="wallet-paperwork" className="flex items-center gap-2 text-base font-semibold">
        <FolderCheck className="size-5 text-assigned" aria-hidden />
        Paperwork on file · {vault.on_file} of {vault.total}
      </h2>
      <p className="text-[15px] text-muted-foreground">
        Do it once: every new award reuses what is on file.
        {vault.time_saved_per_award.minutes > 0 ? ` Saves ${vault.time_saved_per_award.label} per award ` : " "}
        {vault.time_saved_per_award.minutes > 0 ? <AssumptionTag note={vault.time_saved_per_award.basis} /> : null}
      </p>
      <ul className="flex flex-col gap-2">
        {vault.items.map((item) => (
          <Row key={item.key} item={item} busy={v.busy} onMark={(i) => void onMark(i)} />
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">{vault.note}</p>
    </section>
  )
}
