// Plain-language summaries of an award package, and the kickoff call as .ics.

import type { Award, AwardStatus } from "./types"

export function paperworkCount(award: Award): { done: number; total: number } {
  return { done: award.documents.filter((d) => d.status === "done").length, total: award.documents.length }
}

/** Kickoff calls are held in Northgate's time zone (London, ON). */
const TZ = "America/Toronto"

/** "Tue Sep 29, 10:00 AM" (Eastern time). */
export function fmtSlot(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const wd = d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ })
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ })
  const day = `${wd} ${md}`
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })
  return `${day}, ${time}`
}

export const AWARD_STATUS_LABEL: Record<AwardStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
}

/** "Paperwork 3 of 7 · Kickoff Tue Sep 29, 10:00 AM" (or "· Kickoff not booked"). */
export function awardSummary(award: Award): string {
  const { done, total } = paperworkCount(award)
  const call = award.call.booked && award.call.slot ? `Kickoff ${fmtSlot(award.call.slot)}` : "Kickoff not booked"
  return `Paperwork ${done} of ${total} · ${call}`
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1")
}
function fold(line: string): string {
  if (line.length <= 75) return line
  const out: string[] = [line.slice(0, 75)]
  for (let i = 75; i < line.length; i += 74) out.push(` ${line.slice(i, i + 74)}`)
  return out.join("\r\n")
}
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")

/** A 30-minute kickoff call as iCalendar text, or null when no slot is booked. No personal data. */
export function buildIcs(award: Award, now: Date = new Date()): string | null {
  if (!award.call.slot) return null
  const start = new Date(award.call.slot)
  if (Number.isNaN(start.getTime())) return null
  const end = new Date(start.getTime() + (award.call.duration_min ?? 30) * 60_000)
  const desc = [
    `Kickoff call for ${award.job_id} (${award.part_no}) with ${award.call.with}.`,
    "Agenda:",
    ...award.call.agenda.map((a) => `- ${a}`),
    "Demo: no invite was sent. Not a real contract.",
  ].join("\n")
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Shieldworks//Award package//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${esc(`award-${award.shop_id}-${award.job_id}@muster.demo`)}`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${utc(start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${esc(`Kickoff: ${award.job_id} with Northgate (demo)`)}`,
    `DESCRIPTION:${esc(desc)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.map(fold).join("\r\n") + "\r\n"
}

/** Starts a client-side download of the .ics (call from a click handler). */
export function downloadIcs(award: Award): void {
  const ics = buildIcs(award)
  if (!ics || typeof document === "undefined") return
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `kickoff-${award.job_id}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Award page paths (desktop and phone). Callers add ?mode/?api/?story. */
export function awardHref(shopId: string, jobId: string, phone: boolean): string {
  const base = `/shops/${encodeURIComponent(shopId)}/offers/${encodeURIComponent(jobId)}/award`
  return phone ? `/m${base}` : base
}
