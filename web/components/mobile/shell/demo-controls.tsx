"use client"

// "Demo version" block on the role picker (/m):
//   (a) Live (shared with the laptop) vs Demo data (this phone only). Switching
//       reloads with ?mode=live|fixtures; the demo store keeps that override for
//       the session. It never calls setMode("live"), which would reset the shared engine.
//   (b) Fill with demo activity → POST /demo/seed?scenario=populated (live only), behind a
//       confirm, because it resets what every screen shows (including a funded TP-01).
//   (c) Simulate shops responding → POST /demo/simulate/tick every 8 s (live only).
//   (d) Demo data only: "Send the example offers" replays the parts list and the match on this
//       phone (fixture store → routed), so a shop sees offers with no laptop or engine.
//
// Everything above sits inside <PresenterTools>, a disclosure that is closed by default and
// opens by itself only with ?presenter=1 (remembered for this tab), so a phone that scanned the
// QR code cannot reset the shared engine by accident.

import * as React from "react"
import { toast } from "sonner"
import { AlertDialog } from "@base-ui/react/alert-dialog"
import { Check, ChevronDown, CircleCheck, Loader2, RotateCcw, Send, Smartphone, Sparkles, Wifi, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDemo } from "@/lib/data/store"
import { AppApiError } from "@/lib/app/api"
import { seedDemo, setSimulating, useSimulating } from "@/lib/app/demo-sim"
import { extendStrings, t } from "@/lib/app/strings"
import { Button } from "@/components/ui/button"
import { STATIC_SITE, withBase } from "@/lib/base-path"

extendStrings("en", {
  "demo.title": "Demo version",
  "demo.subtitle": "Everything here is example data: a fictional defence company and synthetic shops.",
  "demo.mode.label": "Where the data comes from",
  "demo.mode.live": "Live (shared with the laptop)",
  "demo.mode.liveBody": "Answers go to the Shieldworks engine, so the laptop sees them within seconds.",
  "demo.mode.fixtures": "Demo data (this phone only)",
  "demo.mode.fixturesBody": "Built-in example data. No engine needed; nothing leaves this phone.",
  "demo.mode.current": "In use",
  "demo.seed": "Fill with demo activity",
  "demo.seedBody": "Loads a busy example: offers sent, some accepted, a decline, a question and capacity updates. Replaces what is on the shared engine.",
  "demo.seeding": "Filling…",
  "demo.seeded": "Demo activity loaded",
  "demo.seededBody": "Reloading so every screen shows it.",
  "demo.seedFailed": "Could not fill the demo",
  "demo.seedFailedBody": "The engine didn't accept it. Nothing changed; try again in a moment.",
  "demo.confirm.title": "Fill with demo activity",
  "demo.confirm.body": "Start the shared demo over with example activity? This resets what every screen shows, including anything Northgate funded.",
  "demo.confirm.cancel": "Cancel",
  "demo.confirm.ok": "Reset for everyone",
  "presenter.title": "Presenter tools",
  "presenter.body": "Demo controls for whoever runs the demo. They change what every screen shows.",
  "demo.updateEngine": "Update the engine",
  "demo.updateEngineBody": "This engine can't load demo activity yet. Restart it with the latest code.",
  "demo.sim": "Simulate shops responding",
  "demo.simBody": "Demo shops accept, decline and ask questions on their own, one every 8 seconds.",
  "demo.fixturesNote": "Filling with shop activity and simulating shops need the shared engine. Switch to Live to use them.",
  "demo.local": "Send the example offers",
  "demo.localBody": "Matches Northgate's parts list to shops on this phone, so the shop screens show offers. Nothing leaves this phone.",
  "demo.localBusy": "Sending…",
  "demo.localDone": "Example offers sent",
  "demo.localDoneBody": "Northgate's parts list is matched to shops on this phone. Pick a role above to see it.",
})

/**
 * A full page load, on purpose: the demo store reads ?mode= once when it mounts
 * (then keeps it in sessionStorage), so a client-side router.push would not switch.
 */
function switchMode(m: "live" | "fixtures") {
  let next = withBase(`/m?mode=${m}`)
  try {
    const u = new URL(window.location.href)
    u.searchParams.set("mode", m)
    u.searchParams.delete("src")
    next = u.href
  } catch {
    /* keep the plain path */
  }
  window.location.href = next
}

function ModeOption({
  selected,
  title,
  body,
  Icon,
  onSelect,
  disabled,
}: {
  selected: boolean
  title: string
  body: string
  Icon: typeof Wifi
  onSelect: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={selected ? undefined : onSelect}
      className={cn(
        "flex min-h-16 w-full items-start gap-3 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
        selected ? "border-brand bg-brand/5" : "border-border bg-background hover:bg-muted active:bg-muted"
      )}
    >
      <span
        aria-hidden
        className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2", selected ? "border-brand bg-brand text-white" : "border-muted-foreground/50")}
      >
        {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-base leading-snug font-semibold">{title}</span>
          {selected ? <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">{t("demo.mode.current")}</span> : null}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{body}</span>
      </span>
    </button>
  )
}

/** Demo data mode: replay upload + match in the fixture store on this phone (no engine). */
function LocalRouteAction() {
  const demo = useDemo()
  const [busy, setBusy] = React.useState(false)
  const stageRef = React.useRef(demo.stage)
  React.useEffect(() => {
    stageRef.current = demo.stage
  }, [demo.stage])
  const done = demo.stage === "routed" || demo.stage === "funded"

  const run = async () => {
    setBusy(true)
    const wait = async (ok: () => boolean) => {
      for (let i = 0; i < 40 && !ok(); i++) await new Promise((r) => setTimeout(r, 50))
    }
    try {
      if (stageRef.current === "empty") {
        await demo.uploadParts()
        await wait(() => stageRef.current !== "empty")
        if (stageRef.current === "empty") return
      }
      await demo.route()
      await wait(() => stageRef.current === "routed" || stageRef.current === "funded")
      toast.success(t("demo.localDone"))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-assigned/25 bg-assigned-soft px-3 py-2.5 text-sm leading-snug text-assigned" data-testid="demo-local-done">
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("demo.localDoneBody")}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Button size="touch-lg" className="w-full" disabled={busy || !!demo.busy} onClick={() => void run()} data-testid="demo-local-route">
        {busy ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Send className="size-5" aria-hidden />}
        {busy ? t("demo.localBusy") : t("demo.local")}
      </Button>
      <p className="text-sm leading-snug text-muted-foreground">{t("demo.localBody")}</p>
    </div>
  )
}

/** "Start the shared demo over?" confirm for Fill with demo activity. */
function SeedConfirm({ open, onOpenChange, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; onConfirm: () => void }) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(o) => onOpenChange(o)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/30 supports-backdrop-filter:backdrop-blur-xs" />
        <AlertDialog.Popup
          data-testid="demo-seed-confirm"
          className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-2xl bg-popover p-5 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none"
        >
          <AlertDialog.Title className="text-lg leading-snug font-semibold">{t("demo.confirm.title")}</AlertDialog.Title>
          <AlertDialog.Description className="text-base leading-snug text-muted-foreground">{t("demo.confirm.body")}</AlertDialog.Description>
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Close render={<Button variant="outline" size="touch" className="w-full sm:w-auto" />}>{t("demo.confirm.cancel")}</AlertDialog.Close>
            <Button variant="destructive" size="touch" className="w-full sm:w-auto" onClick={onConfirm} data-testid="demo-seed-confirm-ok">
              {t("demo.confirm.ok")}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

/** sessionStorage (this tab): "1" once the page was opened with ?presenter=1. */
const PRESENTER_KEY = "muster.app.v1.presenter"

function readPresenter(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get("presenter")
    if (q === "1") {
      try {
        window.sessionStorage.setItem(PRESENTER_KEY, "1")
      } catch {
        /* storage blocked: open for this page only */
      }
      return true
    }
    if (q === "0") {
      try {
        window.sessionStorage.removeItem(PRESENTER_KEY)
      } catch {
        /* storage blocked */
      }
      return false
    }
    return window.sessionStorage.getItem(PRESENTER_KEY) === "1"
  } catch {
    return false
  }
}

/**
 * "Presenter tools": a disclosure around the demo controls and the other shops' list.
 * Closed by default; open on load only with ?presenter=1 (remembered for this tab).
 */
export function PresenterTools({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const id = React.useId()
  React.useEffect(() => {
    if (readPresenter()) queueMicrotask(() => setOpen(true))
  }, [])
  return (
    <section className="flex flex-col gap-3" data-testid="presenter-tools">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-background px-4 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        data-testid="presenter-toggle"
      >
        <Wrench className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-base leading-snug font-semibold">{t("presenter.title")}</span>
          <span className="block text-sm leading-snug text-muted-foreground">{t("presenter.body")}</span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn("size-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div id={id} className="flex flex-col gap-6">
          {children}
        </div>
      ) : null}
    </section>
  )
}

export function DemoControls() {
  const { mode, ready, apiUrl } = useDemo()
  const simulating = useSimulating()
  const [seeding, setSeeding] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const live = ready && mode === "live"

  const seed = async () => {
    setSeeding(true)
    try {
      await seedDemo(apiUrl)
      toast.success(t("demo.seeded"), { description: t("demo.seededBody") })
      window.setTimeout(() => window.location.reload(), 700)
    } catch (e) {
      setSeeding(false)
      if (e instanceof AppApiError && (e.routeMissing || e.status === 404 || e.status === 405)) {
        toast.error(t("demo.updateEngine"), { description: t("demo.updateEngineBody") })
      } else {
        // Never show the engine's detail from demo endpoints (it names API routes).
        toast.error(t("demo.seedFailed"), { description: t("demo.seedFailedBody") })
      }
    }
  }

  return (
    <section aria-labelledby="demo-title" className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-muted/50 p-4" data-testid="demo-controls">
      <div>
        <h2 id="demo-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Sparkles className="size-5 text-muted-foreground" aria-hidden />
          {t("demo.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("demo.subtitle")}</p>
      </div>

      <div role="radiogroup" aria-label={t("demo.mode.label")} className="flex flex-col gap-2">
        {/* The static GitHub Pages build has no engine: demo data only. */}
        {STATIC_SITE ? null : (
          <ModeOption
            selected={live}
            disabled={!ready}
            title={t("demo.mode.live")}
            body={t("demo.mode.liveBody")}
            Icon={Wifi}
            onSelect={() => switchMode("live")}
          />
        )}
        <ModeOption
          selected={ready && mode === "fixtures"}
          disabled={!ready}
          title={t("demo.mode.fixtures")}
          body={t("demo.mode.fixturesBody")}
          Icon={Smartphone}
          onSelect={() => switchMode("fixtures")}
        />
      </div>

      {!ready ? null : live ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Button variant="outline" size="touch" className="w-full" disabled={seeding} onClick={() => setConfirmOpen(true)} data-testid="demo-seed">
              {seeding ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden /> : <RotateCcw className="size-5" aria-hidden />}
              {seeding ? t("demo.seeding") : t("demo.seed")}
            </Button>
            <p className="text-sm leading-snug text-muted-foreground">{t("demo.seedBody")}</p>
            <SeedConfirm
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              onConfirm={() => {
                setConfirmOpen(false)
                void seed()
              }}
            />
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={simulating}
            onClick={() => setSimulating(!simulating)}
            data-testid="demo-simulate"
            className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-base leading-snug font-semibold">{t("demo.sim")}</span>
              <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{t("demo.simBody")}</span>
            </span>
            <span
              aria-hidden
              className={cn(
                "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none",
                simulating ? "bg-brand" : "bg-slate-300 dark:bg-slate-600"
              )}
            >
              <span
                className={cn(
                  "absolute size-6 rounded-full bg-white shadow transition-transform motion-reduce:transition-none",
                  simulating ? "translate-x-[22px]" : "translate-x-0.5"
                )}
              />
            </span>
            <span className="sr-only">{simulating ? "On" : "Off"}</span>
          </button>
        </>
      ) : (
        <>
          <LocalRouteAction />
          {STATIC_SITE ? null : (
            <p className="text-sm leading-snug text-muted-foreground" data-testid="demo-fixtures-note">
              {t("demo.fixturesNote")}
            </p>
          )}
        </>
      )}
    </section>
  )
}
