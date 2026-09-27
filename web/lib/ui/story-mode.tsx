"use client"

// Story mode (docs/ux-simplification.md §6): one switch that turns every screen into
// narrative + big numbers. Default ON. ?story=0|1 overrides and is persisted in
// localStorage["muster.ui.story"] (every access guarded). Sets data-story="on|off" on <html>.
// Keyboard: S toggles (ignored while typing or with modifier keys).

import * as React from "react"
import { stripBase } from "@/lib/base-path"

const STORAGE_KEY = "muster.ui.story"

function readStored(): boolean | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === "1" ? true : v === "0" ? false : null
  } catch {
    return null
  }
}

function writeStored(v: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0")
  } catch {
    /* storage unavailable: the choice lasts until reload */
  }
}

function readQuery(key: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(key)
  } catch {
    return null
  }
}

// Module-level store so every consumer agrees and the server snapshot is stable.
let current: boolean | null = null
const listeners = new Set<() => void>()

function init(): boolean {
  if (current !== null) return current
  const q = readQuery("story")
  if (q === "0" || q === "1") {
    current = q === "1"
    writeStored(current)
  } else {
    current = readStored() ?? true
  }
  return current
}

function set(v: boolean) {
  init()
  if (current === v) return
  current = v
  writeStored(v)
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

const getSnapshot = () => init()
const getServerSnapshot = () => true

interface StoryModeValue {
  story: boolean
  setStory(v: boolean): void
}

const StoryModeContext = React.createContext<StoryModeValue | null>(null)

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
}

export function StoryModeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const story = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  React.useEffect(() => {
    try {
      document.documentElement.dataset.story = story ? "on" : "off"
    } catch {
      /* no DOM */
    }
  }, [story])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "s" && e.key !== "S") return
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (isTyping(e.target) || isTyping(document.activeElement)) return
      // Only the desktop pages have a Story mode switch; /m ignores it.
      const path = stripBase(window.location.pathname)
      if (path === "/m" || path.startsWith("/m/")) return
      e.preventDefault()
      set(!init())
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Keep other tabs in sync.
  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      const v = readStored()
      if (v !== null) set(v)
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const value = React.useMemo<StoryModeValue>(() => ({ story, setStory: set }), [story])
  return <StoryModeContext.Provider value={value}>{children}</StoryModeContext.Provider>
}

/** Story mode state. Outside the provider it reports Story mode on and ignores setStory. */
export function useStoryMode(): StoryModeValue {
  return React.useContext(StoryModeContext) ?? { story: true, setStory: () => {} }
}

const noopSubscribe = () => () => {}

/** True when the page was opened with ?capture=1 (screenshots/video: render final states, no animation). */
export function useCaptureMode(): boolean {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => readQuery("capture") === "1",
    () => false
  )
}
