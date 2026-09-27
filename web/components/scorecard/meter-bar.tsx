import { cn } from "@/lib/utils";
import { fmtPct } from "@/lib/format";

import { SC } from "./tokens";

export interface MeterSegment {
  /** Fraction of the full track, in [0, 1]. */
  value: number;
  color: string;
  label: string;
}

/**
 * A wide horizontal meter. Segments stack left-to-right with a 2px surface gap.
 * The value label rides above the end of the fill; ticks sit under the track.
 */
export function MeterBar({
  segments,
  valueLabel,
  ticks = [0, 0.25, 0.5, 0.75, 1],
  tickFormat = (t: number) => fmtPct(t, 0),
  marker,
  height = "h-4",
  className,
  ariaLabel,
}: {
  segments: MeterSegment[];
  valueLabel?: string;
  ticks?: number[];
  tickFormat?: (t: number) => string;
  marker?: { at: number; label: string };
  height?: string;
  className?: string;
  ariaLabel: string;
}) {
  const clamped = segments
    .map((s) => ({ ...s, value: Math.max(0, s.value) }))
    .filter((s) => s.value > 0);
  const total = Math.min(
    1,
    clamped.reduce((acc, s) => acc + s.value, 0),
  );
  // Keep the label inside the card: anchor left near 0, right near 1.
  const labelPos = Math.min(Math.max(total, 0.04), 0.96);

  return (
    <div className={cn("w-full", className)}>
      {valueLabel ? (
        <div className="relative mb-1.5 h-5">
          <span
            className="absolute -translate-x-1/2 text-sm font-semibold text-slate-900 tabular-nums whitespace-nowrap"
            style={{ left: `${labelPos * 100}%` }}
          >
            {valueLabel}
          </span>
        </div>
      ) : null}
      <div
        role="meter"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(total * 1000) / 10}
        className={cn("relative flex w-full overflow-hidden rounded-full", height)}
        style={{ backgroundColor: SC.inkSoft }}
      >
        {clamped.map((s, i) => {
          const w = Math.min(s.value, 1) * 100;
          return (
            <div
              key={s.label}
              title={s.label}
              className={cn(
                "h-full transition-[width] duration-700 ease-out",
                i === 0 ? "rounded-l-full" : "",
                i === clamped.length - 1 ? "rounded-r-full" : "",
              )}
              style={{
                width: `${w}%`,
                minWidth: 4,
                backgroundColor: s.color,
                // 2px surface gap between touching segments
                boxShadow: i > 0 ? "inset 2px 0 0 0 #fff" : undefined,
              }}
            />
          );
        })}
        {marker ? (
          <div
            className="absolute inset-y-0 w-0.5 bg-slate-900/70"
            style={{ left: `calc(${Math.min(marker.at, 1) * 100}% - 1px)` }}
            aria-hidden
          />
        ) : null}
      </div>
      {ticks.length > 0 ? (
        <div className="relative mt-1.5 h-4 text-xs text-slate-500 tabular-nums">
          {ticks.map((t) => (
            <span
              key={t}
              className={cn(
                "absolute whitespace-nowrap",
                t === 0 ? "" : t === 1 ? "-translate-x-full" : "-translate-x-1/2",
              )}
              style={{ left: `${t * 100}%` }}
            >
              {tickFormat(t)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MeterLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-sm"
            style={{ backgroundColor: it.color }}
            aria-hidden
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
