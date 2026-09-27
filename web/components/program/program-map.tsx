"use client";

import dynamic from "next/dynamic";

import { cb } from "@/lib/ui/copy-b";

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
  routed: boolean;
}

export function ProgramMap({ site, shops, lines, highlight, routed }: ProgramMapProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative isolate h-[400px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-[440px]">
        <ShopMap site={site} shops={shops} lines={lines} highlight={highlight} />
      </div>
      <MapLegend routed={routed} />
    </div>
  );
}

/** The legend in words, under the map (§5.2); colour, shape and text always together. */
function MapLegend({ routed }: { routed: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-slate-700" aria-label="Map legend">
      <LegendItem
        swatch={
          <span className="block size-3 rotate-45 rounded-[2px] border-2 border-white bg-[#B42318] ring-1 ring-[#B42318]" />
        }
        text={cb("program.map.legend.site")}
      />
      {routed ? (
        <>
          <LegendItem swatch={<span className="block h-0.5 w-5 rounded bg-emerald-600" />} text={cb("program.map.legend.matched")} />
          <LegendItem
            swatch={<span className="block h-0.5 w-5 border-t-[3px] border-dashed border-violet-600" />}
            text={cb("program.map.legend.controlled")}
          />
          <LegendItem
            swatch={<span className="block size-3 rounded-full border border-emerald-600 bg-emerald-500" />}
            text={cb("program.map.legend.shop")}
          />
        </>
      ) : null}
      <LegendItem
        swatch={<span className="block size-2.5 rounded-full border border-slate-500 bg-slate-400/60" />}
        text={cb("program.map.legend.idle")}
      />
    </ul>
  );
}

function LegendItem({ swatch, text }: { swatch: React.ReactNode; text: string }) {
  const [head, ...rest] = text.split(":");
  return (
    <li className="flex items-center gap-2">
      <span className="flex w-5 items-center justify-center" aria-hidden>
        {swatch}
      </span>
      <span>
        {rest.length ? (
          <>
            <span className="font-medium text-slate-900">{head}:</span>
            {rest.join(":")}
          </>
        ) : (
          text
        )}
      </span>
    </li>
  );
}
