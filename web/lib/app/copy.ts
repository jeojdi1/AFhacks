// Wording owned by Agent R (docs/app-spec.md §2.5, §2.8): the W47.1 wording fix
// (packageTitle), requirement names, and the /m Grow and Trainee strings.
//
// W47.1 is a *company* certification: Shieldworks qualifies welders under the shop's
// W47.1, it does not "certify welders to W47.1". The engine and fixture strings
// keep the old wording until after the freeze (roadmap wk 1, a CONTRACT: commit),
// so the UI rewrites them here.

import type { ShopTraining, TrainingPackage } from "@/lib/api/types"
import { CERT_LABEL, PROCESS_LABEL } from "@/lib/format"
import { certPlain } from "@/lib/ui/plain"
import { extendStrings, t } from "./strings"

/** "Tallowfield Fabricating Ltd." → "Tallowfield Fabricating" */
export function shortShopName(name: string): string {
  return name.replace(/,?\s+(Ltd|Limited|Inc|Incorporated|Corp|Corporation|Co|LLC|Ltée)\.?$/i, "").trim()
}

/** Readable name for a cert type or process tag ("CWB W47.1", "Welding"). */
export function requirementName(req: string): string {
  return CERT_LABEL[req] ?? PROCESS_LABEL[req] ?? req.replace(/_/g, " ")
}

/** Short cert name for chips and titles ("CGP", "CPCSC L1", "CWB W47.1"). */
export function requirementShort(req: string): string {
  if (req === "CGP") return "CGP"
  if (req === "CPCSC_L1") return "CPCSC L1"
  return requirementName(req)
}

function isW471(pkg: Pick<TrainingPackage, "gap" | "cert_unlock">): boolean {
  return pkg.gap?.kind === "cert" && pkg.cert_unlock === "CWB_W47.1"
}

/**
 * Title for a training package. For the W47.1 certification gap:
 * "Qualify 4 welders (FCAW/GMAW) under CSA W47.1 at Tallowfield Fabricating (Woolwich)".
 * Every other package keeps the engine's title.
 */
export function packageTitle(pkg: TrainingPackage): string {
  if (!isW471(pkg)) return pkg.title
  return t("copy.pkg.w471Title", {
    count: pkg.trainees,
    shop: shortShopName(pkg.shop_name),
    city: pkg.shop_city,
  })
}

/** One-line caveat under the title (W47.1 only), or null. */
export function packageCaveat(pkg: TrainingPackage): string | null {
  return isW471(pkg) ? t("copy.pkg.w471Caveat") : null
}

/** GET /shops/{id} training[] message with the W47.1 wording fixed. */
export function trainingLine(tr: ShopTraining): string {
  if (tr.cert_unlock !== "CWB_W47.1") return tr.message
  return tr.status === "funded"
    ? t("copy.training.w471Funded", { count: tr.trainees })
    : t("copy.training.w471Suggested", { count: tr.trainees })
}

const lowerFirst = (x: string) => (x ? x.charAt(0).toLowerCase() + x.slice(1) : x)

/**
 * Grow title for a certificate, never a bare acronym (docs/ux-simplification.md §2):
 * "Get welding certification (CWB W47.1)", "Get quality certificate (ISO 9001)",
 * "Register for Controlled Goods", "Do the cyber self-check (CPCSC L1)".
 */
export function certGrowTitle(req: string): string {
  if (req === "CGP") return t("grow.itemTitleCgp")
  if (req === "CPCSC_L1") return t("grow.itemTitleCpcsc")
  const p = certPlain(req)
  return t("grow.itemTitle", { req: p.first !== p.label ? lowerFirst(p.first) : p.first })
}

/**
 * Grow item title: "Get welding certification (CWB W47.1)", "More welding hours" (capacity),
 * "Add wire harness work" (process). A raw key ("wire_harness") never reaches the screen.
 */
export function growTitle(req: string, kind?: string | null): string {
  if (kind === "capacity") return t("grow.itemTitleCapacity", { req: requirementName(req).toLowerCase() })
  if (kind === "process" || (!kind && PROCESS_LABEL[req])) return t("grow.itemTitleProcess", { req: requirementName(req).toLowerCase() })
  return certGrowTitle(req)
}

/**
 * Title for a funded requirement (Grow "Training under way" row, stepper header): never the
 * "Get …" readiness wording. W47.1: "4 welders in training under CSA W47.1".
 */
export function trainingUnderwayTitle(req: string, trainees: number): string {
  if (req === "CWB_W47.1") return t("copy.training.w471Funded", { count: trainees })
  const p = certPlain(req)
  return t("grow.underway.itemGeneric", { count: trainees, req: p.first !== p.label ? lowerFirst(p.first) : requirementName(req) })
}

/** { welding: 80 } → "+80 welding h/wk" (null when empty). */
export function capacityUnlockShort(cu: Partial<Record<string, number>> | null | undefined): string | null {
  if (!cu) return null
  const parts = Object.entries(cu)
    .filter(([, h]) => typeof h === "number" && h > 0)
    .map(([p, h]) => `+${h} ${(PROCESS_LABEL[p] ?? p).toLowerCase()} h/wk`)
  return parts.length ? parts.join(" · ") : null
}

// ---------------------------------------------------------------------------
// Strings (English). Added with extendStrings so strings.ts stays Agent S's.

extendStrings("en", {
  "copy.pkg.w471Title": "Qualify {count} welders (FCAW/GMAW) under CSA W47.1 at {shop} ({city})",
  "copy.pkg.w471Title_one": "Qualify 1 welder (FCAW/GMAW) under CSA W47.1 at {shop} ({city})",
  "copy.pkg.w471Caveat": "FCAW/GMAW = flux-cored or MIG welding. Company certification also needs a qualified supervisor and approved WPSs (welding procedure specifications).",
  "copy.training.w471Suggested": "Suggested: qualify {count} welders under CSA W47.1",
  "copy.training.w471Funded": "{count} welders in training under CSA W47.1",

  // --- Grow list -------------------------------------------------------------
  "grow.title": "What would unlock more work",
  "grow.subtitle": "Each item is one step from more Northgate jobs. Tap to see what it takes and who pays.",
  "grow.itemTitle": "Get {req}",
  "grow.itemTitleCapacity": "More {req} hours",
  "grow.itemTitleProcess": "Add {req} work",
  "grow.itemTitleCgp": "Register for Controlled Goods",
  "grow.itemTitleCpcsc": "Do the cyber self-check (CPCSC L1)",
  "grow.itemJobs": "{count} more jobs · {value}",
  "grow.itemJobs_one": "1 more job · {value}",
  "grow.tier.oneGap": "One gap",
  "grow.tier.qualified": "Qualified",
  "grow.tier.inTraining": "Funded · training under way",
  "grow.empty": "No one-step gaps right now",
  "grow.emptyBody": "Shieldworks lists a requirement here when it is the only thing stopping you from a Northgate job.",
  "grow.capacityRow": "Confirm capacity",
  "grow.capacityRowBody": "Free hours per week for the next 4 weeks.",
  "grow.capacityRowDone": "Confirmed {date} · {hours} h/wk free",
  "grow.notFound": "Nothing to unlock for {req}",
  "grow.notFoundBody": "This requirement isn't one step from a Northgate job at this shop right now.",
  "grow.back": "Back to Grow",

  // --- Readiness stepper -----------------------------------------------------
  "ready.unlocks": "Unlocks",
  "ready.steps": "What it takes",
  "ready.stepsNote": "Steps from official sources. Costs and times appear only where a source states them.",
  "ready.noCost": "No cost figures shown: consultant estimates are not from an official source.",
  "ready.source": "Source",
  "ready.registry": "Registry",
  "ready.time": "Time",
  "ready.cost": "Cost",
  "ready.fundableStep": "A training package can pay for this step",
  "ready.flag.verified": "official source",
  "ready.flag.inferred": "inferred",
  "ready.flag.assumption": "assumption",
  "ready.whoPays": "Who pays",
  "ready.primeFunds": "Northgate can fund the welder qualifications: {cost} → {credit} ITB credit ({mult}x)",
  "ready.primeFundsGeneric": "Northgate can fund this: {cost} → {credit} ITB credit ({mult}x)",
  "ready.primeFundsBody": "{trainees} trainees with {provider}. Costs are demo estimates.",
  "ready.noPackage": "No prime-funded package for this yet",
  "ready.noPackageBody": "Northgate funds the training packages Shieldworks proposes. This requirement doesn't have one.",
  "ready.alsoEligible": "May also be eligible",
  "ready.stackingUnknown": "Stacking with prime funding: not confirmed",
  "ready.cta": "Ask Northgate to fund this",
  "ready.ctaSending": "Sending…",
  "ready.requested": "Requested {date} · awaiting Northgate",
  "ready.funded": "Funded · {count} welders in training",
  "ready.fundedGeneric": "Funded · {count} in training",
  "ready.seeSeat": "See the seats",
  "ready.requestedToast": "Request sent to Northgate",
  "ready.requestedToastBody": "Northgate sees your request right away.",
  // After funding (docs/ux-simplification.md §5: never the CWB readiness wording once funded).
  "ready.primeFunded": "Northgate paid {cost} for {count} welder seats ({pkg})",
  "ready.primeFunded_one": "Northgate paid {cost} for 1 welder seat ({pkg})",
  "ready.primeFundedGeneric": "Northgate paid {cost} for {count} training seats ({pkg})",
  "ready.primeFundedGeneric_one": "Northgate paid {cost} for 1 training seat ({pkg})",
  "ready.primeFundedCredit": "Earns Northgate {credit} ITB credit ({mult}x).",
  "ready.primeFundedBody": "Training with {provider}. Costs are demo estimates.",
  "ready.unlockedFunded": "Opened up by this training",
  "grow.underway.title": "Training under way",
  "grow.underway.itemGeneric": "{count} in training for {req}",
  "grow.underway.paidBy": "Paid by Northgate · {pkg}",
  "grow.underway.paidByNoPkg": "Paid by Northgate",
  "ready.notRouted": "Northgate hasn't sent offers yet",
  "ready.notRoutedBody": "Readiness items appear once Northgate routes its parts list.",

  // --- Trainee seat ------------------------------------------------------------
  "seat.header": "Seat {seat} of {total} · {pkg}",
  "seat.missing": "This seat does not exist on {pkg} ({total} seats)",
  "seat.missingNoTotal": "This seat does not exist on {pkg}",
  "seat.missingBody": "Check the link you were sent. Seats are numbered from 1, never named.",
  "seat.pick": "Seat {seat} of {total}",
  "seat.private": "Private link. Shieldworks never shows your name.",
  "seat.stage": "Your stage",
  "seat.stageNote": "Demo simulation: funding puts every seat at \"enrolled\".",
  "seat.current": "Now",
  "seat.done": "Done",
  "seat.next": "Next",
  "seat.provider": "Training provider",
  "seat.testDate": "Example test date",
  "seat.testDateNote": "Funding date plus 6 weeks. Your provider sets the real date.",
  "seat.addToCalendar": "Add test date to calendar",
  "seat.ticket": "Your ticket",
  "seat.ticket.process": "Process",
  "seat.ticket.processValue": "FCAW or GMAW (flux-cored or MIG welding; package example)",
  "seat.ticket.class": "Class",
  "seat.ticket.classValue": "FW, S or T (fillet or groove-weld test class): set by your test",
  "seat.ticket.position": "Position",
  "seat.ticket.positionValue": "The positions your shop welds in production",
  "seat.ticket.keepValid": "Keeping it valid",
  "seat.path": "Path to work",
  "seat.pathLine": "Your ticket helps unlock {count} jobs at your shop: {jobs} ({value})",
  "seat.pathLine_one": "Your ticket helps unlock 1 job at your shop: {jobs} ({value})",
  "seat.eligibility": "Personal certification credit applies to Canadian citizens and permanent residents. Your shop records a yes/no attestation only; Shieldworks stores no ID documents (ITB model terms §7.5.1).",
  "seat.notFunded": "This seat isn't funded yet.",
  "seat.notFundedAsked": "This seat isn't funded yet. Your shop has asked Northgate.",
  "seat.notFundedBody": "When Northgate funds package {pkg}, this card shows your stage, test date and the jobs your ticket helps unlock.",
  "seat.unknownPkg": "No training package {pkg}",
  "seat.unknownPkgBody": "The link may be old, or Northgate hasn't routed its parts list yet.",
  "seat.icsTitle": "CWB welder test (example date) · {pkg}",
  "seat.icsBody": "Example date from Shieldworks: funding date plus 6 weeks (assumption). Your training provider confirms the real date.",
})
