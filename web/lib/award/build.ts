// Build the award package on this device (fixture / demo-data mode), the same
// shape and wording as the engine's GET …/award. Deterministic from the job,
// the shop's certificates and the accept date. No numbers change: the award
// only reads the offer (value, hours, credit) and the job (qty, unit price, CCV).

import type { CertType, Job, Offer } from "@/lib/api/types"
import { CERT_LABEL, fmtMoney } from "@/lib/format"
import { isWeldingTrade, tradeForCert } from "@/lib/trades"
import { addBusinessDays, parseAppDate } from "@/lib/app/today"
import type { Award, AwardDocument, AwardStatus } from "./types"

export const AWARD_WITH = "Northgate supplier development (fictional)"

export interface AwardProgress {
  /** Document key → ISO time it was marked done. */
  docs: Record<string, string>
  slot: string | null
}

export interface CertLike {
  type: CertType | string
  status: string
}

/** Next 5 business days after `anchor`, at 10:00 and 14:00 local. */
export function awardSlots(anchor: Date | string | null): string[] {
  const base = parseAppDate(anchor ?? null) ?? new Date()
  const out: string[] = []
  for (let i = 1; i <= 5; i++) {
    const day = addBusinessDays(base, i)
    for (const h of [10, 14]) {
      const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 0, 0, 0)
      out.push(d.toISOString())
    }
  }
  return out
}

const HELD = new Set(["verified", "declared"])

function qualityDetail(job: Job | null, certs: CertLike[]): string {
  const parts: string[] = []
  const st = (t: string) => certs.find((c) => c.type === t)?.status ?? null
  if (st("ISO9001") && HELD.has(st("ISO9001")!)) parts.push(`ISO 9001 quality system: ${st("ISO9001")} (from the shop's profile)`)
  if (st("AS9100") && HELD.has(st("AS9100")!)) parts.push(`AS9100 aerospace quality: ${st("AS9100")} (from the shop's profile)`)
  const needsCwb = (job?.required_certs ?? []).includes("CWB_W47.1")
  if (needsCwb) {
    const cwb = st("CWB_W47.1")
    parts.push(
      cwb === "pending_training"
        ? "Welding certification (CWB W47.1): welders in training — qualification expected before first article (assumption)"
        : cwb && HELD.has(cwb)
          ? `Welding certification (CWB W47.1): ${cwb} (from the shop's profile)`
          : "Welding certification (CWB W47.1): not on the profile yet — needed before first article (assumption)"
    )
  }
  // Every other trade's certificate in funded training (IPC for electronics or harness work),
  // worded like the engine: "Electronics assembly certification (IPC-A-610): electronics
  // assemblers in training — qualification expected before first article (assumption)".
  for (const ct of job?.required_certs ?? []) {
    if (ct === "CWB_W47.1" || st(ct) !== "pending_training") continue
    const trade = tradeForCert(ct)
    if (!trade || isWeldingTrade(trade)) continue
    parts.push(
      `${trade.label} certification (${CERT_LABEL[ct] ?? ct}): ${trade.workers} in training — qualification expected before first article (assumption)`
    )
  }
  if (!parts.length) parts.push("No quality certificate on the shop's profile yet; Northgate reviews the quality plan at kickoff (assumption)")
  return parts.join(". ")
}

/** The documents for this job, in order. `doneAt` maps key → ISO. Auto documents are attached at accept time. */
export function awardDocuments(offer: Offer, job: Job | null, certs: CertLike[], doneAt: Record<string, string>, acceptedAt: string | null): AwardDocument[] {
  const controlled = !!job?.controlled
  const required = job?.required_certs ?? []
  const qty = job?.qty ?? null
  const unit = job?.unit_price_cad ?? null
  const ccvPct = job?.ccv_pct ?? null
  const ccvText = ccvPct === null ? "—" : `${Math.round((ccvPct > 1 ? ccvPct / 100 : ccvPct) * 100)}%`
  const docs: Omit<AwardDocument, "status" | "done_at">[] = [
    {
      key: "subcontract",
      title: "Subcontract / purchase order (draft)",
      kind: "sign",
      why: "The deal itself: what you make, how many, and what Northgate pays.",
      detail: [
        qty !== null ? `Quantity: ${qty.toLocaleString("en-US")}` : null,
        unit !== null ? `Unit price: ${fmtMoney(unit)}` : null,
        `Total: ${fmtMoney(offer.value_cad)}`,
        "Delivery schedule: to be agreed at kickoff",
        "Net 30 payment (assumption)",
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      key: "nda",
      title: "Mutual non-disclosure agreement",
      kind: "sign",
      why: "Both sides keep each other's business details private.",
      detail: "Standard two-way confidentiality for this job. Demo wording; not a real agreement.",
    },
  ]
  if (controlled)
    docs.push({
      key: "cgp",
      title: "Controlled Goods declaration",
      kind: "sign",
      why: "This part is a controlled good, so only a registered shop may see its drawings.",
      detail: "Technical data moves only through Northgate's secure channel after this check; Shieldworks never stores drawings",
    })
  if (required.includes("CPCSC_L1"))
    docs.push({
      key: "cpcsc",
      title: "Cyber-security self-check (CPCSC Level 1) attestation",
      kind: "sign",
      why: "You confirm the 13 basic cyber-security controls are in place (self-assessed).",
      detail: "Self-assessed; there is no public registry. You confirm the 13 Level 1 controls apply to the systems used for this job.",
    })
  docs.push(
    {
      key: "quality",
      title: "Quality certificates",
      kind: "auto",
      why: "Northgate needs proof of your quality system; we attached it from your profile.",
      detail: qualityDetail(job, certs),
    },
    {
      key: "fai",
      title: "First article inspection plan",
      kind: "upload",
      why: "How you will check the first part before production starts.",
      detail: "Your inspection plan document (no drawings or technical data).",
    },
    {
      key: "ccv",
      title: "Canadian content declaration (for Northgate's ITB report)",
      kind: "sign",
      why: "Northgate reports how much of the work is Canadian. Simplified ITB rules for demo.",
      detail: `Canadian content (CCV) for this job: ${ccvText} of the value (Synthetic). Northgate earns ${fmtMoney(offer.credit_cad)} credit.`,
    },
    {
      key: "insurance",
      title: "Certificate of insurance",
      kind: "upload",
      why: "Standard proof of business insurance for a new supplier.",
      detail: "Your current certificate of insurance.",
    }
  )
  return docs.map((d) => {
    const at = d.kind === "auto" ? (doneAt[d.key] ?? acceptedAt ?? new Date(0).toISOString()) : (doneAt[d.key] ?? null)
    return { ...d, status: at ? "done" : "todo", done_at: at }
  })
}

export function awardAgenda(controlled: boolean): string[] {
  return [
    "Scope and quantities",
    "Delivery schedule",
    "Quality plan and first article",
    "ITB reporting (Canadian content)",
    ...(controlled ? ["Controlled goods handling"] : []),
  ]
}

export function awardNextSteps(controlled: boolean): string[] {
  return [
    "Northgate countersigns the subcontract",
    ...(controlled ? ["Technical data arrives through Northgate's secure channel (never through Shieldworks)"] : ["Northgate shares the job's technical package"]),
    "You make and inspect the first article",
    "Production starts on the agreed schedule",
  ]
}

export function awardStatus(docs: AwardDocument[], booked: boolean): AwardStatus {
  const manual = docs.filter((d) => d.kind !== "auto")
  const done = manual.filter((d) => d.status === "done").length
  if (done === manual.length && booked) return "complete"
  if (done > 0 || booked) return "in_progress"
  return "not_started"
}

export function buildLocalAward(input: {
  shopId: string
  offer: Offer
  job: Job | null
  certs: CertLike[]
  acceptedAt: string | null
  progress: AwardProgress
}): Award {
  const { shopId, offer, job, certs, acceptedAt, progress } = input
  const controlled = !!job?.controlled
  const documents = awardDocuments(offer, job, certs, progress.docs, acceptedAt)
  const slots = awardSlots(acceptedAt)
  const slot = progress.slot && slots.includes(progress.slot) ? progress.slot : null
  return {
    shop_id: shopId,
    job_id: offer.job_id,
    part_no: offer.part_no,
    description: offer.description,
    value_cad: offer.value_cad,
    hours_week: offer.hours_week,
    credit_cad: offer.credit_cad,
    controlled,
    required_certs: job?.required_certs ?? [],
    status: awardStatus(documents, !!slot),
    documents,
    call: { booked: !!slot, slot, slots, agenda: awardAgenda(controlled), with: AWARD_WITH },
    next_steps: awardNextSteps(controlled),
    qty: job?.qty ?? null,
    unit_price_cad: job?.unit_price_cad ?? null,
    ccv_pct: job?.ccv_pct ?? null,
    multiplier: offer.multiplier,
  }
}
