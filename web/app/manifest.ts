import type { MetadataRoute } from "next"

// Web app manifest, served at /manifest.webmanifest. Brand tokens from globals.css.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Shieldworks",
    short_name: "Shieldworks",
    description: "Defence job offers, certifications and training for small Canadian shops. No bidding, no drawings stored.",
    start_url: "/m?src=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#ffffff",
    background_color: "#ffffff",
    lang: "en-CA",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Offers",
        short_name: "Offers",
        description: "Defence job offers waiting for a reply",
        url: "/m/shops/syn-012/offers",
        icons: [{ src: "/icons/192", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Certs",
        short_name: "Certs",
        description: "Certifications and renewal deadlines",
        url: "/m/shops/syn-012/certs",
        icons: [{ src: "/icons/192", sizes: "192x192", type: "image/png" }],
      },
    ],
  }
}
