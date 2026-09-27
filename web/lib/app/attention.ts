// Shop "Today" home: what needs the owner tonight, in a fixed order
// (docs/app-spec.md §2.2, T2). Pure logic, no React. Owner: Agent T.
//
// Order never changes: offers needing a reply → Northgate's replies to the shop's
// questions → renewals (urgent / window open / lapsed) → capacity check-in → one
// step away (readiness[0]) → workers in training. A card that no longer applies
// drops out; the others keep their order.

import { COUNTING_CERT_STATUSES } from "@/lib/api/types"
import { CERT_LABEL, PROCESS_LABEL, fmtMoney, label } from "@/lib/format"
import { extendStrings, t } from "./strings"
import { requirementSegment } from "./readiness"
import { certShortName, riskLine, renewalVerb } from "./renewals"
import { addBusinessDays, addDays, daysBetween, fmtDay, fmtWeekday, parseAppDate, toISODate } from "./today"
import type { AttentionItem, CapacityCheckin, DateBasis, Renewal, RenewalStage, ShopBundle } from "./types"

extendStrings("en", {
  "today.offers.title": "{count} offers need a reply",
  "today.offers.title_one": "1 offer needs a reply",
  "today.offers.detail": "Soonest reply by {date}",
  "today.offers.big": "offers",
  "today.offers.big_one": "offer",
  "today.offers.verb": "Reply",
  "today.offers.assumption": "Reply-by dates are set by the prime; the demo uses 5 business days from when the offer arrived",

  "today.reply.title": "{prime} replied on {job}: “{text}”",
  "today.reply.titleMany": "{prime} replied to {count} of your questions",
  "today.reply.detail": "You can still accept or decline",
  "today.reply.detailMany": "Latest on {job}: “{text}”",
  "today.reply.big": "replies",
  "today.reply.big_one": "reply",
  "today.reply.verb": "Open",

  "today.renewal.title": "{cert} · {verb} by {date}",
  "today.renewal.titleLapsed": "{cert} · lapsed {date}",
  "today.renewal.titleOverdue": "{cert} · overdue since {date} · act now",
  "today.renewal.bigOverdue": "days overdue",
  "today.renewal.bigOverdue_one": "day overdue",
  "today.renewal.atRisk": "{risk} at risk",
  "today.renewal.noRisk": "{stage} · no assigned work depends on it yet",
  "today.renewal.big": "days left",
  "today.renewal.big_one": "day left",
  "today.renewal.bigLapsed": "days lapsed",
  "today.renewal.bigLapsed_one": "day lapsed",
  "today.renewal.verb": "Renew",

  "today.capacity.title": "Confirm free hours for the next 4 weeks",
  "today.capacity.detailNever": "One tap per process · not confirmed yet",
  "today.capacity.detailLast": "One tap per process · last confirmed {date}",
  "today.capacity.big": "weeks ahead",
  "today.capacity.bigLast": "h/wk free last time",
  "today.capacity.verb": "Confirm",
  "today.capacity.overTitle": "Work accepted since your check-in is {hours} h/wk over your free hours",
  "today.capacity.overDetail": "You confirmed {free} h/wk free on {date}. Consider declining an offer or asking Northgate to split the quantity",
  "today.capacity.overBig": "h/wk over",
  "today.capacity.overVerb": "Review",

  "today.readiness.title": "Get {req} → {count} more jobs · {value}",
  "today.readiness.title_one": "Get {req} → 1 more job · {value}",
  "today.readiness.titleProcess": "Add {req} → {count} more jobs · {value}",
  "today.readiness.titleProcess_one": "Add {req} → 1 more job · {value}",
  "today.readiness.titleCapacity": "More {req} hours → {count} more jobs · {value}",
  "today.readiness.titleCapacity_one": "More {req} hours → 1 more job · {value}",
  "today.readiness.detail": "What it takes, and who can pay for it",
  "today.readiness.requested": "Funding requested {date} · awaiting Northgate",
  "today.readiness.requestedDetail": "{req} → {count} more jobs · {value}",
  "today.readiness.requestedDetail_one": "{req} → 1 more job · {value}",
  "today.readiness.big": "more jobs",
  "today.readiness.big_one": "more job",
  "today.readiness.verb": "See steps",
  "today.readiness.verbRequested": "Track",

  "today.training.title": "{count} {people} in training",
  "today.training.detail": "+{hours} h/wk {process} once qualified",
  "today.training.detailNoHours": "Funded by Northgate · {cert}",
  "today.training.big": "in training",
  "today.training.verb": "View seats",
  "today.training.assumption": "Added weekly hours are a demo estimate per trainee, not a shop commitment",
  "today.training.welders": "welders",
  "today.training.welders_one": "welder",
  "today.training.trainees": "trainees",
  "today.training.trainees_one": "trainee",
})

/** Business days the demo gives a shop to reply (assumption: the prime sets this). */
export const REPLY_BUSINESS_DAYS = 5
/** A capacity check-in hides the Today card for this many days. */
export const CHECKIN_FRESH_DAYS = 7

/** A Today card: the spec's AttentionItem plus what the card shows big. */
export interface TodayItem extends AttentionItem {
  /** The one big number ("2", "21", "$5.1M"). */
  big: string
  /** Words under the big number ("offers", "days left"). */
  big_label: string
  /** The one verb on the card ("Reply", "Renew"). */
  verb: string
  /** When set, the card shows an assumption tag with this note. */
  assumption: string | null
  /** Stage for renewal cards (drives the status chip). */
  stage?: RenewalStage
  /** Renewal cards: where the date comes from ("illustrative", "shop-declared"). */
  basis?: DateBasis
}

export interface AttentionOptions {
  /**
   * When each offer arrived (job id → ISO timestamp). Jobs unblocked by a
   * funded package arrive at the fund time; everything else at routedAt.
   */
  offeredAt?: Record<string, string>
  /**
   * The prime's replies to this shop's open questions (job id → reply), from the
   * engine's decision.reply or recorded on this device (prime-replies.ts).
   */
  replies?: Record<string, { text: string; at: string }>
  /** Short prime name for copy ("Northgate"). */
  prime?: string
}

/** The bundle fields buildAttention reads (a full ShopBundle works). */
export type AttentionBundle = Pick<ShopBundle, "detail" | "offers" | "actions" | "assignments" | "shop">

const shopPath = (shopId: string) => `/m/shops/${encodeURIComponent(shopId)}`

/** The seats section of a shop's Grow item: /m/shops/syn-012/grow/CWB_W47.1#seats (Grow tab when the requirement is unknown). */
export function seatsHref(shopId: string, requirement: string | null): string {
  const grow = `${shopPath(shopId)}/grow`
  return requirement ? `${grow}/${requirementSegment(requirement)}#seats` : grow
}

/** Short certificate name for card titles ("CGP", "CPCSC L1", "CWB W47.1"). */
export function certShort(type: string): string {
  return certShortName(type)
}

/** Label for a readiness requirement (a cert type or a process tag). */
export function requirementLabel(req: string): string {
  if (CERT_LABEL[req]) return certShort(req)
  return (PROCESS_LABEL[req] ?? req).toLowerCase()
}

/** reply_by = offered-at + 5 business days (assumption). */
export function replyBy(offeredAt: string | Date | null, fallback: Date): Date {
  return addBusinessDays(parseAppDate(offeredAt) ?? fallback, REPLY_BUSINESS_DAYS)
}

/** True when the shop confirmed capacity within the last 7 days. */
export function capacityFresh(c: CapacityCheckin | null | undefined, today: Date): boolean {
  if (!c) return false
  const days = daysBetween(c.confirmed_at, today)
  return Number.isFinite(days) && days >= 0 && days < CHECKIN_FRESH_DAYS
}

/** The day the next weekly check-in is due (last check-in + 7 days). */
export function nextCheckinDate(c: CapacityCheckin | null | undefined, today: Date): Date {
  return c ? addDays(c.confirmed_at, CHECKIN_FRESH_DAYS) : today
}

/** Offers still waiting on the shop (status offered, no decision or only a question). */
export function openOffers(b: Pick<AttentionBundle, "offers">) {
  return b.offers.filter((o) => o.status === "offered")
}

/**
 * Weekly hours of offers accepted after `since` (a capacity check-in): the check-in's
 * free hours already leave out work booked before it.
 */
export function acceptedSinceHours(b: Pick<AttentionBundle, "offers" | "actions">, since: string): number {
  return b.offers
    .filter((o) => {
      if (o.status !== "accepted") return false
      const d = b.actions.decisions[o.job_id]
      return d?.decision === "accepted" && d.at > since
    })
    .reduce((s, o) => s + o.hours_week, 0)
}

/** Weekly hours of accepted offers. */
export function acceptedLoadHours(b: Pick<AttentionBundle, "offers">): number {
  return b.offers.filter((o) => o.status === "accepted").reduce((s, o) => s + o.hours_week, 0)
}

export interface TodayStats {
  /** Value of offers not declined. */
  offers_value_cad: number
  offers_count: number
  accepted_hours: number
  /** Profile capacity (routing uses this tonight). */
  capacity_hours: number
  /** Confirmed free hours from the last check-in, if any. */
  confirmed_free_hours: number | null
  /** Certificates counting for matching (verified, declared or pending_training). */
  certs_counting: number
  /** Held now (verified or declared). */
  certs_in_place: number
  /** pending_training: counts for matching (CLAUDE.md §1.1 decision 4) but welders are still in training. */
  certs_in_training: number
  certs_total: number
  /** Weekly hours funded training adds to the profile capacity once trainees qualify (already in capacity_hours). */
  training_hours: number
}

/** The 3 compact stats under the cards. */
export function todayStats(b: Pick<ShopBundle, "offers" | "shop" | "certs" | "actions"> & Partial<Pick<ShopBundle, "detail">>): TodayStats {
  const live = b.offers.filter((o) => o.status !== "declined")
  const trainingHours = (b.detail?.training ?? [])
    .filter((tr) => tr.status === "funded")
    .reduce((s, tr) => s + Object.values(tr.capacity_unlock ?? {}).reduce((a, h) => a + (typeof h === "number" && h > 0 ? h : 0), 0), 0)
  return {
    offers_value_cad: live.reduce((s, o) => s + o.value_cad, 0),
    offers_count: live.length,
    accepted_hours: acceptedLoadHours(b),
    capacity_hours: b.shop?.capacity_hours_week ?? 0,
    confirmed_free_hours: b.actions.capacity?.hours_week ?? null,
    certs_counting: b.certs.filter((c) => COUNTING_CERT_STATUSES.includes(c.status)).length,
    certs_in_place: b.certs.filter((c) => COUNTING_CERT_STATUSES.includes(c.status) && c.status !== "pending_training").length,
    certs_in_training: b.certs.filter((c) => c.status === "pending_training").length,
    certs_total: b.certs.length,
    training_hours: trainingHours,
  }
}

const RENEWAL_CARD_STAGES: readonly RenewalStage[] = ["lapsed", "urgent", "window_open"]
const STAGE_ORDER: Record<RenewalStage, number> = { lapsed: 0, urgent: 1, window_open: 2, ok: 3, unknown: 4 }

function money(n: number): string {
  return fmtMoney(n, { compact: true })
}

/**
 * The Today cards for one shop, in the fixed priority order.
 * `renewals` come from renewalFor() (T4) for this shop's certificates.
 */
export function buildAttention(
  bundle: AttentionBundle,
  renewals: Renewal[],
  today: Date,
  opts: AttentionOptions = {}
): TodayItem[] {
  const out: TodayItem[] = []
  const detail = bundle.detail
  if (!detail) return out
  const shopId = detail.shop.id
  const base = shopPath(shopId)
  const actions = bundle.actions

  // 1. Offers needing a reply.
  const open = openOffers(bundle)
  if (open.length) {
    const routedAt = actions.routedAt
    let soonest: Date | null = null
    for (const o of open) {
      const due = replyBy(opts.offeredAt?.[o.job_id] ?? routedAt, today)
      if (!soonest || due < soonest) soonest = due
    }
    const due = soonest ?? replyBy(routedAt, today)
    out.push({
      kind: "offers",
      ref_id: open.length === 1 ? open[0].job_id : null,
      title: t("today.offers.title", { count: open.length }),
      detail: t("today.offers.detail", { date: fmtWeekday(due).replace(",", "") }),
      due_at: toISODate(due),
      value_cad: open.reduce((s, o) => s + o.value_cad, 0),
      href: `${base}/offers`,
      tone: "action",
      big: String(open.length),
      big_label: t("today.offers.big", { count: open.length }),
      verb: t("today.offers.verb"),
      assumption: t("today.offers.assumption"),
    })
  }

  // 1b. Northgate answered the shop's questions.
  const replied = Object.entries(opts.replies ?? {})
    .filter(([job]) => actions.decisions[job]?.decision === "question")
    .sort((a, z) => z[1].at.localeCompare(a[1].at))
  if (replied.length) {
    const prime = opts.prime ?? "Northgate"
    const [job, r] = replied[0]
    const one = replied.length === 1
    out.push({
      kind: "reply",
      ref_id: one ? job : null,
      title: one ? t("today.reply.title", { prime, job, text: r.text }) : t("today.reply.titleMany", { prime, count: replied.length }),
      detail: one ? t("today.reply.detail") : t("today.reply.detailMany", { job, text: r.text }),
      due_at: null,
      value_cad: null,
      href: one ? `${base}/offers/${encodeURIComponent(job)}` : `${base}/offers`,
      tone: "info",
      big: String(replied.length),
      big_label: t("today.reply.big", { count: replied.length }),
      verb: t("today.reply.verb"),
      assumption: null,
    })
  }

  // 2. Renewals that need action, most urgent first (one card each).
  const due = renewals
    .filter((r) => r.status !== "unknown" && RENEWAL_CARD_STAGES.includes(r.stage))
    .sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || (a.days_left ?? 0) - (b.days_left ?? 0))
  for (const r of due) {
    const cert = certShort(r.cert_type)
    const lapsed = r.stage === "lapsed"
    const actBy = r.act_by ?? r.expires_at
    const days = r.days_left ?? (lapsed ? daysBetween(today, r.expires_at ?? today) : daysBetween(today, actBy ?? today))
    const shown = Number.isFinite(days) ? Math.abs(days) : null
    // A past act-by date is never "renew by …" / "days left": it is overdue.
    const overdue = !lapsed && Number.isFinite(days) && days < 0
    const risk = riskLine(r)
    out.push({
      kind: "renewal",
      ref_id: r.cert_type,
      title: lapsed
        ? t("today.renewal.titleLapsed", { cert, date: fmtDay(r.expires_at) })
        : overdue
          ? t("today.renewal.titleOverdue", { cert, date: fmtDay(actBy) })
          : t("today.renewal.title", { cert, verb: renewalVerb(r.cert_type) || "renew", date: fmtDay(actBy) }),
      detail: risk ? t("today.renewal.atRisk", { risk }) : t("today.renewal.noRisk", { stage: t(`stage.${r.stage}`) }),
      due_at: lapsed ? r.expires_at : actBy,
      value_cad: r.credit_at_risk_cad || null,
      href: `${base}/certs#${encodeURIComponent(r.cert_type)}`,
      tone: r.stage === "window_open" ? "warn" : "danger",
      big: shown === null ? "—" : String(shown),
      big_label: t(lapsed ? "today.renewal.bigLapsed" : overdue ? "today.renewal.bigOverdue" : "today.renewal.big", { count: shown ?? 0 }),
      verb: t("today.renewal.verb"),
      assumption: null,
      stage: r.stage,
      basis: r.date_basis,
    })
  }

  // 3. Capacity check-in (weekly), or an over-capacity warning after one.
  const cap = actions.capacity
  // Confirmed hours are FREE hours (booked work already left out), so only work accepted after the check-in uses them up.
  const accepted = cap ? acceptedSinceHours(bundle, cap.confirmed_at) : acceptedLoadHours(bundle)
  if (!capacityFresh(cap, today)) {
    out.push({
      kind: "capacity",
      ref_id: null,
      title: t("today.capacity.title"),
      detail: cap ? t("today.capacity.detailLast", { date: fmtDay(cap.confirmed_at) }) : t("today.capacity.detailNever"),
      due_at: toISODate(today),
      value_cad: null,
      href: `${base}#checkin`,
      tone: "action",
      // The big number answers the card's question (free hours, next N weeks),
      // not accepted load: "0 h/wk accepted" read as "0 free hours".
      big: cap ? String(cap.hours_week) : "4",
      big_label: cap ? t("today.capacity.bigLast") : t("today.capacity.big"),
      verb: t("today.capacity.verb"),
      assumption: null,
    })
  } else if (cap && accepted > cap.hours_week) {
    const over = accepted - cap.hours_week
    out.push({
      kind: "capacity",
      ref_id: null,
      title: t("today.capacity.overTitle", { hours: over }),
      detail: t("today.capacity.overDetail", { free: cap.hours_week, date: fmtDay(cap.confirmed_at) }),
      due_at: null,
      value_cad: null,
      href: `${base}/offers`,
      tone: "warn",
      big: String(over),
      big_label: t("today.capacity.overBig"),
      verb: t("today.capacity.overVerb"),
      assumption: null,
    })
  }

  // 4. One step away: the first readiness item.
  const next = detail.readiness[0]
  if (next) {
    const req = requirementLabel(next.requirement)
    const count = next.jobs_unlocked.length
    const value = money(next.value_cad)
    const request = Object.values(actions.fundingRequests).find((f) => f.requirement === next.requirement) ?? null
    const requested = !!request && request.status === "requested"
    const titleKey =
      next.kind === "process" ? "today.readiness.titleProcess" : next.kind === "capacity" ? "today.readiness.titleCapacity" : "today.readiness.title"
    out.push({
      kind: "readiness",
      ref_id: next.requirement,
      title: requested ? t("today.readiness.requested", { date: fmtDay(request.at) }) : t(titleKey, { req, count, value }),
      detail: requested ? t("today.readiness.requestedDetail", { req, count, value }) : t("today.readiness.detail"),
      due_at: null,
      value_cad: next.value_cad,
      href: `${base}/grow/${requirementSegment(next.requirement)}`,
      tone: requested ? "info" : "action",
      big: String(count),
      big_label: t("today.readiness.big", { count }),
      verb: requested ? t("today.readiness.verbRequested") : t("today.readiness.verb"),
      assumption: null,
    })
  }

  // 5. Workers in training (funded packages).
  for (const tr of detail.training) {
    if (tr.status !== "funded") continue
    const unlock = Object.entries(tr.capacity_unlock ?? {}).filter(([, h]) => typeof h === "number" && h > 0) as [string, number][]
    const welding = tr.cert_unlock === "CWB_W47.1" || unlock.some(([p]) => p === "welding")
    const people = t(welding ? "today.training.welders" : "today.training.trainees", { count: tr.trainees })
    const hours = unlock.reduce((s, [, h]) => s + h, 0)
    const process = unlock.map(([p]) => label(PROCESS_LABEL, p).toLowerCase()).join(" + ")
    out.push({
      kind: "training",
      ref_id: tr.package_id,
      title: t("today.training.title", { count: tr.trainees, people }),
      detail: hours
        ? t("today.training.detail", { hours, process })
        : t("today.training.detailNoHours", { cert: tr.cert_unlock ? certShort(tr.cert_unlock) : tr.category }),
      due_at: null,
      value_cad: null,
      // The shop's own seats summary (stages only, no names), not the trainee's private seat card.
      href: seatsHref(shopId, tr.cert_unlock ?? Object.keys(tr.capacity_unlock ?? {})[0] ?? null),
      tone: "info",
      big: String(tr.trainees),
      big_label: t("today.training.big"),
      verb: t("today.training.verb"),
      assumption: hours ? t("today.training.assumption") : null,
    })
  }

  return out
}
