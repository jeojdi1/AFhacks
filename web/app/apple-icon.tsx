import { ImageResponse } from "next/og"
import { IconArt } from "@/components/mobile/shell/icon-art"

// iOS Home Screen icon (full bleed; iOS rounds the corners).
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(<IconArt size={180} inset={0.22} />, { ...size })
}
