// Minimal iCalendar (RFC 5545) builder for one all-day event, e.g. the trainee's
// example test date. No personal data goes into the file.

import { toISODate } from "./today"

export interface IcsEvent {
  uid: string
  title: string
  description?: string
  /** All-day event on this local calendar date. */
  date: Date
  url?: string
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1")
}

/** Fold lines longer than 75 characters (continuation lines start with a space). */
function fold(line: string): string {
  if (line.length <= 75) return line
  const out: string[] = [line.slice(0, 75)]
  for (let i = 75; i < line.length; i += 74) out.push(` ${line.slice(i, i + 74)}`)
  return out.join("\r\n")
}

const compact = (d: Date) => toISODate(d).replace(/-/g, "")

export function buildIcs(e: IcsEvent, now: Date = new Date()): string {
  const end = new Date(e.date.getFullYear(), e.date.getMonth(), e.date.getDate() + 1)
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Shieldworks//Phone app//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${esc(e.uid)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(e.date)}`,
    `DTEND;VALUE=DATE:${compact(end)}`,
    `SUMMARY:${esc(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.map(fold).join("\r\n") + "\r\n"
}

/** data: URL for an <a href download>. iOS Safari offers "Add to Calendar" for text/calendar. */
export function icsDataUrl(ics: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
}
