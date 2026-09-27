import type { Metadata } from "next"

import { LandingView } from "@/components/landing/landing-view"
import { COPY } from "@/lib/ui/copy"

// The landing page no longer redirects (docs/ux-simplification.md §4), so /?mode=fixtures keeps
// its ?mode: the store reads it on the client.
export const metadata: Metadata = {
  title: COPY["app.title"],
  description: COPY["app.sentence"],
}

export default function Home() {
  return <LandingView />
}
