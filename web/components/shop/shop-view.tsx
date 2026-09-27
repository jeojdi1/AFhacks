"use client"

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { AlertTriangle, ArrowLeft, Building2, CircleCheck, ExternalLink, Globe, Info, MapPin, Users } from "lucide-react"
import { toast } from "sonner"
import { useDemo } from "@/lib/data/store"
import { useAppActions, useShopActions } from "@/lib/app/actions-store"
import { t } from "@/lib/app/strings"
import type { ReasonCode } from "@/lib/app/types"
import { MATERIAL_LABEL, PROCESS_LABEL, fmtMoney } from "@/lib/format"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { StoryBanner } from "@/components/muster/story-banner"
import { AutoNextStep } from "@/components/muster/next-step"
import { Details } from "@/components/muster/details"
import { EmptyState } from "@/components/muster/empty-state"
import { StatCard } from "@/components/muster/stat-card"
import { StatusBadge } from "@/components/muster/status-badge"
import { Term } from "@/components/muster/term"
import { Rich, c } from "@/lib/ui/copy"
import { ce } from "@/lib/ui/copy-e"
import { certPlain } from "@/lib/ui/plain"
import { isDemoShopPath } from "@/lib/ui/steps"
import { useStoryMode } from "@/lib/ui/story-mode"
import { useWithParams } from "@/lib/ui/use-with-params"
import { useSession } from "@/lib/auth/session"
import { useStoryChrome } from "@/components/shell/chrome-gate"
import { cn } from "@/lib/utils"
import { CapabilitiesCard } from "./capabilities-card"
import { CertificationsCard } from "./certifications-card"
import { OfferInbox, type InboxDecision } from "./offer-inbox"
import { useGoToAward } from "@/components/award/use-go-to-award"
import { decisionIsSimulated } from "@/lib/app/sim-flag"
import { withCertDates } from "@/lib/app/shop-bundle"
import { ReadinessCard } from "./readiness-card"
import { ShopHeader } from "./shop-header"
import { TrainingCard } from "./training-card"
import {
  fx,
  isPublicShopId,
  publicShopDetailFrom,
  type PublicShopDetail,
  type PublicShopExtras,
} from "@/lib/data/fixture-source"
import { CertName, DndBadge, ShopLabelBadge, dndLine, dndTip, glossNote } from "./badges"
import type { DndHistory, JobInfo, ShopDetail } from "./types"
import { stripBase } from "@/lib/base-path"

export function ShopView({ id, dnd = null }: { id: string; dnd?: DndHistory | null }) {
  // Discovered public shops (pub-XXX) are listed but never routed: their page shows
  // capabilities, self-reported certs and provenance only (no offers/readiness/training).
  return isPublicShopId(id) ? <PublicShopView id={id} dnd={dnd} /> : <RoutableShopView id={id} />
}

function LoadError({ id, error }: { id: string; error: string }) {
  const wp = useWithParams()
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-5 text-amber-900">
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4" aria-hidden />
        {ce("shop.error", { id })}
      </div>
      <p className="mt-1 text-sm">{error}</p>
      <Link href={wp("/network")} className="mt-3 inline-block text-sm font-medium underline">
        {ce("shop.back")}
      </Link>
    </div>
  )
}

/** "Tallowfield Fabricating Ltd." → "Tallowfield" (the banner's short name). */
function shortName(name: string): string {
  return name.split(/\s+/)[0] ?? name
}

const SUPPLIERS_HREF = "/prime/suppliers"
const noopSubscribe = () => () => {}
const readSearch = () => (typeof window === "undefined" ? "" : window.location.search)
const serverSearch = () => ""

/**
 * Where the profile's "back" goes. Opened from Find suppliers (?from=suppliers), or by the
 * defence company on a shop that isn't the Story's step-5 shop: back to Find suppliers.
 * Otherwise null, and the page keeps its Story links (signed-out Story mode).
 */
function useSuppliersBack(isDemoShop: boolean): { fromSuppliers: boolean } | null {
  usePathname() // re-read the search on client navigation
  const search = useSyncExternalStore(noopSubscribe, readSearch, serverSearch)
  const { session, hydrated } = useSession()
  let fromSuppliers = false
  try {
    fromSuppliers = new URLSearchParams(search).get("from") === "suppliers"
  } catch {
    /* keep false */
  }
  if (fromSuppliers) return { fromSuppliers }
  if (hydrated && session?.role === "prime" && !isDemoShop) return { fromSuppliers }
  return null
}

/**
 * Is the previous entry in this tab's history Find suppliers? Uses the Navigation API
 * (same-origin entries only); null where the browser doesn't have it.
 */
function previousIsSuppliers(): boolean | null {
  if (typeof window === "undefined") return null
  const nav = (window as unknown as { navigation?: { currentEntry?: { index: number } | null; entries?: () => { url: string | null }[] } })
    .navigation
  if (!nav?.currentEntry || typeof nav.entries !== "function") return null
  const i = nav.currentEntry.index
  if (i < 1) return false
  const prev = nav.entries()[i - 1]?.url
  if (!prev) return false
  try {
    return stripBase(new URL(prev).pathname) === SUPPLIERS_HREF
  } catch {
    return false
  }
}

/**
 * "← Back to Find suppliers". When the previous page in this tab is Find suppliers,
 * history.back() restores the search as it was (filters live in its URL); else a plain link.
 */
function BackToSuppliers({ fromSuppliers, variant = "button" }: { fromSuppliers: boolean; variant?: "button" | "inline" }) {
  const wp = useWithParams()
  const router = useRouter()
  return (
    <Link
      href={wp(SUPPLIERS_HREF)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        const prev = previousIsSuppliers()
        // No Navigation API: trust ?from=suppliers when this tab has history to go back to.
        if (prev === true || (prev === null && fromSuppliers && window.history.length > 1)) {
          e.preventDefault()
          router.back()
        }
      }}
      className={
        variant === "button"
          ? "inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 text-[0.95rem] font-medium text-foreground shadow-xs hover:bg-muted"
          : "inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      }
      data-back-to-suppliers
    >
      <ArrowLeft className={variant === "button" ? "size-4" : "size-3.5"} aria-hidden />
      {c("shop.backToSuppliers")}
    </Link>
  )
}

function RoutableShopView({ id }: { id: string }) {
  const demo = useDemo()
  const { stage, mode, fundResults, jobs, blocked, offerStatus, setOfferStatus, demoShopId } = demo
  // Live: answers go to the engine (POST /shops/{id}/offers/{job}/decision), same path as the
  // phone OfferCard, and each offer's status comes from the engine's decisions. Fixtures: local.
  const appActions = useAppActions()
  const shopActions = useShopActions(id)
  const viaEngine = appActions.source === "engine"
  const goToAward = useGoToAward(false)

  // Keep the latest loader in a ref so an unstable function identity never re-triggers the fetch.
  const getShopRef = useRef(demo.getShop)
  useEffect(() => {
    getShopRef.current = demo.getShop
  })

  const fundKey = Object.keys(fundResults ?? {}).sort().join(",")
  const fetchKey = `${id}|${stage}|${mode}|${fundKey}`
  const [result, setResult] = useState<{ key: string; data?: ShopDetail; error?: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    getShopRef
      .current(id)
      .then((data) => {
        if (!cancelled) setResult({ key: fetchKey, data })
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setResult((prev) => ({
            key: fetchKey,
            data: prev?.data,
            error: e instanceof Error ? e.message : String(e),
          }))
      })
    return () => {
      cancelled = true
    }
  }, [id, fetchKey])

  const data = result?.data && result.data.shop.id === id ? result.data : undefined

  const newJobIds = useMemo(() => {
    const s = new Set<string>()
    for (const r of Object.values(fundResults ?? {})) {
      for (const j of r?.unblocked_jobs ?? []) s.add(j.job_id)
    }
    return s
  }, [fundResults])

  const jobInfo = useMemo(() => {
    const m: Record<string, JobInfo> = {}
    for (const j of jobs ?? []) m[j.id] = { part_no: j.part_no, description: j.description, value_cad: j.est_value_cad }
    for (const b of blocked ?? [])
      m[b.job_id] ??= { part_no: b.part_no, description: b.description, value_cad: b.value_cad }
    return m
  }, [jobs, blocked])

  const certsByJob = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const j of jobs ?? []) m[j.id] = j.required_certs ?? []
    for (const b of blocked ?? []) m[b.job_id] ??= b.required_certs ?? []
    return m
  }, [jobs, blocked])

  const back = useSuppliersBack(isDemoShopPath(`/shops/${id}`, demoShopId))
  const storyChrome = useStoryChrome()

  // The shop's own actions (phone app §2.5/§2.8), as the shop desk shows them: a declared expiry
  // overrides the date ("shop-declared"), and an open funding request replaces the fund link.
  const shownCerts = useMemo(
    () => (data ? withCertDates(data.certifications, id, shopActions.declaredCerts, data.shop.source) : []),
    [data, id, shopActions.declaredCerts]
  )
  const openRequests = useMemo(
    () => Object.values(shopActions.fundingRequests).filter((r) => r.status !== "funded"),
    [shopActions.fundingRequests]
  )
  const fundingRequested = useMemo(() => openRequests.map((r) => r.requirement), [openRequests])
  const fundingRequestedPkgs = useMemo(() => openRequests.map((r) => r.package_id), [openRequests])

  // /shop's "All certificates →" links to #certificates: scroll there once the card has rendered.
  const hasData = !!result?.data
  useEffect(() => {
    if (!hasData || typeof window === "undefined" || window.location.hash !== "#certificates") return
    document.getElementById("certificates")?.scrollIntoView({ block: "start" })
  }, [hasData])

  if (!data) {
    if (result?.error) return <LoadError id={id} error={result.error} />
    return (
      <div className="space-y-6" aria-busy>
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    )
  }

  const { shop, certifications, offers, readiness, training } = data
  const isDemoShop = isDemoShopPath(`/shops/${shop.id}`, demoShopId)
  const routed = stage === "routed" || stage === "funded" || offers.length > 0
  const fundedPkgs = training.filter((t) => t.status === "funded")
  const trainees = fundedPkgs.reduce((s, t) => s + (t.trainees ?? 0), 0)
  // Never show the CWB readiness message after funding (docs/demo-script.md rule).
  const funded = stage === "funded" || fundedPkgs.length > 0
  const shownReadiness = funded
    ? readiness.filter((r) => !(r.kind === "cert" && r.requirement === "CWB_W47.1"))
    : readiness
  const offeredValue = offers.reduce((s, o) => s + o.value_cad, 0)
  const creditValue = offers.reduce((s, o) => s + o.credit_cad, 0)
  const readinessValue = shownReadiness.reduce((s, r) => s + (r.value_cad ?? 0), 0)
  const readinessJobs = shownReadiness.reduce((s, r) => s + (r.jobs_unlocked?.length ?? 0), 0)
  const newOffers = offers.filter((o) => newJobIds.has(o.job_id))
  const newCount = newOffers.length
  const newValue = newOffers.reduce((s, o) => s + o.value_cad, 0)
  const topCert = shownReadiness.find((r) => r.kind === "cert")
  const money = (n: number) => fmtMoney(n, { compact: true })

  // Certificates this shop's offers and one-step jobs need (§5.5: Story mode lists these + held).
  const neededTypes = [
    ...new Set([
      ...offers.flatMap((o) => certsByJob[o.job_id] ?? []),
      ...shownReadiness.flatMap((r) => [
        ...(r.kind === "cert" && r.requirement ? [r.requirement] : []),
        ...(r.jobs_unlocked ?? []).flatMap((j) => certsByJob[j] ?? []),
      ]),
    ]),
  ]

  const vars = { shop: shop.name, town: shop.city, n: offers.length, value: money(offeredValue) }
  let summary: string
  let lookAt: string
  if (!routed) {
    summary = ce("shop.b.empty", vars)
    lookAt = ce("shop.b.empty.look")
  } else if (funded && trainees > 0 && newCount > 0) {
    const k = { seats: trainees, shopShort: shortName(shop.name), k: newCount, jobsValue: money(newValue) }
    summary = c("shop.b.funded", k)
    lookAt = c("shop.b.funded.look", k)
  } else if (offers.length === 0) {
    summary = ce("shop.b.noOffers", vars)
    lookAt = c("shop.b.look")
  } else if (topCert) {
    summary = c("shop.b", { ...vars, k: topCert.jobs_unlocked?.length ?? 0 })
    lookAt = c("shop.b.look")
  } else {
    summary = ce("shop.b.noReach", vars)
    lookAt = c("shop.b.look")
  }

  // Offer answers: engine decisions in live mode; demo.offerStatus in fixtures mode.
  const inboxDecisions: Record<string, InboxDecision> = {}
  if (viaEngine) {
    for (const [jobId, d] of Object.entries(shopActions.decisions)) {
      if (d.decision === "undo") continue
      inboxDecisions[jobId] = {
        decision: d.decision,
        reason_code: d.reason_code,
        question_code: d.question_code,
        pending: d.pending,
        simulated: decisionIsSimulated(d, shopActions.events),
      }
    }
  } else {
    const prefix = `${shop.id}:`
    for (const [k, v] of Object.entries(offerStatus ?? {})) {
      if (k.startsWith(prefix) && (v === "accepted" || v === "declined")) inboxDecisions[k.slice(prefix.length)] = { decision: v }
    }
  }
  const prime = offers[0]?.prime_name?.split(" ")[0] || "Northgate"
  const accept = async (jobId: string) => {
    if (!viaEngine) {
      setOfferStatus(shop.id, jobId, "accepted")
      goToAward(shop.id, jobId)
      return
    }
    const r = await shopActions.decide(jobId, { decision: "accepted" })
    if (!r || r.pending) return
    toast.success("Accepted", { description: `${prime} sees it now.` })
    goToAward(shop.id, jobId)
  }
  const decline = async (jobId: string, reason: ReasonCode, note: string | null) => {
    if (!viaEngine) return setOfferStatus(shop.id, jobId, "declined")
    const r = await shopActions.decide(jobId, { decision: "declined", reason_code: reason, note })
    if (!r || r.pending) return
    toast.message(`Declined: ${t(`reason.${reason}`).toLowerCase()}`, {
      description: `${prime} sees your reason.`,
    })
  }

  const stats = (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-shop-stats>
      <StatCard
        label={c("shop.stat.offers")}
        value={<span title={fmtMoney(offeredValue)}>{money(offeredValue)}</span>}
        sub={
          newCount > 0
            ? ce("shop.stat.offers.subNew", { n: offers.length, k: newCount })
            : c("shop.stat.offers.sub", { n: offers.length })
        }
      />
      <StatCard
        label={c("shop.stat.why")}
        value={<span title={fmtMoney(creditValue)}>{money(creditValue)}</span>}
        sub={shop.is_sme ? ce("shop.stat.why.value") : ce("shop.stat.why.value1")}
        tone="success"
      />
      <StatCard
        label={c("shop.stat.reach")}
        value={money(readinessValue)}
        sub={readinessJobs > 0 ? c("shop.stat.reach.sub", { k: readinessJobs }) : ce("shop.stat.reach.none")}
        tone={readinessValue > 0 ? "warning" : "muted"}
      />
      <StatCard
        label={c("shop.stat.training")}
        value={String(trainees)}
        sub={fundedPkgs.length > 0 ? c("shop.stat.training.sub") : ce("shop.stat.training.none")}
        tone={trainees > 0 ? "success" : "muted"}
      />
    </div>
  )

  return (
    <div className="space-y-6" data-shop-kind="onboarded">
      {/* The STEP 5 OF 5 banner is Northgate's story: same gate as the story bar (chrome-gate.tsx). */}
      {storyChrome ? (
        <StoryBanner
          step={isDemoShop ? 5 : null}
          tone="shop"
          eyebrow={isDemoShop ? undefined : ce("shop.b.eyebrow.other")}
          summary={<Rich text={summary} />}
          lookAt={lookAt}
          next={back ? <BackToSuppliers fromSuppliers={back.fromSuppliers} /> : <AutoNextStep />}
          className="mb-0"
        />
      ) : null}

      <ShopHeader
        shop={shop}
        back={storyChrome && isDemoShop && !back ? { href: "/gaps", label: ce("shop.back.step4") } : undefined}
      />

      {routed ? (
        <ReadinessCard
          items={readiness}
          jobInfo={jobInfo}
          training={training}
          routed={routed}
          funded={funded}
          shopId={shop.id}
          fundingRequested={fundingRequested}
        />
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          {routed ? (
            <OfferInbox
              offers={offers}
              newJobIds={newJobIds}
              decisions={inboxDecisions}
              certifications={certifications}
              onAccept={accept}
              onDecline={decline}
              shopId={shop.id}
              routed={routed}
            />
          ) : (
            <EmptyState
              title={c("shop.empty.title")}
              body={c("shop.empty.body")}
              run={{ label: c("run.loadAndMatch.shop") }}
            />
          )}
        </div>
        <div className="min-w-0 lg:col-span-5">
          <TrainingCard training={training} shopId={shop.id} fundingRequested={fundingRequestedPkgs} />
        </div>
      </div>

      {stats}

      <div id="certificates" className="scroll-mt-24">
        <CertificationsCard
          certifications={shownCerts}
          shopId={shop.id}
          neededTypes={neededTypes}
          offerTypes={[...new Set(offers.flatMap((o) => certsByJob[o.job_id] ?? []))]}
        />
      </div>

      <Details summary={ce("shop.caps.show")} openSummary={ce("shop.caps.hide")}>
        <CapabilitiesCard shop={shop} />
      </Details>

      <div className="flex justify-end border-t border-border pt-6">
        {back ? <BackToSuppliers fromSuppliers={back.fromSuppliers} /> : <AutoNextStep />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Discovered public shop (pub-XXX): a real company found in public data. Shown as a
// profile only: capabilities, self-reported certifications with their sources, and
// provenance. It is not onboarded, so it gets no offers, readiness or training, and it
// is never presented as a customer or partner (docs/ux-simplification.md §5.6).

const SELF_REPORTED = "Self-reported on company website (unverified)"

const PROVENANCE_FIELD: Record<string, string> = {
  name: "Company name",
  lat_lon: "Location",
  city: "City",
  processes: "Processes",
  materials: "Materials",
  machines: "Machines",
  naics: "Industry code",
  employee_band: "Employees",
  is_sme: "Small-business status",
  website: "Website",
}

const CONFIDENCE_LABEL: Record<string, string> = {
  "website-self-reported": "Company website (self-reported)",
  search: "Web search / geocoder (approximate)",
  odbus: "Statistics Canada ODBus (Open Government Licence)",
}

function isUrl(u: string | null | undefined): u is string {
  return !!u && /^https?:\/\//.test(u)
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

function provenanceField(field: string): string {
  if (field.startsWith("certifications.")) return certPlain(field.slice("certifications.".length)).first
  return PROVENANCE_FIELD[field] ?? field.replace(/_/g, " ")
}

function SourceLink({ url, children }: { url: string; children?: ReactNode }) {
  // Some sources are datasets, not web pages (e.g. "data/processed/candidates.csv (StatCan ODBus, OGL)").
  if (!isUrl(url)) return <span className="text-sm break-words text-muted-foreground">{url}</span>
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex max-w-full items-center gap-1 break-all text-sm font-medium text-sky-800 underline decoration-sky-300 underline-offset-2 hover:text-sky-950"
    >
      {children ?? hostOf(url)}
      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
    </a>
  )
}

// ---------------------------------------------------------------------------
// "Claim this profile" (demo): explains the 3 verification steps and records a claim request
// on this device only (localStorage muster.claims). Nothing is sent, the shop's badges stay
// "Discovered · unverified · not affiliated", and routing and the engine are untouched.

const CLAIMS_KEY = "muster.claims"
const CLAIM_ROLES = ["owner", "operations", "quality", "sales", "other"] as const
type ClaimRole = (typeof CLAIM_ROLES)[number]
interface ClaimRecord {
  shopId: string
  email: string
  role: ClaimRole
  at: string
}

/** Free mail providers: a work email should be at the company's own domain. */
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.ca", "live.com", "live.ca", "msn.com",
  "yahoo.com", "yahoo.ca", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com",
  "gmx.com", "mail.com", "zoho.com", "yandex.com", "sympatico.ca", "shaw.ca", "rogers.com", "telus.net", "bell.net",
])

/** In-memory fallback when storage is blocked (private windows): lasts for this page. */
let claimsMemory: Record<string, ClaimRecord> = {}

function readClaims(): Record<string, ClaimRecord> {
  try {
    const raw = window.localStorage.getItem(CLAIMS_KEY)
    if (!raw) return claimsMemory
    const v = JSON.parse(raw) as unknown
    return v && typeof v === "object" && !Array.isArray(v) ? { ...claimsMemory, ...(v as Record<string, ClaimRecord>) } : claimsMemory
  } catch {
    return claimsMemory
  }
}

function saveClaim(rec: ClaimRecord) {
  claimsMemory = { ...claimsMemory, [rec.shopId]: rec }
  try {
    window.localStorage.setItem(CLAIMS_KEY, JSON.stringify({ ...readClaims(), [rec.shopId]: rec }))
  } catch {
    /* storage blocked: kept in memory for this page */
  }
}

/** "a@b.example.ca" → "b.example.ca" (lower case), or "" when it isn't an email yet. */
function emailDomain(email: string): string {
  const at = email.trim().lastIndexOf("@")
  return at > 0 ? email.trim().slice(at + 1).toLowerCase() : ""
}

/** Does the email's domain match the website's host (or a parent/sub-domain of it)? */
function domainMatches(domain: string, host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "")
  return domain === h || domain.endsWith(`.${h}`) || h.endsWith(`.${domain}`)
}

function ClaimDialog({ shopId, shopName, website }: { shopId: string; shopName: string; website: string | null }) {
  const [open, setOpen] = useState(false)
  const [claim, setClaim] = useState<ClaimRecord | null>(null)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<ClaimRole | "">("")
  const [tried, setTried] = useState(false)
  const emailId = useId()
  const roleId = useId()
  const hintId = useId()
  const host = isUrl(website) ? hostOf(website) : null

  const domain = emailDomain(email)
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const warning = !validEmail
    ? null
    : FREE_MAIL.has(domain)
      ? c("pub.claim.warn.free", { domain })
      : host && !domainMatches(domain, host)
        ? c("pub.claim.warn.domain", { domain, host })
        : null

  const onOpenChange = (o: boolean) => {
    setOpen(o)
    if (o) {
      // Reopening shows the pending request instead of the form.
      setClaim(readClaims()[shopId] ?? null)
      setTried(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!validEmail || !role) return
    const rec: ClaimRecord = { shopId, email: email.trim(), role, at: new Date().toISOString() }
    saveClaim(rec)
    setClaim(rec)
  }

  const steps = [c("pub.claim.step1"), c("pub.claim.step2"), c("pub.claim.step3")]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="lg" className="px-4" />}>{c("pub.claim")}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" data-claim-dialog>
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {ce("pub.claim.title")}
            <span className="inline-flex h-6 items-center rounded-full border border-dashed border-slate-400 px-2 text-xs font-medium text-slate-600">
              {c("pub.claim.demo")}
            </span>
          </DialogTitle>
          <DialogDescription>{c("pub.claim.intro", { name: shopName })}</DialogDescription>
        </DialogHeader>

        <ol className="flex flex-col gap-2 text-sm text-foreground">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                {i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{c("pub.claim.never")}</p>

        {claim ? (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900"
            data-claim-pending
          >
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
            <span>
              <span className="block font-semibold">{c("pub.claim.pending")}</span>
              {c("pub.claim.pending.body", { email: claim.email, role: c(`pub.claim.role.${claim.role}`) })}
              <span className="mt-1 block text-emerald-800">{c("pub.claim.pending.demo")}</span>
            </span>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-3" data-claim-form>
            <div className="flex flex-col gap-1">
              <label htmlFor={emailId} className="text-sm font-medium text-foreground">
                {c("pub.claim.email")}
              </label>
              <input
                id={emailId}
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={host ? `you@${host}` : c("pub.claim.email.placeholder")}
                aria-invalid={tried && !validEmail ? true : undefined}
                aria-describedby={hintId}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 aria-invalid:border-destructive"
              />
              <p id={hintId} className={cn("text-xs", warning || (tried && !validEmail) ? "text-amber-800" : "text-muted-foreground")} aria-live="polite">
                {tried && !validEmail
                  ? c("pub.claim.email.invalid")
                  : warning ?? (host ? c("pub.claim.email.hintHost", { host }) : c("pub.claim.email.hint"))}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={roleId} className="text-sm font-medium text-foreground">
                {c("pub.claim.role")}
              </label>
              <select
                id={roleId}
                required
                value={role}
                onChange={(e) => setRole(e.target.value as ClaimRole | "")}
                aria-invalid={tried && !role ? true : undefined}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 aria-invalid:border-destructive"
              >
                <option value="">{c("pub.claim.role.pick")}</option>
                {CLAIM_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {c(`pub.claim.role.${r}`)}
                  </option>
                ))}
              </select>
              {tried && !role ? <p className="text-xs text-amber-800">{c("pub.claim.role.missing")}</p> : null}
            </div>
            <p className="text-xs text-muted-foreground">{c("pub.claim.privacy")}</p>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>{ce("pub.claim.close")}</DialogClose>
              <Button type="submit" data-claim-submit>
                {c("pub.claim.submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
        {claim ? (
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{ce("pub.claim.close")}</DialogClose>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Card({ title, sub, children }: { title: ReactNode; sub?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="border-b border-border px-5 py-4 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
      </header>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  )
}

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <span
          key={t}
          className="inline-flex h-7 items-center rounded-md border border-border bg-muted px-2.5 text-sm text-foreground"
        >
          {t}
        </span>
      ))}
    </div>
  )
}

function PublicShopView({ id, dnd }: { id: string; dnd: DndHistory | null }) {
  const demo = useDemo()
  const { story } = useStoryMode()
  const wp = useWithParams()
  const back = useSuppliersBack(false)
  const getShopsRef = useRef(demo.getShops)
  useEffect(() => {
    getShopsRef.current = demo.getShops
  })
  const [result, setResult] = useState<{ id: string; data?: PublicShopDetail; error?: string } | null>(null)

  // The GET /shops entry carries everything a public profile shows (cert sources included),
  // so the page is built from the list in both modes. An engine without public shops falls
  // back to the bundled public-data fixture.
  useEffect(() => {
    let cancelled = false
    getShopsRef
      .current()
      .then((r) => {
        const entry = r.shops.find((s) => s.id === id)
        const data = entry ? publicShopDetailFrom(entry) : fx<PublicShopDetail>("GET", `/shops/${id}`)
        if (cancelled) return
        setResult(data ? { id, data } : { id, error: "No discovered shop has this id." })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const data = fx<PublicShopDetail>("GET", `/shops/${id}`)
        setResult(data ? { id, data } : { id, error: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [id, demo.mode])

  const data = result?.id === id ? result.data : undefined

  if (!data) {
    if (result?.id === id && result.error) return <LoadError id={id} error={result.error} />
    return (
      <div className="space-y-6" aria-busy>
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-16" />
        <div className="grid gap-6 lg:grid-cols-12">
          <Skeleton className="h-72 lg:col-span-7" />
          <Skeleton className="h-72 lg:col-span-5" />
        </div>
      </div>
    )
  }

  const shop = data.shop as PublicShopDetail["shop"] & PublicShopExtras
  const provenance = shop.provenance ?? []
  // Only web pages are shown inline; dataset paths live behind the Sources disclosure.
  const sourceFor = (field: string) =>
    provenance.find((p) => p.field === field && isUrl(p.source_url))?.source_url ?? null
  const claimed = data.certifications.filter((x) => x.status !== "unknown")
  const leads = data.certifications.filter((x) => x.status === "unknown" && x.source_url)
  const notStated = data.certifications.filter((x) => x.status === "unknown" && !x.source_url)
  const processes = (shop.processes ?? []).map((p) => PROCESS_LABEL[p] ?? p)
  const materials = (shop.materials ?? []).map((m) => MATERIAL_LABEL[m] ?? m)
  const machines = shop.machines ?? []
  const notes = (shop.notes ?? "")
    .split(";")
    .map((n) => n.trim())
    .filter(Boolean)
    // Plain label before the acronym (§2).
    .map(glossNote)
  const smeSource = provenance.find((p) => p.field === "employee_band" || p.field === "is_sme")
  const fromOdbus = (field: string) => provenance.some((p) => p.field === field && p.confidence === "odbus")
  const pubLabel = shop.label || c("pub.badge")

  return (
    <div className="space-y-6" data-shop-kind="discovered">
      <StoryBanner
        step={null}
        tone="extra"
        summary={<Rich text={ce("pub.b", { name: shop.name, city: shop.city })} />}
        lookAt={ce("pub.b.look")}
        next={back ? <BackToSuppliers fromSuppliers={back.fromSuppliers} /> : <AutoNextStep />}
        className="mb-0"
      />

      <header className="space-y-3">
        {back ? (
          <BackToSuppliers fromSuppliers={back.fromSuppliers} variant="inline" />
        ) : (
          <Link href={wp("/network")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden />
            {ce("shop.back")}
          </Link>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2.5">
            <h1 className="text-2xl font-semibold tracking-tight break-words text-foreground sm:text-3xl">{shop.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <ShopLabelBadge source="public" label={pubLabel} />
              <StatusBadge kind="public" label={ce("pub.chip.real")} title={c("plain.DISCOVERED.tip")} icon={false} />
              {dnd && <DndBadge history={dnd} />}
            </div>
          </div>
          <ClaimDialog shopId={shop.id} shopName={shop.name} website={shop.website ?? null} />
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4 text-slate-400" aria-hidden />
            {shop.city}, ON
          </span>
          {!story && shop.naics && (
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-4 text-slate-400" aria-hidden />
              <Term k="NAICS">{c("shop.naics")}</Term> {shop.naics}
              <span className="text-slate-400">{fromOdbus("naics") ? "(Statistics Canada ODBus)" : "(estimated)"}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4 text-slate-400" aria-hidden />
            {shop.employee_band
              ? `${shop.employee_band} employees ${fromOdbus("employee_band") ? "(Statistics Canada ODBus)" : "(estimated)"}`
              : shop.is_sme
                ? ce("pub.size.smb")
                : "Size not stated"}
          </span>
          {shop.website && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Globe className="size-4 shrink-0 text-slate-400" aria-hidden />
              <SourceLink url={shop.website} />
            </span>
          )}
        </div>
        {dnd && (
          <p className="max-w-3xl text-sm text-slate-700" title={dndTip(dnd)} data-dnd-line>
            {dndLine(dnd)}
          </p>
        )}
      </header>

      <div
        role="note"
        className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3.5 text-sm text-sky-950 sm:px-5"
      >
        <Info className="mt-0.5 size-4 shrink-0 text-sky-700" aria-hidden />
        <p>
          <span className="font-semibold">{c("pub.notOnboarded")}, readiness or training.</span>{" "}
          {ce("pub.notOnboarded.body")}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <Card title={ce("pub.caps.title")} sub={ce("pub.caps.sub")}>
            <div className="space-y-5">
              <dl className="space-y-5">
                <div className="space-y-2">
                  <dt className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-slate-700">
                    Processes
                    {sourceFor("processes") && (
                      <span className="text-xs font-normal text-muted-foreground">
                        Source: <SourceLink url={sourceFor("processes")!} />
                      </span>
                    )}
                  </dt>
                  <dd>
                    <Chips items={processes} empty="No processes stated." />
                  </dd>
                </div>
                <div className="space-y-2">
                  <dt className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-slate-700">
                    Materials
                    {sourceFor("materials") && (
                      <span className="text-xs font-normal text-muted-foreground">
                        Source: <SourceLink url={sourceFor("materials")!} />
                      </span>
                    )}
                  </dt>
                  <dd>
                    <Chips items={materials} empty="Not stated on the company website." />
                  </dd>
                </div>
                <div className="space-y-2">
                  <dt className="text-sm font-medium text-slate-700">Machines</dt>
                  <dd>
                    <Chips items={machines} empty="Not stated on the company website." />
                  </dd>
                </div>
              </dl>
              {/* Size and capacity: their own <dl>, so each box is a direct <div> child (valid dl). */}
              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border px-4 py-3">
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Size</dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {shop.is_sme ? ce("pub.size.smb") : ce("pub.size.large")}
                    {smeSource?.confidence === "search" && (
                      <div className="text-xs text-muted-foreground">{ce("pub.size.search")}</div>
                    )}
                  </dd>
                </div>
                <div className="rounded-lg border border-border px-4 py-3">
                  <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{ce("pub.capacity")}</dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {ce("pub.capacity.unknown")}
                    <div className="text-xs text-muted-foreground">{ce("pub.capacity.later")}</div>
                  </dd>
                </div>
              </dl>
            </div>
          </Card>
        </div>

        <div className="min-w-0 lg:col-span-5">
          <Card title={ce("pub.certs.title")} sub={ce("pub.certs.sub")}>
            {claimed.length === 0 ? (
              <p className="text-sm text-muted-foreground">{ce("pub.certs.none")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {claimed.map((x) => {
                  const note = x.note && x.note !== SELF_REPORTED ? x.note : null
                  return (
                    <li key={x.type} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                      <div className="font-medium text-foreground">
                        <CertName type={x.type} />
                      </div>
                      <div className="inline-flex items-center rounded-full border border-dashed border-sky-300 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-900">
                        {note && !note.startsWith("Self-reported") ? ce("pub.certs.directory") : ce("pub.certs.selfReported")}
                      </div>
                      {note && <p className="text-xs text-muted-foreground">{glossNote(note)}</p>}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {x.source_url ? <SourceLink url={x.source_url} /> : <span>No source link</span>}
                        {x.verified_at && <span>read {x.verified_at}</span>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {leads.length > 0 && (
              <div className="mt-5 space-y-2 border-t border-border pt-4">
                <div className="text-sm font-medium text-slate-700">{ce("pub.certs.leads")}</div>
                <ul className="space-y-2">
                  {leads.map((x) => (
                    <li key={x.type} className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        <CertName type={x.type} />:
                      </span>{" "}
                      {glossNote(x.note ?? "")} <SourceLink url={x.source_url!} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">{c("net.othersNotListed")}.</p>
            {!story && notStated.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {ce("pub.certs.notStated", { list: notStated.map((x) => certPlain(x.type).first).join(", ") })}
              </p>
            )}
          </Card>
        </div>
      </div>

      <Details summary={c("pub.sources")}>
        <Card title={c("pub.sources")} sub={ce("pub.sources.sub")}>
          <ul className="divide-y divide-border text-sm">
            {provenance.map((p, i) => (
              <li key={`${p.field}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                <span className="font-medium text-foreground">{provenanceField(p.field)}</span>
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-muted-foreground">
                  {CONFIDENCE_LABEL[p.confidence] ?? p.confidence}
                  {p.source_url && <SourceLink url={p.source_url} />}
                </span>
              </li>
            ))}
            {dnd && (
              <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                <span className="font-medium text-foreground">National Defence contracts</span>
                <span className="min-w-0 text-muted-foreground">{dndTip(dnd)}</span>
              </li>
            )}
          </ul>
          {notes.length > 0 && (
            <div className="mt-4 rounded-lg bg-muted px-4 py-3 text-xs text-muted-foreground">
              <span className="font-medium text-slate-700">Notes: </span>
              {notes.join("; ")}.
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            {ce("pub.sources.base")} {shop.label}.
          </p>
        </Card>
      </Details>

      <div className="flex justify-end border-t border-border pt-6">
        {back ? <BackToSuppliers fromSuppliers={back.fromSuppliers} /> : <AutoNextStep />}
      </div>
    </div>
  )
}
