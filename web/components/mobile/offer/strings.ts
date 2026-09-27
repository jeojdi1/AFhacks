// Copy for the offer screens (T3). Registered with the shared t() dictionary
// at module scope, so French can be added later with the same keys.
// Import this module (for its side effect) from every offer component.

import { extendStrings } from "@/lib/app/strings"

extendStrings("en", {
  // list
  "o.list.needReply": "{count} offers need a reply",
  "o.list.needReply_one": "1 offer needs a reply",
  "o.list.soonest": "Soonest reply by {date}",
  "o.list.allAnswered": "All offers answered",
  "o.list.answered": "Answered",
  "o.list.noBidding": "No bidding. Each offer went only to your shop.",
  "o.list.total": "{value} of work offered · {hours} h/wk if you accept all",
  "o.list.none": "No offers for this shop",
  "o.list.noneBody": "Northgate routed its parts list, but none of the jobs went to this shop.",
  "o.list.error": "Could not load offers",
  "o.list.retry": "Try again",
  "o.list.valueLabel": "Total value",
  "o.list.hoursWeek": "{hours} h/wk",
  "o.chip.replyBy": "Reply by {date}",
  "o.chip.new": "New",
  "o.chip.newTitle": "Offered after Northgate funded training at your shop",
  "o.chip.willSend": "Will send",
  "o.replyBy.assumption": "Reply-by date is set by the prime; the demo uses 5 business days after routing.",

  // card
  "o.card.notFound": "This job isn't offered to your shop",
  "o.card.notFoundBody": "It may have been re-routed, or the link is from another shop.",
  "o.card.backToOffers": "Back to offers",
  "o.card.part": "Part {part}",
  "o.card.qty": "{qty} parts (fleet lifetime)",
  "o.card.unitPrice": "{price} each · unit price as given",
  "o.card.totalValue": "Total value",
  "o.card.hoursWeek": "Hours per week",
  "o.card.hoursUnit": "h/wk",
  "o.card.distance": "{km} from Northgate's site",
  "o.card.controlled": "Controlled goods",
  "o.card.why": "Why you",
  "o.card.canWe": "Can we do it?",
  "o.card.canWe.pass": "Everything checks out",
  "o.card.canWe.warn": "Check the flagged items",
  "o.card.canWe.fail": "Something doesn't fit",
  "o.card.noJobData": "Job details are still loading; the checklist appears once they arrive.",
  "o.card.noBidding": "No bidding.",
  "o.card.onlyYou": "{prime} offered this job only to you.",
  "o.card.credit": "{prime} earns {credit} ITB credit ({mult}) if you accept.",
  "o.card.mult.sme": "{mult}x SME",
  "o.card.mult.plain": "{mult}x",
  "o.card.itbGloss": "ITB: Canada's Industrial and Technological Benefits policy; defence primes owe work to Canadian suppliers. SME: small or mid-sized business.",
  "o.card.canWe.show": "Show the {count} checks",
  "o.card.canWe.hide": "Hide the checks",
  "o.card.payment": "Payment terms: set by the prime. Not in demo data.",
  "o.card.paymentNote": "Muster does not invent payment terms; the prime sets them in its purchase order.",
  "o.card.drawings.controlled":
    "Drawings are never stored in Muster. After you accept, Northgate releases the technical data package through its own controlled channel once your CGP registration is confirmed.",
  "o.card.drawings.plain": "Drawings are released by Northgate after acceptance, outside Muster.",
  "o.card.share": "Send to estimator",
  "o.card.shareTitle": "Northgate offer {job}",
  "o.card.shareText":
    "Northgate offer {job} ({part}): {desc}. {qty} parts (fleet lifetime), {value} total, {hours} h/wk. Reply in Muster by {date}. Drawings are released by Northgate after acceptance, outside Muster.",
  "o.card.shareTextNoDate":
    "Northgate offer {job} ({part}): {desc}. {qty} parts (fleet lifetime), {value} total, {hours} h/wk. Reply in Muster. Drawings are released by Northgate after acceptance, outside Muster.",
  "o.card.linkCopied": "Link copied",
  "o.card.linkCopiedBody": "Paste it to your estimator. It carries no drawings or dimensions.",
  "o.card.shareFailed": "Could not share",

  // decision bar / status
  "o.bar.label": "Your answer",
  "o.bar.accepting": "Sending…",
  "o.status.accepted": "Accepted {date}",
  "o.status.acceptedNoDate": "Accepted",
  "o.status.declined": "Declined: {reason}",
  "o.status.declinedNoReason": "Declined",
  "o.status.question": "Question sent: {question}",
  "o.status.questionBody": "Northgate replies by email. You can still accept or decline.",
  "o.status.keep": "Keep my answer",
  "o.toast.accepted": "Accepted",
  "o.toast.acceptedBody": "{prime} sees it now. Undo within 10 seconds.",
  "o.toast.declined": "Declined: {reason}",
  "o.toast.declinedBody": "{prime} sees your reason.",
  "o.toast.question": "Question sent: {question}",
  "o.toast.questionBody": "{prime} replies by email.",
  "o.toast.undone": "Answer withdrawn",
  "o.toast.undoneBody": "{job} is open again.",

  // decline sheet
  "o.decline.title": "Decline {job}?",
  "o.decline.body": "Pick a reason. {prime} sees it right away.",
  "o.decline.reasons": "Reason",
  "o.decline.note": "Note (optional)",
  "o.decline.noteHelp": "No drawings, dimensions or technical data.",
  "o.decline.count": "{n} / 280",
  "o.decline.submit": "Send decline",
  "o.decline.pick": "Pick a reason first",

  // ask sheet
  "o.ask.title": "Ask Northgate about {job}",
  "o.ask.body": "Pick a question. Northgate replies by email. There is no chat, so no technical data ends up in Muster.",
  "o.ask.questions": "Question",
  "o.ask.submit": "Send question",
  "o.ask.pick": "Pick a question first",

  "o.sheet.cancel": "Cancel",
  "o.sheet.close": "Close",
})

export {}
