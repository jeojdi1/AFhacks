"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { Share, Smartphone, SquarePlus, X } from "lucide-react"
import { t } from "@/lib/app/strings"
import { Button } from "@/components/ui/button"
import { parseMRoute } from "./route"

const OPENED_KEY = "muster.app.v1.openedOffer"
const DISMISSED_KEY = "muster.app.v1.iosHintDismissed"

function get(k: string): string | null {
  try {
    return window.localStorage.getItem(k)
  } catch {
    return null
  }
}

function set(k: string, v: string) {
  try {
    window.localStorage.setItem(k, v)
  } catch {
    /* storage unavailable: the hint may show again next visit */
  }
}

function isIOS(): boolean {
  const ua = navigator.userAgent || ""
  // iPadOS 13+ reports itself as a Mac with touch.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true
  } catch {
    /* old WebKit */
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * "Add Muster to your Home Screen" (iPhone/iPad only). Shows once the user has
 * opened an offer, when not already installed; dismissal is remembered. Never
 * relies on beforeinstallprompt (iOS has none).
 */
export function IosInstallHint() {
  const pathname = usePathname()
  const [show, setShow] = React.useState(false)

  React.useEffect(() => {
    const r = parseMRoute(pathname)
    if (r.kind === "shop" && r.section === "offer") set(OPENED_KEY, "1")
    const eligible = isIOS() && !isStandalone() && get(OPENED_KEY) === "1" && get(DISMISSED_KEY) !== "1"
    queueMicrotask(() => setShow(eligible))
  }, [pathname])

  if (!show) return null

  const dismiss = () => {
    set(DISMISSED_KEY, "1")
    setShow(false)
  }

  const steps = [
    { Icon: Share, label: t("install.step1") },
    { Icon: SquarePlus, label: t("install.step2") },
    { Icon: Smartphone, label: t("install.step3") },
  ]

  return (
    <aside aria-labelledby="ios-install-title" className="mx-4 mb-4 rounded-xl border border-border bg-muted p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 id="ios-install-title" className="text-base font-semibold">
            {t("install.title")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("install.body")}</p>
        </div>
        <Button variant="ghost" size="icon-touch" onClick={dismiss} aria-label={t("install.dismiss")} className="-mt-2 -mr-2">
          <X aria-hidden />
        </Button>
      </div>
      <ol className="mt-3 grid grid-cols-3 gap-2">
        {steps.map(({ Icon, label }, i) => (
          <li key={label} className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-3 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-foreground">
              <Icon className="size-5" aria-hidden />
            </span>
            <span className="text-[13px] leading-tight font-medium">
              <span className="sr-only">Step {i + 1}: </span>
              {label}
            </span>
          </li>
        ))}
      </ol>
      <Button variant="outline" size="touch" onClick={dismiss} className="mt-3 w-full">
        {t("install.dismiss")}
      </Button>
    </aside>
  )
}
