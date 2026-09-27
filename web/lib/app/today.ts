// Date helpers for the phone app. Every "today" in /m goes through appToday()
// so a recording can pin the date with NEXT_PUBLIC_MUSTER_TODAY=YYYY-MM-DD.
// Day maths works on local calendar dates, so DST never shifts a count.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function pinned(): Date | null {
  const raw = (process.env.NEXT_PUBLIC_MUSTER_TODAY || "").trim()
  const m = ISO_DATE.exec(raw)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Today. With NEXT_PUBLIC_MUSTER_TODAY set, that date (local time) with the
 * current wall-clock time, so "Updated 9:42 PM" still reads naturally.
 */
export function appToday(): Date {
  const now = new Date()
  const p = pinned()
  if (!p) return now
  p.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
  return p
}

/**
 * Parse "YYYY-MM-DD" as a local calendar date, or any ISO timestamp as-is.
 * Returns null for empty or invalid input.
 */
export function parseAppDate(v: string | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  const m = ISO_DATE.exec(v.trim())
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function dayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

/** Whole calendar days from a to b (b − a). Positive when b is later. */
export function daysBetween(a: Date | string, b: Date | string): number {
  const da = parseAppDate(a)
  const db = parseAppDate(b)
  if (!da || !db) return NaN
  return dayNumber(db) - dayNumber(da)
}

/** d plus n calendar days (local midnight). */
export function addDays(d: Date | string, n: number): Date {
  const base = parseAppDate(d) ?? new Date()
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n)
}

/** d plus n business days (Mon–Fri; no holiday calendar). n may be negative. */
export function addBusinessDays(d: Date | string, n: number): Date {
  const base = parseAppDate(d) ?? new Date()
  const out = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  const step = n < 0 ? -1 : 1
  let left = Math.abs(Math.trunc(n))
  while (left > 0) {
    out.setDate(out.getDate() + step)
    const wd = out.getDay()
    if (wd !== 0 && wd !== 6) left -= 1
  }
  return out
}

/** Local calendar date as "YYYY-MM-DD". */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// ---------------------------------------------------------------------------
// Display formats (English; French formats arrive with the fr dictionary)

const LOCALE = "en-US"

/** "9:42 PM" */
export function fmtTime(v: Date | string | null | undefined): string {
  const d = parseAppDate(v)
  return d ? d.toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" }) : "—"
}

/** "Oct 17" (adds the year when it is not the current app year). */
export function fmtDay(v: Date | string | null | undefined): string {
  const d = parseAppDate(v)
  if (!d) return "—"
  const sameYear = d.getFullYear() === appToday().getFullYear()
  return d.toLocaleDateString(LOCALE, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })
}

/** "Thu Oct 1" */
export function fmtWeekday(v: Date | string | null | undefined): string {
  const d = parseAppDate(v)
  return d ? d.toLocaleDateString(LOCALE, { weekday: "short", month: "short", day: "numeric" }) : "—"
}

/** "Sep 26, 9:41 PM" */
export function fmtDateTime(v: Date | string | null | undefined): string {
  const d = parseAppDate(v)
  return d ? `${fmtDay(d)}, ${fmtTime(d)}` : "—"
}

/** "2027-09-06" → "Sep 6, 2027" */
export function fmtLongDate(v: Date | string | null | undefined): string {
  const d = parseAppDate(v)
  return d ? d.toLocaleDateString(LOCALE, { month: "short", day: "numeric", year: "numeric" }) : "—"
}
