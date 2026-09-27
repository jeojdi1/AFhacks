// Shieldworks app icon for next/og ImageResponse (manifest icons, apple-icon).
// Same mark as BrandMark: a brand-red square with a white shield and two work bars.
// Inline styles only (satori); every multi-child div is display:flex.

export const BRAND_RED = "#b42318"

/**
 * @param size   output edge in px
 * @param inset  fraction of the edge kept clear around the mark (maskable icons
 *               need the mark inside the central 80% safe zone)
 */
export function IconArt({ size, inset = 0.22 }: { size: number; inset?: number }) {
  const mark = Math.round(size * (1 - inset * 2) * 1.1)
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_RED,
      }}
    >
      <svg width={mark} height={mark} viewBox="0 0 24 24">
        <path d="M12 1.8l8.2 3.1v6.3c0 5.2-3.5 9.7-8.2 11-4.7-1.3-8.2-5.8-8.2-11V4.9L12 1.8z" fill="#ffffff" />
        <rect x="8" y="9" width="8" height="1.8" rx="0.9" fill={BRAND_RED} />
        <rect x="8" y="12.4" width="5.5" height="1.8" rx="0.9" fill={BRAND_RED} />
      </svg>
    </div>
  )
}
