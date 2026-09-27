import type { MetadataRoute } from "next"
import { withBase } from "@/lib/base-path"

// Static either way (no request data); the GitHub Pages export requires it to be explicit.
export const dynamic = "force-static"

// Web app manifest, served at /manifest.webmanifest. Brand tokens from globals.css.
// withBase(): on the GitHub Pages build every URL sits under /AFhacks; elsewhere it is a no-op.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: withBase("/"),
    name: "Shieldworks",
    short_name: "Shieldworks",
    description: "Defence job offers, certifications and training for small Canadian shops. No bidding, no drawings stored.",
    start_url: withBase("/m?src=pwa"),
    scope: withBase("/"),
    display: "standalone",
    orientation: "portrait",
    theme_color: "#ffffff",
    background_color: "#ffffff",
    lang: "en-CA",
    categories: ["business", "productivity"],
    icons: [
      { src: withBase("/icons/192"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: withBase("/icons/512"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: withBase("/icons/maskable-512"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Offers",
        short_name: "Offers",
        description: "Defence job offers waiting for a reply",
        url: withBase("/m/shops/syn-012/offers"),
        icons: [{ src: withBase("/icons/192"), sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Certs",
        short_name: "Certs",
        description: "Certifications and renewal deadlines",
        url: withBase("/m/shops/syn-012/certs"),
        icons: [{ src: withBase("/icons/192"), sizes: "192x192", type: "image/png" }],
      },
    ],
  }
}
