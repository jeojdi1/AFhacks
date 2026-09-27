"use client"

import * as React from "react"
import Link from "next/link"
import { Check, Lock, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DEMO_FACTS, SECURITY_LAYERS } from "@/lib/security/layers"

const KEY = "muster.demoNotice.v1"

/**
 * "This is a demo" notice with the production security layer, shown once per browser session
 * on the first page opened (desktop and phone). `?notice=1` shows it again, `?notice=0` skips it.
 * Skipped under automation (navigator.webdriver) so scripted checks never meet a modal.
 */
export function DemoNotice() {
  const [open, setOpen] = React.useState(false)
  // Focus the top (the "Demo only" heading block) so the dialog opens scrolled to its title.
  const topRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("notice")
    if (q === "0") return
    let seen = false
    try {
      seen = window.sessionStorage.getItem(KEY) === "1"
    } catch {
      /* storage blocked: show it */
    }
    if (q === "1" || (!seen && !navigator.webdriver)) {
      const id = window.setTimeout(() => setOpen(true), 0)
      return () => window.clearTimeout(id)
    }
  }, [])

  const close = React.useCallback(() => {
    try {
      window.sessionStorage.setItem(KEY, "1")
    } catch {
      /* ignore */
    }
    setOpen(false)
  }, [])

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent
        showCloseButton={false}
        initialFocus={topRef}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[680px]"
        data-demo-notice
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            ref={topRef}
            tabIndex={-1}
            className="flex flex-col gap-2.5 border-b border-border bg-secondary/60 px-5 pt-5 pb-4 outline-none sm:px-7 sm:pt-5"
          >
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-amber-900 uppercase">
              Demo only
            </span>
            <DialogTitle className="text-[1.5rem] leading-tight font-semibold tracking-tight sm:text-[1.75rem]">
              This is a demo of Shieldworks
            </DialogTitle>
            <DialogDescription className="text-[15px] leading-relaxed text-slate-700">
              Everything you&apos;re about to see is made up for demonstration. No real contracts, drawings or personal
              information are in it.
            </DialogDescription>
            <ul className="flex flex-col gap-1 text-[14px] leading-snug text-slate-700">
              {DEMO_FACTS.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-slate-400" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2.5 px-5 py-4 sm:px-7">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-brand" aria-hidden />
              <h3 className="text-base font-semibold">In production, all of it sits behind a full security layer</h3>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {SECURITY_LAYERS.map((l) => (
                <li key={l.key} className="flex gap-2.5 rounded-lg border border-border bg-card px-3 py-2">
                  {l.activeNow ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden />
                  ) : (
                    <Lock className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="block text-[14px] leading-snug font-medium">{l.title}</span>
                    <span
                      className={
                        l.activeNow
                          ? "text-[12.5px] font-medium text-emerald-800"
                          : "text-[12.5px] text-muted-foreground"
                      }
                    >
                      {l.activeNow ? "Enforced in this demo" : "Planned · not active in demo"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-1 border-t border-border bg-popover px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <Link
            href="/security"
            onClick={close}
            className="inline-flex min-h-11 items-center text-[14px] font-medium text-foreground underline underline-offset-4"
          >
            Read the security plan
          </Link>
          <Button size="lg" className="h-11 px-5 text-[0.95rem]" onClick={close} data-testid="demo-notice-enter">
            Enter the demo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
