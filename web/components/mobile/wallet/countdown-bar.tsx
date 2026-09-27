import { cn } from "@/lib/utils"
import { addDays, daysBetween, toISODate } from "@/lib/app/today"
import { t } from "@/lib/app/strings"
import { URGENT_DAYS, certShortName, shortDate } from "@/lib/app/renewals"
import type { Renewal } from "@/lib/app/types"
import "./wallet-strings"

/**
 * Timeline from before the reminder window to expiry. Shades the reminder
 * window (amber), the last 30 days before act-by (orange) and the time past
 * act-by (red hatch), with a "Today" marker. Static: no motion.
 */
export function CountdownBar({
  renewal,
  remindDays,
  today,
  className,
}: {
  renewal: Renewal
  remindDays: number
  today: Date
  className?: string
}) {
  const { expires_at: expires, act_by: actBy } = renewal
  if (!expires || !actBy) return null

  const windowStart = toISODate(addDays(actBy, -remindDays))
  const urgentStart = toISODate(addDays(actBy, -URGENT_DAYS))
  const todayIso = toISODate(today)
  // Start a little before the window (or before today, whichever is earlier); end at expiry or today.
  const lead = Math.max(14, Math.round(remindDays / 3))
  const start = [toISODate(addDays(windowStart, -lead)), todayIso].sort()[0]
  const end = [expires, todayIso].sort()[1]
  const span = Math.max(1, daysBetween(start, end))
  const pos = (iso: string) => Math.min(100, Math.max(0, (daysBetween(start, iso) / span) * 100))

  const pWindow = pos(windowStart)
  const pUrgent = pos(urgentStart)
  const pActBy = pos(actBy)
  const pExpires = pos(expires)
  const pToday = pos(todayIso)

  const label = t("wallet.bar.label", {
    cert: certShortName(renewal.cert_type),
    today: shortDate(todayIso, today),
    actBy: shortDate(actBy, today),
    expires: shortDate(expires, today),
  })

  return (
    <figure className={cn("m-0 w-full", className)}>
      <div role="img" aria-label={label} className="relative h-12 w-full">
        {/* track */}
        <div className="absolute inset-x-0 top-4 h-4 overflow-hidden rounded-full border border-border bg-muted">
          <div
            className="absolute inset-y-0 bg-amber-200"
            style={{ left: `${pWindow}%`, width: `${Math.max(0, pUrgent - pWindow)}%` }}
          />
          <div
            className="absolute inset-y-0 bg-orange-400"
            style={{ left: `${pUrgent}%`, width: `${Math.max(0, pActBy - pUrgent)}%` }}
          />
          <div
            className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,var(--color-red-500)_0_4px,var(--color-red-300)_4px_8px)]"
            style={{ left: `${pActBy}%`, width: `${Math.max(0, pExpires - pActBy)}%` }}
          />
          {pExpires < 100 ? (
            <div className="absolute inset-y-0 bg-red-700" style={{ left: `${pExpires}%`, right: 0 }} />
          ) : null}
        </div>
        {/* act-by tick */}
        <div className="absolute top-2 h-8 w-0.5 -translate-x-1/2 bg-foreground/70" style={{ left: `${pActBy}%` }} aria-hidden />
        {/* today marker */}
        <div className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${pToday}%` }} aria-hidden>
          <div className="size-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-foreground" />
          <div className="h-8 w-[3px] rounded-full bg-foreground" />
        </div>
      </div>
      <figcaption className="mt-1 grid grid-cols-3 gap-2 text-sm leading-tight text-muted-foreground">
        <span>
          <span className="block font-medium text-foreground">{t("wallet.bar.today")}</span>
          {shortDate(todayIso, today)}
        </span>
        <span className="text-center">
          <span className="block font-medium text-foreground">{t("wallet.row.actBy")}</span>
          {shortDate(actBy, today)}
        </span>
        <span className="text-right">
          <span className="block font-medium text-foreground">{t("wallet.row.expires")}</span>
          {shortDate(expires, today)}
        </span>
      </figcaption>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-hidden>
        <li className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm bg-amber-200" />
          {t("wallet.bar.window")}
        </li>
        <li className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm bg-orange-400" />
          {t("wallet.bar.urgent")}
        </li>
        <li className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm bg-red-500" />
          {t("wallet.bar.late")}
        </li>
      </ul>
    </figure>
  )
}
