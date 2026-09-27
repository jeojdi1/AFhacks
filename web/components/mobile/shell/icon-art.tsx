// Muster app icon for next/og ImageResponse (manifest icons, apple-icon).
// Same mark as BrandMark: a brand-red square with three stacked white bars.
// Inline styles only (satori); every multi-child div is display:flex.

export const BRAND_RED = "#b42318"

/**
 * @param size   output edge in px
 * @param inset  fraction of the edge kept clear around the mark (maskable icons
 *               need the mark inside the central 80% safe zone)
 */
export function IconArt({ size, inset = 0.22 }: { size: number; inset?: number }) {
  const pad = Math.round(size * inset)
  const bar = Math.max(4, Math.round(size * 0.085))
  const gap = Math.round(bar * 0.9)
  const radius = Math.round(bar / 2)
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        gap,
        background: BRAND_RED,
        paddingLeft: pad,
        paddingRight: pad,
      }}
    >
      <div style={{ width: "100%", height: bar, borderRadius: radius, background: "#ffffff" }} />
      <div style={{ width: "75%", height: bar, borderRadius: radius, background: "rgba(255,255,255,0.88)" }} />
      <div style={{ width: "50%", height: bar, borderRadius: radius, background: "rgba(255,255,255,0.74)" }} />
    </div>
  )
}
