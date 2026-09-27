// Prime activity feed (T6, docs/app-spec.md §2.6). Pure functions only: the
// phone page (/m/prime) and the desktop ActivityBell both turn engine-shaped
// AppEvents (docs/api.md §6) and supplier renewals into display rows here, so
// the two surfaces always say the same thing. Owner: Agent P.
//
// The engine's `message` is a ready English sentence, but the phone copy is
// shorter ("Tallowfield accepted NG-021 · +$1.68M credit"), so rows are built
// from the event fields and every string goes through t().

import type { LedgerResponse, TrainingPackage } from "@/lib/api/types"
import { CERT_LABEL, PROCESS_LABEL, fmtMoney } from "@/lib/format"
import { extendStrings, t } from "./strings"
import { fmtDay } from "./today"
import type { AppEvent, EventKind, Renewal, RenewalStage } from "./types"

extendStrings("en", {
  // --- /m/prime page -------------------------------------------------------
  "prime.glance.title": "Northgate ITB obligation",
  "prime.glance.met": "Obligation met",
  "prime.glance.metOf": "of {obligation}",
  "prime.glance.smb": "Small-business (SME) work",
  "prime.glance.smbOf": "{pct} of the {target} target",
  "prime.glance.training": "Training credit",
  "prime.glance.trainingNone": "No training funded yet",
  "prime.glance.trainingSome": "{count} packages funded",
  "prime.glance.trainingSome_one": "1 package funded",
  "prime.glance.replies": "{waiting} awaiting reply · {accepted} accepted · {declined} declined",
  "prime.glance.risk": "{count} supplier renewals put {credit} credit at risk",
  "prime.glance.risk_one": "1 supplier renewal puts {credit} credit at risk",
  "prime.glance.smbNote": "SMB progress uses the CCV of SME work before multipliers (assumption)",
  "prime.glance.empty": "Nothing routed yet",
  "prime.glance.emptyBody": "Route the Northgate parts list on the laptop to start the ledger.",
  "prime.activity.title": "Activity",
  "prime.activity.empty": "No activity yet",
  "prime.activity.emptyBody": "Shops' answers appear here within seconds: accepts, declines with a reason, questions and funding requests.",
  "prime.activity.showAll": "Show all {count} updates",
  "prime.activity.count": "{count} updates",
  "prime.activity.count_one": "1 update",
  "prime.supplier.title": "Supplier status",
  "prime.supplier.subtitle": "Certifications that put routed work at risk if they lapse.",
  "prime.supplier.empty": "No renewals due",
  "prime.supplier.emptyBody": "No assigned shop has a certification in its renewal window.",
  "prime.supplier.notRouted": "Supplier status appears once jobs are assigned.",
  "prime.supplier.loading": "Checking supplier certifications…",
  "prime.supplier.dates": "Dates for synthetic shops are illustrative; shop-entered dates are shop-declared.",

  // --- feed rows ---------------------------------------------------------------
  "feed.routed": "{prime} routed {count} jobs",
  "feed.routed.detail": "{shops} shops · {blocked} blocked",
  "feed.routed.detailNoShops": "{blocked} blocked",
  "feed.accepted": "{shop} accepted {job}",
  "feed.accepted.detail": "+{credit} credit",
  "feed.declined": "{shop} declined {job}: {reason}",
  "feed.declined.detail": "Counted as routed until re-routed (demo)",
  "feed.question": "{shop} asked about {question} on {job}",
  "feed.undo": "{shop} withdrew its answer on {job}",
  "feed.undo.detail": "Offer is open again",
  "feed.funding": "{shop} asked you to fund {requirement}",
  "feed.funding.detail": "{cost} → {credit} credit",
  "feed.funded": "{package} funded → {count} jobs unblocked",
  "feed.funded_one": "{package} funded → 1 job unblocked",
  "feed.funded.detail": "+{credit} credit",
  "feed.capacity": "{shop}: {hours} h/wk free",
  "feed.capacity.detail": "Accepted {accepted} h/wk",
  "feed.capacity.over": "Accepted {accepted} h/wk · over by {over} h",
  "feed.cert": "{shop} added a {cert} expiry date",
  "feed.cert.detail": "{date} · shop-declared",
  "feed.pctOfObligation": "{pct} of obligation",
  "feed.renewal": "{shop} · {cert} renewal due {date}",
  "feed.renewal.lapsed": "{shop} · {cert} lapsed {date}",
  "feed.renewal.detail": "{jobs} · {credit} credit at risk",
  "feed.renewal.detailNoJobs": "No assigned work depends on it",

  // --- actions -----------------------------------------------------------------
  "feed.action.view": "View",
  "feed.action.reroute": "Re-route",
  "feed.action.rerouteSoon": "coming soon",
  "feed.action.reply": "Reply by email",
  "feed.action.noEmail": "No contact on file",
  "feed.action.review": "Review in Gaps",
  "feed.action.wallet": "See wallet",
  "feed.action.certs": "See wallet",
  "feed.replySubject": "{prime}: your question on {job} ({question})",

  // --- desktop bell ------------------------------------------------------------
  "bell.label": "Shop activity",
  "bell.unread": "{count} new",
  "bell.title": "Shop activity",
  "bell.empty": "No activity yet. Shops' answers from the phone app appear here.",
  "bell.markRead": "Mark all read",
  "bell.openPhone": "Open the phone feed",
  "bell.toast.accepted": "{shop} accepted {job} (+{credit} credit)",
  "bell.toast.declined": "{shop} declined {job}: {reason}",
  "bell.toast.question": "{shop} asked about {question} on {job}",
  "bell.toast.undo": "{shop} withdrew its answer on {job}",
  "bell.toast.funding": "{shop} asked you to fund {requirement} ({cost} → {credit} credit)",
  "bell.toast.capacity": "{shop}: {hours} h/wk free for the next {weeks} weeks",
  "bell.toast.cert": "{shop} added a {cert} expiry date: {date} (shop-declared)",
  "header.phoneView": "Phone view",
})

/** Enlarges a small pill's touch area to 44 px without changing how it looks. */
export const TAG_HIT = "relative after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']"

// ---------------------------------------------------------------------------
// Types

export type FeedTone = "success" | "warn" | "danger" | "info" | "action"

export interface FeedAction {
  label: string
  /** In-app route or mailto:. null when disabled. */
  href: string | null
  /** mailto: or another site: render as <a>, not next/link. */
  external?: boolean
  disabled?: boolean
  /** Shown next to a disabled action ("coming soon"). */
  note?: string
}

export interface FeedItem {
  /** Stable React key. */
  id: string
  section: "activity" | "supplier"
  /** Event seq, or 0 for supplier rows. */
  seq: number
  /** ISO time of the event; null for supplier rows. */
  ts: string | null
  kind: EventKind | "renewal_risk"
  tone: FeedTone
  title: string
  detail: string | null
  shop_id: string | null
  job_id: string | null
  package_id: string | null
  credit_cad: number | null
  action: FeedAction | null
  /** Supplier rows: the whole card links here. */
  href: string | null
  /** Supplier rows: the renewal stage (drives the stage chip). */
  stage?: RenewalStage
  /** Supplier rows: date basis label ("illustrative", "shop-declared", "registry"). */
  date_basis?: string
}

/** One assigned shop's renewal (from renewalFor), with the shop it belongs to. */
export interface SupplierRenewal {
  shop_id: string
  shop_name: string
  shop_source: "synthetic" | "public" | null
  renewal: Renewal
}

export interface FeedContext {
  /** "Northgate" (short prime name used in copy). */
  prime?: string
  /** Training packages (gaps.suggestions), to fill a funding request's cost when the event lacks it. */
  packages?: TrainingPackage[]
  /** Role-based contact email for a shop (shops.json contact_role_email). */
  shopEmail?: (shopId: string) => string | null
}

// ---------------------------------------------------------------------------
// Helpers

const CORP_SUFFIX = /[\s,]+(ltd\.?|limited|inc\.?|incorporated|corp\.?|corporation|co\.?|llc|ltée|ltee|ulc)$/i
const GENERIC_TAIL = new Set([
  "fabricating",
  "fabrication",
  "fabricators",
  "machining",
  "machine",
  "manufacturing",
  "industries",
  "industrial",
  "metal",
  "metals",
  "works",
  "welding",
  "group",
  "company",
  "enterprises",
  "technologies",
  "products",
  "shop",
])

/**
 * Short shop name for phone rows: "Tallowfield Fabricating Ltd." → "Tallowfield",
 * "Tessellate Precision Machining Inc." → "Tessellate Precision".
 */
export function shortShopName(name: string | null | undefined): string {
  if (!name) return ""
  let s = name.trim()
  for (let i = 0; i < 2; i++) s = s.replace(CORP_SUFFIX, "").trim()
  const words = s.split(/\s+/)
  while (words.length > 1 && GENERIC_TAIL.has(words[words.length - 1].toLowerCase().replace(/[^a-zé]/g, ""))) words.pop()
  return words.join(" ") || name
}

/** Short cert label for one-line rows ("CGP", "CWB W47.1", "CPCSC Level 1"). */
export function certShort(type: string): string {
  if (type === "CGP") return "CGP"
  return CERT_LABEL[type] ?? PROCESS_LABEL[type] ?? type.replace(/_/g, " ")
}

const money = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? fmtMoney(n, { compact: true }) : "—")
/** Credit amounts keep 3 significant figures between $1M and $10M ("$1.68M", "$5.06M"), as the engine's messages do. */
export function fmtCredit(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—"
  const a = Math.abs(n)
  if (a >= 1e6 && a < 9.995e6) return `${n < 0 ? "-" : ""}$${(a / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`
  return fmtMoney(n, { compact: true })
}
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null)
const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)

function reasonText(code: unknown): string {
  const c = str(code)
  return c ? lower(t(`reason.${c}`)) : lower(t("reason.other"))
}

function questionText(code: unknown): string {
  const c = str(code)
  return c ? lower(t(`question.${c}`)) : "the offer"
}

function pct(n: number): string {
  const v = n * 100
  return `${v < 0.1 && v > 0 ? v.toFixed(2) : v.toFixed(1)}%`
}

export const shopOfferHref = (shopId: string, jobId: string) =>
  `/m/shops/${encodeURIComponent(shopId)}/offers/${encodeURIComponent(jobId)}`
export const shopCertHref = (shopId: string, certType: string) =>
  `/m/shops/${encodeURIComponent(shopId)}/certs#${encodeURIComponent(certType)}`

function mailto(to: string, subject: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}`
}

// ---------------------------------------------------------------------------
// Events → rows

/** One activity row for an event (null for kinds the feed does not show). */
export function eventItem(e: AppEvent, ledger: LedgerResponse | null, ctx: FeedContext = {}): FeedItem | null {
  const prime = ctx.prime ?? "Northgate"
  const shop = shortShopName(e.shop_name) || e.shop_id || ""
  const p = e.payload ?? {}
  const obligation = ledger?.obligation_cad ?? 0
  const base = {
    id: `ev-${e.seq}-${e.kind}`,
    section: "activity" as const,
    seq: e.seq,
    ts: e.ts,
    kind: e.kind,
    shop_id: e.shop_id,
    job_id: e.job_id,
    package_id: e.package_id,
    credit_cad: e.credit_cad,
    href: null,
  }
  const creditPct = (c: number | null) => (c && obligation > 0 ? t("feed.pctOfObligation", { pct: pct(c / obligation) }) : null)
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(" · ") || null

  switch (e.kind) {
    case "routed": {
      const shops = num(p.shops)
      const blocked = num(p.blocked) ?? 0
      return {
        ...base,
        tone: "info",
        title: t("feed.routed", { prime, count: num(p.assigned) ?? "—" }),
        detail: shops !== null ? t("feed.routed.detail", { shops, blocked }) : t("feed.routed.detailNoShops", { blocked }),
        action: null,
      }
    }
    case "offer_accepted":
      return {
        ...base,
        tone: "success",
        title: t("feed.accepted", { shop, job: e.job_id ?? "" }),
        detail: join(t("feed.accepted.detail", { credit: fmtCredit(e.credit_cad) }), creditPct(e.credit_cad)),
        action: e.shop_id && e.job_id ? { label: t("feed.action.view"), href: shopOfferHref(e.shop_id, e.job_id) } : null,
      }
    case "offer_declined":
      return {
        ...base,
        tone: "danger",
        title: t("feed.declined", { shop, job: e.job_id ?? "", reason: reasonText(p.reason_code) }),
        detail: t("feed.declined.detail"),
        action: { label: t("feed.action.reroute"), href: null, disabled: true, note: t("feed.action.rerouteSoon") },
      }
    case "offer_question": {
      const email = e.shop_id ? (ctx.shopEmail?.(e.shop_id) ?? null) : null
      const question = questionText(p.question_code)
      return {
        ...base,
        tone: "action",
        title: t("feed.question", { shop, job: e.job_id ?? "", question }),
        detail: str(p.note),
        action: email
          ? {
              label: t("feed.action.reply"),
              href: mailto(email, t("feed.replySubject", { prime, job: e.job_id ?? "", question })),
              external: true,
            }
          : { label: t("feed.action.reply"), href: null, disabled: true, note: t("feed.action.noEmail") },
      }
    }
    case "offer_undo":
      return {
        ...base,
        tone: "info",
        title: t("feed.undo", { shop, job: e.job_id ?? "" }),
        detail: t("feed.undo.detail"),
        action: e.shop_id && e.job_id ? { label: t("feed.action.view"), href: shopOfferHref(e.shop_id, e.job_id) } : null,
      }
    case "funding_requested": {
      const pkg = e.package_id ? ctx.packages?.find((x) => x.id === e.package_id) : undefined
      const requirement = str(p.requirement) ?? pkg?.gap?.requirement ?? ""
      const cost = num(p.est_cost_cad) ?? pkg?.est_cost_cad ?? null
      return {
        ...base,
        tone: "action",
        title: t("feed.funding", { shop, requirement: certShort(requirement) }),
        detail: t("feed.funding.detail", { cost: money(cost), credit: money(e.credit_cad ?? pkg?.est_credit_cad ?? null) }),
        action: { label: t("feed.action.review"), href: "/gaps" },
      }
    }
    case "package_funded": {
      const ids = Array.isArray(p.unblocked_job_ids) ? (p.unblocked_job_ids as unknown[]).filter((x) => typeof x === "string") : []
      return {
        ...base,
        tone: "success",
        title: t("feed.funded", { package: e.package_id ?? "", count: ids.length }),
        detail: join(t("feed.funded.detail", { credit: money(e.credit_cad) }), ids.length ? ids.join(" · ") : null),
        action: null,
      }
    }
    case "capacity_confirmed": {
      const hours = num(p.hours_week) ?? 0
      const accepted = num(p.accepted_load_hours) ?? 0
      const over = num(p.over_by_hours) ?? Math.max(0, accepted - hours)
      return {
        ...base,
        tone: over > 0 ? "warn" : "info",
        title: t("feed.capacity", { shop, hours }),
        detail: over > 0 ? t("feed.capacity.over", { accepted, over }) : t("feed.capacity.detail", { accepted }),
        action: null,
      }
    }
    case "cert_declared": {
      const cert = str(p.cert_type) ?? ""
      return {
        ...base,
        tone: "info",
        title: t("feed.cert", { shop, cert: certShort(cert) }),
        detail: t("feed.cert.detail", { date: str(p.expires_at) ?? "—" }),
        action: e.shop_id && cert ? { label: t("feed.action.certs"), href: shopCertHref(e.shop_id, cert) } : null,
      }
    }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Supplier renewals → rows

/** Stages the prime needs to see. */
export const RISK_STAGES: readonly RenewalStage[] = ["lapsed", "urgent", "window_open"]
const STAGE_RANK: Record<RenewalStage, number> = { lapsed: 0, urgent: 1, window_open: 2, ok: 3, unknown: 4 }

export function supplierItem(r: SupplierRenewal): FeedItem | null {
  const rn = r.renewal
  if (!RISK_STAGES.includes(rn.stage) || rn.status === "unknown") return null
  const label = r.shop_source === "synthetic" ? ` (${t("label.synthetic").toLowerCase()})` : ""
  const shop = `${shortShopName(r.shop_name) || r.shop_id}${label}`
  const lapsed = rn.stage === "lapsed"
  const date = fmtDay(lapsed ? rn.expires_at : (rn.act_by ?? rn.expires_at))
  return {
    id: `sup-${r.shop_id}-${rn.cert_type}`,
    section: "supplier",
    seq: 0,
    ts: null,
    kind: "renewal_risk",
    tone: lapsed || rn.stage === "urgent" ? "danger" : "warn",
    title: t(lapsed ? "feed.renewal.lapsed" : "feed.renewal", { shop, cert: certShort(rn.cert_type), date }),
    detail: rn.jobs_at_risk.length
      ? t("feed.renewal.detail", { jobs: rn.jobs_at_risk.join(" · "), credit: fmtCredit(rn.credit_at_risk_cad) })
      : t("feed.renewal.detailNoJobs"),
    shop_id: r.shop_id,
    job_id: rn.jobs_at_risk[0] ?? null,
    package_id: null,
    credit_cad: rn.credit_at_risk_cad,
    action: null,
    href: shopCertHref(r.shop_id, rn.cert_type),
    stage: rn.stage,
    date_basis: rn.date_basis,
  }
}

/**
 * The prime feed: activity rows (newest first) followed by supplier-risk rows
 * (worst stage first, then most credit at risk). Pure.
 */
export function feedItems(
  events: AppEvent[],
  ledger: LedgerResponse | null,
  supplierRenewals: SupplierRenewal[],
  ctx: FeedContext = {}
): FeedItem[] {
  const activity = [...events]
    .sort((a, b) => b.seq - a.seq)
    .map((e) => eventItem(e, ledger, ctx))
    .filter((x): x is FeedItem => x !== null)
  const supplier = supplierRenewals
    .filter((r) => RISK_STAGES.includes(r.renewal.stage) && r.renewal.status !== "unknown")
    .sort(
      (a, b) =>
        STAGE_RANK[a.renewal.stage] - STAGE_RANK[b.renewal.stage] ||
        b.renewal.credit_at_risk_cad - a.renewal.credit_at_risk_cad ||
        (a.renewal.days_left ?? 0) - (b.renewal.days_left ?? 0)
    )
    .map(supplierItem)
    .filter((x): x is FeedItem => x !== null)
  return [...activity, ...supplier]
}

// ---------------------------------------------------------------------------
// Desktop toasts

/** Events that come from a shop (the laptop did not cause them itself). */
export const SHOP_EVENT_KINDS: readonly EventKind[] = [
  "offer_accepted",
  "offer_declined",
  "offer_question",
  "offer_undo",
  "funding_requested",
  "capacity_confirmed",
  "cert_declared",
]

/**
 * The laptop toast for a shop event, with the full shop name:
 * "Tallowfield Fabricating Ltd. accepted NG-021 (+$1.68M credit)". null for
 * events the laptop caused itself (routed, package_funded).
 */
export function eventToast(e: AppEvent, ctx: FeedContext = {}): { title: string; description: string | null; tone: FeedTone } | null {
  if (!SHOP_EVENT_KINDS.includes(e.kind)) return null
  const shop = e.shop_name ?? e.shop_id ?? ""
  const job = e.job_id ?? ""
  const p = e.payload ?? {}
  switch (e.kind) {
    case "offer_accepted":
      return { title: t("bell.toast.accepted", { shop, job, credit: fmtCredit(e.credit_cad) }), description: null, tone: "success" }
    case "offer_declined":
      return { title: t("bell.toast.declined", { shop, job, reason: reasonText(p.reason_code) }), description: t("feed.declined.detail"), tone: "danger" }
    case "offer_question":
      return { title: t("bell.toast.question", { shop, job, question: questionText(p.question_code) }), description: str(p.note), tone: "action" }
    case "offer_undo":
      return { title: t("bell.toast.undo", { shop, job }), description: t("feed.undo.detail"), tone: "info" }
    case "funding_requested": {
      const pkg = e.package_id ? ctx.packages?.find((x) => x.id === e.package_id) : undefined
      const requirement = str(p.requirement) ?? pkg?.gap?.requirement ?? ""
      return {
        title: t("bell.toast.funding", {
          shop,
          requirement: certShort(requirement),
          cost: money(num(p.est_cost_cad) ?? pkg?.est_cost_cad ?? null),
          credit: money(e.credit_cad ?? pkg?.est_credit_cad ?? null),
        }),
        description: e.package_id ?? null,
        tone: "action",
      }
    }
    case "capacity_confirmed": {
      const accepted = num(p.accepted_load_hours) ?? 0
      const hours = num(p.hours_week) ?? 0
      const over = num(p.over_by_hours) ?? Math.max(0, accepted - hours)
      return {
        title: t("bell.toast.capacity", { shop, hours, weeks: num(p.horizon_weeks) ?? 4 }),
        description: over > 0 ? t("feed.capacity.over", { accepted, over }) : t("feed.capacity.detail", { accepted }),
        tone: over > 0 ? "warn" : "info",
      }
    }
    case "cert_declared":
      return {
        title: t("bell.toast.cert", { shop, cert: certShort(str(p.cert_type) ?? ""), date: str(p.expires_at) ?? "—" }),
        description: null,
        tone: "info",
      }
    default:
      return null
  }
}
