import type { Metadata } from "next"
import { MHeader } from "@/components/mobile/shell/m-header"
import { FreshnessStamp } from "@/components/mobile/shell/freshness-stamp"
import { OfflineBanner } from "@/components/mobile/shell/offline-banner"
import { IosInstallHint } from "@/components/mobile/shell/ios-install-hint"
import { MFooter } from "@/components/mobile/shell/m-footer"
import { BottomTabs } from "@/components/mobile/shell/bottom-tabs"
import { LiveStepSync } from "@/components/mobile/shell/live-step-sync"

export const metadata: Metadata = {
  title: "Muster",
}

/**
 * Phone app frame: one column up to 430 px. On a desktop browser it gets a thin
 * border and rounded corners so it reads as a phone in the video. The desktop
 * chrome is skipped by ChromeGate in the root layout.
 *
 * Pages render inside <main> with a 16 px gutter already applied. Shop tab
 * roots get the sticky bottom tab bar; detail screens may use their own sticky
 * bottom bar (pad it with env(safe-area-inset-bottom)).
 */
export default function PhoneLayout({ children }: LayoutProps<"/m">) {
  return (
    <div className="flex flex-1 flex-col bg-secondary md:px-4 md:py-6">
      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col bg-background text-base md:overflow-clip md:rounded-[28px] md:border md:border-border md:shadow-sm">
        <LiveStepSync />
        <MHeader />
        <OfflineBanner />
        <FreshnessStamp />
        <main id="m-main" className="flex min-w-0 flex-1 flex-col px-4 pt-1 pb-6">
          {children}
        </main>
        <IosInstallHint />
        <MFooter />
        <BottomTabs />
      </div>
    </div>
  )
}
