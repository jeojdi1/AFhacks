"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(cb: () => void) {
  const m = window.matchMedia(REDUCED_QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

/** True when the viewer asked the OS for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

export function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

/**
 * Counts from `from` to `to` over `duration` ms (after `delay` ms) with
 * requestAnimationFrame. When `enabled` is false it returns `to` directly.
 */
export function useCountUp(
  from: number,
  to: number,
  { duration = 1400, delay = 0, enabled = true }: { duration?: number; delay?: number; enabled?: boolean } = {},
): number {
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now + delay;
      const p = Math.min(1, Math.max(0, (now - start) / duration));
      setValue(from + (to - from) * easeOutQuart(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, duration, delay, enabled]);

  return enabled ? value : to;
}

/**
 * Arms CSS transitions (bars grow, cards flip) for one animation run.
 * Returns false for `delay` ms after `runKey` becomes non-null, then true.
 * A null `runKey` means "no animation": it returns true (final state).
 * A new `runKey` starts a new run.
 */
export function useArmed(runKey: string | null, delay: number): boolean {
  const [armedKey, setArmedKey] = useState<string | null>(null);
  useEffect(() => {
    if (runKey === null) return;
    const id = window.setTimeout(() => setArmedKey(runKey), delay);
    return () => window.clearTimeout(id);
  }, [runKey, delay]);
  return runKey === null ? true : armedKey === runKey;
}
