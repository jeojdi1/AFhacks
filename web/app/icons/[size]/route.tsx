import { ImageResponse } from "next/og"
import { IconArt } from "@/components/mobile/shell/icon-art"

// Manifest icons, rendered once at build time: /icons/192, /icons/512, /icons/maskable-512.
export const dynamic = "force-static"
export const dynamicParams = false

const SIZES: Record<string, { px: number; inset: number }> = {
  "192": { px: 192, inset: 0.22 },
  "512": { px: 512, inset: 0.22 },
  // Maskable: keep the mark inside the central 80% safe zone.
  "maskable-512": { px: 512, inset: 0.3 },
}

export function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }))
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size } = await ctx.params
  const spec = SIZES[size]
  if (!spec) return new Response("Not found", { status: 404 })
  return new ImageResponse(<IconArt size={spec.px} inset={spec.inset} />, { width: spec.px, height: spec.px })
}
