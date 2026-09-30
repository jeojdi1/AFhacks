// Live-engine client for the shop-side endpoints (docs/app-spec.md §2.3–§2.7).
// The base URL is useDemo().apiUrl; pass it in, or use useAppApi() for bound
// helpers. Fixture mode never calls these: useAppActions() applies actions to
// the localStorage store (muster.app.v1) instead.

"use client"

import * as React from "react"
import { useDemo } from "@/lib/data/store"
import type {
  CapacityRequest,
  CertDeclareRequest,
  CertDeclareResponse,
  DecisionRequest,
  DecisionResponse,
  EventsResponse,
  FundingRequestBody,
  FundingRequestResponse,
  ProgramActionsResponse,
  ShopActionsResponse,
  CapacityResult,
} from "./types"
import { APP_PROGRAM_ID } from "./types"

/** A failed engine call. status 0 + network=true means it never reached the engine. */
export class AppApiError extends Error {
  status: number
  detail: string
  network: boolean
  constructor(status: number, detail: string, network = false) {
    super(detail)
    this.name = "AppApiError"
    this.status = status
    this.detail = detail
    this.network = network
  }
  /** FastAPI's default 404 for a route that does not exist (engine without §6). */
  get routeMissing(): boolean {
    return (this.status === 404 || this.status === 405) && (this.detail === "Not Found" || this.detail === "Method Not Allowed")
  }
}

export function isAppApiError(e: unknown): e is AppApiError {
  return e instanceof AppApiError
}

export interface AppFetchInit {
  method?: "GET" | "POST"
  /** JSON-serialised when given. */
  json?: unknown
  timeoutMs?: number
  signal?: AbortSignal
}

/**
 * fetch against the engine. Parses {"detail"} errors into AppApiError and
 * turns network failures and timeouts into AppApiError(0, …, network=true).
 */
export async function appFetch<T>(apiUrl: string, path: string, init: AppFetchInit = {}): Promise<T> {
  const base = apiUrl.replace(/\/+$/, "")
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 10000)
  const onAbort = () => ctrl.abort()
  init.signal?.addEventListener("abort", onAbort)
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
      headers: init.json !== undefined ? { Accept: "application/json", "Content-Type": "application/json" } : { Accept: "application/json" },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    })
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError"
    throw new AppApiError(0, aborted ? "The engine did not respond in time" : `Cannot reach the engine at ${base}`, true)
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener("abort", onAbort)
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText || "error"}`
    try {
      const j = (await res.json()) as { detail?: unknown }
      if (typeof j?.detail === "string") detail = j.detail
      else if (Array.isArray(j?.detail) && j.detail.length) {
        // FastAPI validation error: [{loc, msg, type}]
        const first = j.detail[0] as { msg?: unknown }
        if (typeof first?.msg === "string") detail = first.msg
      }
    } catch {
      /* non-JSON error body */
    }
    throw new AppApiError(res.status, detail)
  }
  return (await res.json()) as T
}

const enc = encodeURIComponent

/** Paths for the shop-side endpoints (also used as outbox targets). */
export const appPaths = {
  decision: (shopId: string, jobId: string) => `/shops/${enc(shopId)}/offers/${enc(jobId)}/decision`,
  /** The prime's answer to a counter-offer (docs/api.md §9). */
  counterResponse: (shopId: string, jobId: string) => `/shops/${enc(shopId)}/offers/${enc(jobId)}/counter-response`,
  preferences: (shopId: string) => `/shops/${enc(shopId)}/preferences`,
  fundingRequests: (shopId: string) => `/shops/${enc(shopId)}/funding-requests`,
  capacity: (shopId: string) => `/shops/${enc(shopId)}/capacity`,
  certDeclare: (shopId: string, certType: string) => `/shops/${enc(shopId)}/certifications/${enc(certType)}`,
  shopActions: (shopId: string) => `/shops/${enc(shopId)}/actions`,
  programActions: (programId = APP_PROGRAM_ID) => `/programs/${enc(programId)}/actions`,
  events: (since = 0, limit = 100, programId = APP_PROGRAM_ID) =>
    `/programs/${enc(programId)}/events?since=${since}&limit=${limit}`,
}

export const appApi = {
  postDecision: (apiUrl: string, shopId: string, jobId: string, body: DecisionRequest) =>
    appFetch<DecisionResponse>(apiUrl, appPaths.decision(shopId, jobId), { json: body }),
  postFundingRequest: (apiUrl: string, shopId: string, body: FundingRequestBody) =>
    appFetch<FundingRequestResponse>(apiUrl, appPaths.fundingRequests(shopId), { json: body }),
  postCapacity: (apiUrl: string, shopId: string, body: CapacityRequest) =>
    appFetch<CapacityResult>(apiUrl, appPaths.capacity(shopId), { json: body }),
  postCertDeclaration: (apiUrl: string, shopId: string, certType: string, body: CertDeclareRequest) =>
    appFetch<CertDeclareResponse>(apiUrl, appPaths.certDeclare(shopId, certType), { json: body }),
  getShopActions: (apiUrl: string, shopId: string) => appFetch<ShopActionsResponse>(apiUrl, appPaths.shopActions(shopId)),
  getProgramActions: (apiUrl: string, programId = APP_PROGRAM_ID) =>
    appFetch<ProgramActionsResponse>(apiUrl, appPaths.programActions(programId)),
  getEvents: (apiUrl: string, since = 0, limit = 100, programId = APP_PROGRAM_ID) =>
    appFetch<EventsResponse>(apiUrl, appPaths.events(since, limit, programId), { timeoutMs: 5000 }),
}

type Bound<F> = F extends (apiUrl: string, ...rest: infer A) => infer R ? (...rest: A) => R : never

/** appApi bound to the current useDemo().apiUrl. Live mode only. */
export function useAppApi(): { apiUrl: string; fetch: <T>(path: string, init?: AppFetchInit) => Promise<T> } & {
  [K in keyof typeof appApi]: Bound<(typeof appApi)[K]>
} {
  const { apiUrl } = useDemo()
  return React.useMemo(
    () => ({
      apiUrl,
      fetch: <T,>(path: string, init?: AppFetchInit) => appFetch<T>(apiUrl, path, init),
      postDecision: (shopId: string, jobId: string, body: DecisionRequest) => appApi.postDecision(apiUrl, shopId, jobId, body),
      postFundingRequest: (shopId: string, body: FundingRequestBody) => appApi.postFundingRequest(apiUrl, shopId, body),
      postCapacity: (shopId: string, body: CapacityRequest) => appApi.postCapacity(apiUrl, shopId, body),
      postCertDeclaration: (shopId: string, certType: string, body: CertDeclareRequest) =>
        appApi.postCertDeclaration(apiUrl, shopId, certType, body),
      getShopActions: (shopId: string) => appApi.getShopActions(apiUrl, shopId),
      getProgramActions: (programId?: string) => appApi.getProgramActions(apiUrl, programId),
      getEvents: (since?: number, limit?: number, programId?: string) => appApi.getEvents(apiUrl, since, limit, programId),
    }),
    [apiUrl]
  )
}

/** crypto.randomUUID with a fallback for old WebViews and non-secure LAN origins. */
export function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  } catch {
    /* randomUUID needs a secure context; http://192.168.x.x is not one */
  }
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("")
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${((Math.random() * 4) | 8).toString(16)}${hex(3)}-${hex(12)}`
}
