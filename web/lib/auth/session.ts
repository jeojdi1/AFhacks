"use client"

// Demo session: which fictional account this browser is "signed in" as.
// Stored in localStorage under `muster.session` as {role, accountId, since}.
// Every read and write is wrapped in try/catch: private windows and blocked
// storage fall back to an in-memory session for this tab. There is no real
// authentication and nothing leaves the browser.

import * as React from "react"
import { accountFor, isRole, type DemoAccount, type Role } from "./accounts"

export const SESSION_KEY = "muster.session"
const CHANGE_EVENT = "muster:session-change"

export interface DemoSession {
  role: Role
  accountId: string
  /** ISO time of sign-in. */
  since: string
}

/** Used when localStorage is unavailable, so sign-in still works for this tab. */
let memory: string | null = null

function readRaw(): string | null {
  try {
    const v = window.localStorage.getItem(SESSION_KEY)
    return v ?? memory
  } catch {
    return memory
  }
}

function writeRaw(v: string | null) {
  memory = v
  try {
    if (v === null) window.localStorage.removeItem(SESSION_KEY)
    else window.localStorage.setItem(SESSION_KEY, v)
  } catch {
    /* storage blocked: the in-memory copy lasts until reload */
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    /* no window */
  }
}

function parse(raw: string | null): DemoSession | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<DemoSession>
    if (!isRole(v.role)) return null
    const acc = accountFor(v.role)
    return {
      role: v.role,
      accountId: typeof v.accountId === "string" && v.accountId ? v.accountId : (acc?.accountId ?? v.role),
      since: typeof v.since === "string" ? v.since : new Date(0).toISOString(),
    }
  } catch {
    return null
  }
}

// useSyncExternalStore needs a stable snapshot per stored value.
let cachedRaw: string | null | undefined
let cachedSession: DemoSession | null = null

function getSnapshot(): DemoSession | null {
  const raw = readRaw()
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSession = parse(raw)
  }
  return cachedSession
}

function getServerSnapshot(): DemoSession | null {
  return null
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === SESSION_KEY) onChange()
  }
  window.addEventListener("storage", onStorage)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onStorage)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

/** Sign in as one of the demo accounts. Returns the account (for its home route). */
export function signIn(role: Role): DemoAccount | null {
  const acc = accountFor(role)
  if (!acc) return null
  const s: DemoSession = { role, accountId: acc.accountId, since: new Date().toISOString() }
  writeRaw(JSON.stringify(s))
  return acc
}

export function signOut(): void {
  writeRaw(null)
}

export interface UseSession {
  session: DemoSession | null
  account: DemoAccount | null
  /** False during server render and the first client render (session unknown yet). */
  hydrated: boolean
  signIn: typeof signIn
  signOut: typeof signOut
}

const noopSubscribe = () => () => {}

export function useSession(): UseSession {
  const session = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const hydrated = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  )
  return { session, account: accountFor(session?.role), hydrated, signIn, signOut }
}
