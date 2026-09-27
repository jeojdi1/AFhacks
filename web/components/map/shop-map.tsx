"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

import type { MapLine, MapShop } from "@/components/program/rows";
import { fmtMoney } from "@/lib/format";

export interface ShopMapProps {
  site: { lat: number; lon: number; label: string };
  shops: MapShop[];
  lines: MapLine[];
  /** When "controlled", non-controlled lines/pins are dimmed. */
  highlight?: "all" | "controlled";
  className?: string;
}

// Southwestern Ontario (London → Hamilton, Woolwich → Lake Erie shore)
const SW_ONTARIO: L.LatLngBoundsExpression = [
  [42.75, -81.55],
  [43.75, -79.75],
];

const COLORS = {
  emerald: "#059669",
  emeraldFill: "#10b981",
  violet: "#7c3aed",
  slate: "#94a3b8",
  slateStroke: "#64748b",
  site: "#B42318",
};

const siteIcon = L.divIcon({
  className: "muster-site-icon",
  html: `<div style="width:22px;height:22px;transform:rotate(45deg);background:${COLORS.site};border:3px solid #fff;border-radius:4px;box-shadow:0 0 0 1.5px ${COLORS.site},0 2px 6px rgba(15,23,42,.35)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12],
  tooltipAnchor: [-6, 0],
});

function FitBounds({ pointsKey }: { pointsKey: string }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    for (const pair of pointsKey.split("|")) {
      const [lat, lon] = pair.split(",").map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lon)) pts.push([lat, lon]);
    }
    // Fit tightly to the site + shops; fall back to southwestern Ontario.
    const b =
      pts.length >= 2
        ? L.latLngBounds(pts)
        : L.latLngBounds(SW_ONTARIO as L.LatLngBoundsLiteral);
    map.fitBounds(b.pad(0.06), { paddingTopLeft: [150, 36], paddingBottomRight: [250, 36], maxZoom: 11 });
  }, [map, pointsKey]);
  return null;
}

export default function ShopMap({
  site,
  shops,
  lines,
  highlight = "all",
  className,
}: ShopMapProps) {
  const pointsKey = useMemo(
    () =>
      [[site.lat, site.lon], ...shops.map((s) => [s.lat, s.lon])]
        .map((p) => p.join(","))
        .join("|"),
    [site.lat, site.lon, shops],
  );

  // Draw idle shops first so busy ones sit on top.
  const orderedShops = useMemo(
    () => [...shops].sort((a, b) => a.jobs.length - b.jobs.length),
    [shops],
  );
  const orderedLines = useMemo(
    () => [...lines].sort((a, b) => Number(a.controlled) - Number(b.controlled)),
    [lines],
  );

  return (
    <MapContainer
      bounds={SW_ONTARIO}
      boundsOptions={{ padding: [24, 24] }}
      scrollWheelZoom={false}
      zoomSnap={0.25}
      zoomDelta={0.5}
      className={className}
      style={{ background: "#eef2f6", height: "100%", width: "100%" }}
      attributionControl
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
        maxZoom={18}
      />
      <FitBounds pointsKey={pointsKey} />

      {orderedLines.map((l) => {
        const dim = highlight === "controlled" && !l.controlled;
        return (
          <Polyline
            key={`${l.shopId}-${l.controlled ? "c" : "n"}`}
            positions={[
              [site.lat, site.lon],
              [l.lat, l.lon],
            ]}
            pathOptions={{
              color: l.controlled ? COLORS.violet : COLORS.emerald,
              weight: l.controlled ? 3.5 : Math.min(2 + l.jobCount * 0.4, 4),
              opacity: dim ? 0.12 : l.controlled ? 0.95 : 0.6,
              dashArray: l.controlled ? "6 5" : undefined,
              lineCap: "round",
            }}
          />
        );
      })}

      {orderedShops.map((s) => {
        const busy = s.jobs.length > 0;
        const dim = highlight === "controlled" && s.controlledJobs === 0;
        const stroke = s.controlledJobs > 0 ? COLORS.violet : busy ? COLORS.emerald : COLORS.slateStroke;
        return (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lon]}
            radius={busy ? 7 + Math.min(s.jobs.length, 5) : 5}
            pathOptions={{
              color: stroke,
              weight: s.controlledJobs > 0 ? 3 : 1.5,
              fillColor: busy ? COLORS.emeraldFill : COLORS.slate,
              fillOpacity: dim ? 0.2 : busy ? 0.9 : 0.55,
              opacity: dim ? 0.3 : 1,
            }}
          >
            <Popup>
              <ShopPopup shop={s} />
            </Popup>
          </CircleMarker>
        );
      })}

      <Marker position={[site.lat, site.lon]} icon={siteIcon} zIndexOffset={1000}>
        <Tooltip permanent direction="left" offset={[-8, 0]} className="muster-site-tooltip">
          <span style={{ fontWeight: 600 }}>{site.label}</span>
        </Tooltip>
      </Marker>
    </MapContainer>
  );
}

function ShopPopup({ shop }: { shop: MapShop }) {
  const isSynthetic = shop.source === "synthetic";
  return (
    <div style={{ minWidth: 220, fontFamily: "inherit" }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: "#0f172a", lineHeight: 1.3 }}>
        {shop.name}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
        <span
          style={{
            display: "inline-block",
            fontSize: 11,
            fontWeight: 500,
            padding: "1px 7px",
            borderRadius: 999,
            border: isSynthetic ? "1px solid #cbd5e1" : "1px solid #bae6fd",
            background: isSynthetic ? "#fff" : "#f0f9ff",
            color: isSynthetic ? "#475569" : "#0369a1",
          }}
        >
          {isSynthetic ? "Synthetic" : "Public data — unverified"}
        </span>
        {shop.hasCgp ? (
          <span
            style={{
              display: "inline-block",
              fontSize: 11,
              fontWeight: 500,
              padding: "1px 7px",
              borderRadius: 999,
              background: "#f5f3ff",
              color: "#6d28d9",
              border: "1px solid #ddd6fe",
            }}
          >
            CGP registered
          </span>
        ) : null}
        <span style={{ fontSize: 12, color: "#64748b" }}>{shop.city}</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: "#334155" }}>
        {shop.jobs.length > 0 ? (
          <>
            <strong style={{ color: "#047857" }}>
              {shop.jobs.length} job{shop.jobs.length === 1 ? "" : "s"} assigned
            </strong>{" "}
            · {fmtMoney(shop.valueCad, { compact: true })}
            <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {shop.jobs.map((j) => (
                <span
                  key={j.jobId}
                  style={{
                    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                    fontSize: 11,
                    padding: "0 5px",
                    borderRadius: 4,
                    background: j.controlled ? "#f5f3ff" : "#f1f5f9",
                    color: j.controlled ? "#6d28d9" : "#334155",
                  }}
                  title={j.controlled ? "Controlled · CGP only" : undefined}
                >
                  {j.partNo}
                </span>
              ))}
            </div>
            {shop.controlledJobs > 0 ? (
              <div style={{ marginTop: 6, fontSize: 12, color: "#6d28d9" }}>
                {shop.controlledJobs} controlled job{shop.controlledJobs === 1 ? "" : "s"} — CGP-registered shop
              </div>
            ) : null}
          </>
        ) : (
          <span style={{ color: "#64748b" }}>No jobs assigned in this package</span>
        )}
      </div>
    </div>
  );
}
