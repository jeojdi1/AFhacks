"use client"

// useVault(shopId): the shop's "Paperwork on file" (docs/api.md §6.2).
// Live: GET/POST /shops/{id}/vault on useDemo().apiUrl. An engine without the vault
// routes (FastAPI "Not Found") falls back to the local build, like the award package.
// Demo data: seeds from data/processed/vault_synthetic.json plus this device's marks.

import * as React from "react"
import { useDemo } from "@/lib/data/store"
import { appFetch, isAppApiError } from "@/lib/app/api"
import { appToday } from "@/lib/app/today"
import { shopInfo } from "@/lib/app/actions-store"
import { buildLocalVault, markLocal, readVaultRaw, subscribeVault } from "./local"
import type { Vault, VaultState } from "./types"

const enc = encodeURIComponent
export const vaultPaths = {
  vault: (shopId: string) => `/shops/${enc(shopId)}/vault`,
  item: (shopId: string, key: string) => `/shops/${enc(shopId)}/vault/${enc(key)}`,
}

const serverSnapshot = () => ""

/** This device's vault marks as a snapshot string (re-renders on change, across tabs too). */
export function useLocalVaultRaw(): string {
  return React.useSyncExternalStore(subscribeVault, readVaultRaw, serverSnapshot)
}

/** The locally built vault for a shop (demo data), or null on the server. */
export function useLocalVault(shopId: string): Vault {
  const raw = useLocalVaultRaw()
  const [today] = React.useState(() => appToday())
  const info = shopInfo(shopId)
  return React.useMemo(
    () => buildLocalVault(shopId, today, raw, info?.name ?? null, info?.source ?? null),
    [shopId, today, raw, info?.name, info?.source]
  )
}

export function useVault(shopId: string): VaultState {
  const { mode, apiUrl, ready } = useDemo()
  const local = useLocalVault(shopId)
  const [remote, setRemote] = React.useState<Vault | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [routeMissing, setRouteMissing] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const reqRef = React.useRef(0)
  const live = mode === "live" && !routeMissing

  const load = React.useCallback(async () => {
    if (mode !== "live") return
    const id = ++reqRef.current
    try {
      const v = await appFetch<Vault>(apiUrl, vaultPaths.vault(shopId))
      if (id !== reqRef.current) return
      setRemote(v)
      setError(null)
    } catch (e) {
      if (id !== reqRef.current) return
      if (isAppApiError(e) && e.routeMissing) setRouteMissing(true)
      else setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (id === reqRef.current) setLoading(false)
    }
  }, [mode, apiUrl, shopId])

  React.useEffect(() => {
    if (!ready || mode !== "live" || routeMissing) return
    let cancelled = false
    const id = window.setTimeout(() => {
      if (!cancelled) void load()
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [ready, mode, routeMissing, load])

  const mark = React.useCallback(
    async (key: string, opts: { onFile?: boolean; expiresAt?: string | null } = {}) => {
      const onFile = opts.onFile ?? true
      setBusy(true)
      try {
        if (live) {
          const body: Record<string, unknown> = { on_file: onFile }
          if (onFile && opts.expiresAt) body.expires_at = opts.expiresAt
          const r = await appFetch<{ vault: Vault }>(apiUrl, vaultPaths.item(shopId, key), { json: body })
          setRemote(r.vault)
          setError(null)
        } else {
          markLocal(shopId, key, onFile, onFile ? (opts.expiresAt ?? null) : null)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        throw e
      } finally {
        setBusy(false)
      }
    },
    [live, apiUrl, shopId]
  )

  const refresh = React.useCallback(async () => {
    if (live) await load()
  }, [live, load])

  if (live) {
    return { vault: remote, source: "engine", loading: !ready || (loading && !remote && !error), error, busy, mark, refresh }
  }
  return { vault: local, source: "local", loading: false, error: null, busy, mark, refresh }
}
