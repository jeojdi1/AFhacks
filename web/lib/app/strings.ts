// All /m copy goes through t(). English only tonight; French drops in later
// (roadmap wk 2) as a second dictionary with the same keys.
//
// Usage:
//   t("offers.needReply", { count: 2, date: "Thu Oct 1" })
//   → "2 offers need a reply · soonest reply by Thu Oct 1"
// Plurals: when vars.count is a number, `${key}_one` is used for 1 if it exists.
// Feature modules that need their own copy can call extendStrings("en", {...})
// at module scope instead of editing this file.

export type Locale = "en" | "fr"
type Dict = Record<string, string>

const en = {
  // --- app + roles ---------------------------------------------------------
  "app.name": "Muster",
  "app.tagline": "Defence work and workers for small Canadian factories",
  "role.title": "Who's using Muster?",
  "role.subtitle": "Pick a view. Muster remembers your choice on this device.",
  "role.shop.title": "Shop: Tallowfield Fabricating (synthetic)",
  "role.shop.body": "Offers, certifications and what would unlock more work.",
  "role.prime.title": "Prime: Northgate supplier development",
  "role.prime.body": "Who accepted, who declined and why, and credit at risk.",
  "role.trainee.title": "Trainee: Seat 3, TP-01",
  "role.trainee.body": "Your training stage and the jobs your ticket helps unlock.",
  "role.lastUsed": "Last used",
  "role.continue": "Continue as {role}",
  "role.otherShops": "Other shops with offers",
  "role.otherShops.empty": "Offers appear here once Northgate routes its parts list on the laptop.",
  "role.otherShops.row": "{count} offers · {value}",
  "role.otherShops.row_one": "1 offer · {value}",
  "role.desktop": "Open the desktop view",

  // --- header / chrome -----------------------------------------------------
  "header.back": "Back",
  "header.mode.live": "Live",
  "header.mode.fixtures": "Demo data",
  "header.mode.detecting": "Connecting…",
  "header.mode.offline": "Offline",
  "header.mode.notConnected": "Not connected",
  "header.mode.offlineTitle": "This phone is offline. Answers are saved here and sent when it reconnects.",
  "header.mode.notConnectedTitle": "Can't reach the Muster engine right now. Answers are saved here and sent when it answers.",
  "title.home": "Muster",
  "title.today": "Today",
  "title.offers": "Offers",
  "title.offer": "Offer {id}",
  "title.certs": "Certifications",
  "title.grow": "Grow",
  "title.growItem": "Get {cert}",
  "title.prime": "Northgate activity",
  "title.trainee": "Training seat",
  "title.tenders": "Defence tenders",
  "tabs.label": "Shop sections",
  "tabs.today": "Today",
  "tabs.offers": "Offers",
  "tabs.certs": "Certs",
  "tabs.grow": "Grow",
  "tabs.offersBadge": "{count} offers need a reply",
  "tabs.offersBadge_one": "1 offer needs a reply",

  // --- freshness / offline -------------------------------------------------
  "fresh.updated": "Updated {time}",
  "fresh.never": "Not updated yet",
  "fresh.refresh": "Refresh",
  "fresh.refreshing": "Refreshing…",
  "offline.banner": "Offline · showing {time} data · {count} actions waiting",
  "offline.banner_one": "Offline · showing {time} data · 1 action waiting",
  "offline.noPending": "Offline · showing {time} data",
  "offline.sending": "Sending {count} actions…",
  "offline.sending_one": "Sending 1 action…",
  "offline.willSend": "Will send",
  "offline.noData": "Offline · nothing saved on this phone yet",
  "unreach.banner": "Can't reach Muster · showing {time} data · {count} actions waiting",
  "unreach.banner_one": "Can't reach Muster · showing {time} data · 1 action waiting",
  "unreach.noPending": "Can't reach Muster · showing {time} data",
  "unreach.noData": "Can't reach Muster · nothing saved on this phone yet",
  "unreach.title": "Can't reach Muster right now",
  "unreach.titleOffline": "This phone is offline",
  "unreach.bodyStale": "Showing what was saved on this phone at {time}. Answers you give are kept here and sent when Muster is back.",
  "unreach.bodyNone": "Nothing from Northgate is saved on this phone yet, so there is nothing to show. Offers appear once Muster answers.",
  "unreach.retry": "Try again",
  "unreach.retrying": "Trying…",
  "offline.queuedToast": "Saved on this phone",
  "offline.queuedToastBody": "Muster will send it when you're back online.",

  // --- footer ----------------------------------------------------------------
  "footer.itb": "Simplified ITB rules for demo",
  "footer.data": "Public data unverified · Not affiliated · Data: Statistics Canada ODBus (OGL)",
  "footer.fiction": "Northgate Land Systems is fictional. Synthetic shops are labelled. Training partners are examples, not affiliates.",
  "footer.drawings": "Muster never stores drawings or technical data.",

  // --- install hint ----------------------------------------------------------
  "install.title": "Add Muster to your Home Screen",
  "install.body": "Open offers in one tap. No app store, no new password.",
  "install.step1": "Tap Share",
  "install.step2": "Add to Home Screen",
  "install.step3": "Open Muster",
  "install.dismiss": "Not now",

  // --- labels / statuses -----------------------------------------------------
  "label.synthetic": "Synthetic",
  "label.public": "Public data — unverified — not affiliated",
  "label.illustrative": "illustrative",
  "label.shopDeclared": "shop-declared",
  "label.assumption": "assumption",
  "label.simplifiedItb": "Simplified ITB rules for demo",
  "cert.status.verified": "Verified",
  "cert.status.declared": "Declared",
  "cert.status.unknown": "Not held",
  "cert.status.pending_training": "Pending training",
  "stage.ok": "OK",
  "stage.window_open": "Window open",
  "stage.urgent": "Urgent",
  "stage.lapsed": "Lapsed",
  "stage.unknown": "Date unknown",
  "offer.status.offered": "Awaiting reply",
  "offer.status.accepted": "Accepted",
  "offer.status.declined": "Declined",
  "offer.status.question": "Question sent",

  // --- decisions (T3) ----------------------------------------------------------
  "decision.accept": "Accept",
  "decision.decline": "Decline",
  "decision.ask": "Ask Northgate",
  "decision.undo": "Undo",
  "decision.change": "Change answer",
  "decision.acceptedToast": "Accepted",
  "decision.acceptedAt": "Accepted {date}",
  "decision.declinedWith": "Declined: {reason}",
  "decision.questionSent": "Question sent: {question}",
  "decision.notePlaceholder": "Optional note (280 characters max)",
  "reason.capacity": "No capacity",
  "reason.price": "Price too low",
  "reason.tooling": "Need new tooling",
  "reason.schedule": "Schedule",
  "reason.not_our_process": "Not our process",
  "reason.other": "Other",
  "question.lead_time": "Lead time",
  "question.material_supply": "Material supply",
  "question.first_article": "First-article inspection requirement",
  "question.quantity_split": "Split the quantity",

  // --- event messages (fixture mode builds them like the engine) --------------
  "event.routed": "{prime} routed {count} jobs to Canadian shops",
  "event.offer_accepted": "{shop} accepted {job}",
  "event.offer_declined": "{shop} declined {job}: {reason}",
  "event.offer_question": "{shop} asked about {question} on {job}",
  "event.offer_undo": "{shop} withdrew its answer on {job}",
  "event.funding_requested": "{shop} asked {prime} to fund {requirement}",
  "event.package_funded": "{package} funded → {count} jobs unblocked",
  "event.capacity_confirmed": "{shop}: {hours} h/wk free for the next {weeks} weeks",
  "event.cert_declared": "{shop} added a {cert} expiry date: {date} (shop-declared)",

  // --- errors -----------------------------------------------------------------
  "error.notRouted": "Route the program first",
  "error.notOffered": "Job '{job}' is not offered to shop '{shop}'",
  "error.reasonRequired": "Pick a reason for declining",
  "error.questionRequired": "Pick a question to ask",
  "error.noteTooLong": "The note is longer than 280 characters",
  "error.noPackage": "No training package for {requirement} at shop '{shop}'",
  "error.alreadyFunded": "Training package '{package}' is already funded",
  "error.hoursRange": "Hours per week must be between 0 and 2000",
  "error.horizon": "Pick 4, 8 or 12 weeks",
  "error.badDate": "Enter a valid date within the next 10 years",
  "error.unknownCert": "Unknown certification type '{cert}'",
  "error.certNumber": "The certificate number is longer than 40 characters",
  "error.unknownShop": "Unknown shop '{shop}'",
  "error.actionFailed": "Could not save that",

  // --- empty states -------------------------------------------------------------
  "empty.notRouted": "Northgate hasn't sent offers yet",
  "empty.notRoutedBody": "Offers appear here once Northgate routes its parts list.",
  "empty.clear": "You're clear. Next check-in Monday.",
  "empty.loading": "Loading…",
} as const satisfies Dict

export type StringKey = keyof typeof en

const dictionaries: Record<Locale, Dict> = {
  en: { ...en },
  // French keys land in roadmap week 2; missing keys fall back to English.
  fr: {},
}

let current: Locale = "en"

export function getLocale(): Locale {
  return current
}

/** Switch the dictionary (no UI for this yet). */
export function setLocale(l: Locale): void {
  current = l
}

/** Add or override strings for a locale (call at module scope in a feature file). */
export function extendStrings(locale: Locale, dict: Dict): void {
  Object.assign(dictionaries[locale], dict)
}

export type StringVars = Record<string, string | number | null | undefined>

function lookup(key: string, count: unknown): string | undefined {
  const loc = dictionaries[current]
  const base = dictionaries.en
  if (count === 1) {
    const one = loc[`${key}_one`] ?? base[`${key}_one`]
    if (one !== undefined) return one
  }
  return loc[key] ?? base[key]
}

/**
 * Translate a key and fill {placeholders}. Unknown keys return the key itself,
 * so a missing string is visible rather than blank.
 */
export function t(key: StringKey | (string & {}), vars?: StringVars): string {
  const s = lookup(key, vars?.count)
  if (s === undefined) return key
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = vars[name]
    return v === null || v === undefined ? m : String(v)
  })
}

/** True when a key exists in the current (or English) dictionary. */
export function hasString(key: string): boolean {
  return lookup(key, undefined) !== undefined
}
