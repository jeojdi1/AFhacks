"use client";

import dynamic from "next/dynamic";

import type { MapLine, MapShop } from "./rows";

const ShopMap = dynamic(() => import("@/components/map/shop-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

export interface ProgramMapProps {
  site: { lat: number; lon: number; label: string };
  shops: MapShop[];
  lines: MapLine[];
  highlight: "all" | "controlled";
}

export function ProgramMap({ site, shops, lines, highlight }: ProgramMapProps) {
  const busy = shops.filter((s) => s.jobs.length > 0).length;
  return (
    <div className="relative isolate h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <ShopMap site={site} shops={shops} lines={lines} highlight={highlight} />
      <MapLegend busyShops={busy} idleShops={shops.length - busy} />
    </div>
  );
}

function MapLegend({ busyShops, idleShops }: { busyShops: number; idleShops: number }) {
  return (
    <div className="pointer-events-none absolute top-3 right-3 z-[500] hidden flex-col gap-1.5 sm:flex rounded-lg border border-slate-200 bg-white/95 px-3 py-2.5 text-xs text-slate-700 shadow-sm backdrop-blur">
      <LegendItem
        swatch={
          <span className="block size-3 rotate-45 rounded-[2px] border-2 border-white bg-[#B42318] ring-1 ring-[#B42318]" />
        }
        text="Northgate site (fictional)"
      />
      <LegendItem
        swatch={<span className="block size-3 rounded-full border border-emerald-600 bg-emerald-500" />}
        text={`Shop with jobs (${busyShops})`}
      />
      <LegendItem
        swatch={<span className="block size-2.5 rounded-full border border-slate-500 bg-slate-400/60" />}
        text={`Shop, no jobs (${idleShops})`}
      />
      <LegendItem swatch={<span className="block h-0.5 w-5 rounded bg-emerald-600" />} text="Job route" />
      <LegendItem
        swatch={
          <span className="block h-0.5 w-5 border-t-[3px] border-dashed border-violet-600" />
        }
        text="Controlled job → CGP shop"
      />
    </div>
  );
}

function LegendItem({ swatch, text }: { swatch: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-5 items-center justify-center">{swatch}</span>
      <span>{text}</span>
    </div>
  );
}
