"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import QRCode from "qrcode"
import { Check, Copy, RefreshCw, Wifi } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDemo } from "@/lib/data/store"

type LanInfo = { urls: string[]; port: number }

type State =
  | { kind: "loading" }
  | { kind: "ready"; info: LanInfo; url: string; svg: string }
  | { kind: "none"; info: LanInfo }
  | { kind: "error" }

const STEPS = [
  { title: "Join the same Wi-Fi as this laptop.", body: "Your phone and this laptop need to be on one network." },
  { title: "Scan the code.", body: "Point your phone camera at the square and tap the link that pops up." },
  {
    title: "Pick who you are.",
    body: "Supplier, defence company, training partner or trainee. Each one gets its own screens.",
  },
]

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the textarea fallback
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.setAttribute("readonly", "")
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** Only phone-app routes (/m, /m/...) may be the QR target; anything else falls back to /m. */
function phoneTarget(to: string | null): string {
  if (!to) return "/m"
  if (to === "/m" || to.startsWith("/m/") || to.startsWith("/m?")) return to
  return "/m"
}

/**
 * Adds mode=live to the phone URL (C3-7). An "auto" phone gives up on the engine after one
 * slow first probe and stays on demo data for the whole session, so its answers never reach
 * this laptop. Only when this laptop is itself live through the same-origin /engine proxy
 * (the only engine address a phone can reach); in demo data the phone keeps its fallback.
 */
function withLiveMode(url: string, live: boolean): string {
  if (!live) return url
  try {
    const u = new URL(url)
    u.searchParams.set("mode", "live")
    return u.toString()
  } catch {
    return url
  }
}

/**
 * Desktop panel: steps, a large QR code for the phone app on this laptop's LAN address, and the URL to copy.
 * `?to=/m/shops/syn-012` points the code at that phone screen instead of the role picker.
 */
export function PhoneConnect() {
  const to = phoneTarget(useSearchParams().get("to"))
  const demo = useDemo()
  const live = demo.mode === "live" && demo.apiUrl.startsWith("/")
  const [state, setState] = useState<State>({ kind: "loading" })
  const [pick, setPick] = useState(0)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (index: number) => {
    setState({ kind: "loading" })
    if (!demo.ready) return
    try {
      const res = await fetch("/api/lan", { cache: "no-store" })
      if (!res.ok) throw new Error(String(res.status))
      const info = (await res.json()) as LanInfo
      if (!info.urls?.length) {
        setState({ kind: "none", info })
        return
      }
      const url = withLiveMode(info.urls[Math.min(index, info.urls.length - 1)].replace(/\/m$/, "") + to, live)
      const svg = await QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } })
      setState({ kind: "ready", info, url, svg })
    } catch {
      setState({ kind: "error" })
    }
  }, [to, demo.ready, live])

  useEffect(() => {
    // Fetching on mount is the point of this effect: the LAN address only exists server side.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(pick)
  }, [load, pick])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const onCopy = async (url: string) => {
    const ok = await copyText(url)
    setCopied(ok)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] md:items-start">
      <section aria-labelledby="phone-steps" className="flex flex-col gap-5">
        <h2 id="phone-steps" className="sr-only">
          Steps
        </h2>
        <ol className="flex flex-col gap-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-base font-semibold text-white"
              >
                {i + 1}
              </span>
              <div className="flex flex-col gap-0.5 pt-1">
                <p className="text-lg font-semibold leading-snug text-slate-900">
                  <span className="sr-only">{i + 1}. </span>
                  {s.title}
                </p>
                <p className="text-base leading-relaxed text-slate-600">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="rounded-xl border border-border bg-secondary/60 p-4 text-sm leading-relaxed text-slate-700">
          <p>
            The phone uses this laptop&apos;s live Shieldworks engine through the web server, so anything you do on the phone
            (like taking an offer) shows up here too. Nothing is installed on the phone.
          </p>
        </div>

        <p className="flex items-start gap-2 text-sm leading-relaxed text-slate-600">
          <Wifi aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            If it doesn&apos;t open, both devices must be on the same Wi-Fi; guest networks often block this.
          </span>
        </p>
      </section>

      <section
        aria-labelledby="phone-code"
        className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-background p-5 shadow-sm"
      >
        <h2 id="phone-code" className="self-start text-base font-semibold text-slate-900">
          Scan with your phone camera
        </h2>

        {state.kind === "loading" && (
          <div className="aspect-square w-full max-w-[300px] animate-pulse rounded-lg bg-muted" aria-label="Making the code" role="img" />
        )}

        {state.kind === "ready" && (
          <>
            <div
              data-testid="phone-qr"
              role="img"
              aria-label={`QR code for ${state.url}`}
              className="aspect-square w-full max-w-[300px] rounded-lg bg-white [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: state.svg }}
            />
            <div className="flex w-full flex-col gap-2">
              <label htmlFor="phone-url" className="text-sm text-slate-600">
                Or type this address in the phone&apos;s browser
              </label>
              <div className="flex gap-2">
                <input
                  id="phone-url"
                  readOnly
                  value={state.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-secondary/40 px-2.5 font-mono text-sm text-slate-900 select-all"
                />
                <Button variant="outline" className="h-9" onClick={() => onCopy(state.url)} aria-live="polite">
                  {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            {state.info.urls.length > 1 && (
              <div className="flex w-full flex-col gap-1 text-sm text-slate-600">
                <label htmlFor="phone-net">This laptop is on more than one network. Pick the Wi-Fi one:</label>
                <select
                  id="phone-net"
                  value={pick}
                  onChange={(e) => setPick(Number(e.target.value))}
                  className="h-9 rounded-lg border border-border bg-background px-2 font-mono text-sm"
                >
                  {state.info.urls.map((u, i) => (
                    <option key={u} value={i}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {state.kind === "none" && (
          <div className="flex flex-col gap-3 text-sm leading-relaxed text-slate-700">
            <p>
              This laptop isn&apos;t on a Wi-Fi or wired network a phone can reach right now. Connect to Wi-Fi, then try
              again.
            </p>
            <Button variant="outline" onClick={() => load(pick)}>
              <RefreshCw aria-hidden /> Try again
            </Button>
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex flex-col gap-3 text-sm leading-relaxed text-slate-700">
            <p>Couldn&apos;t find this laptop&apos;s network address.</p>
            <Button variant="outline" onClick={() => load(pick)}>
              <RefreshCw aria-hidden /> Try again
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
