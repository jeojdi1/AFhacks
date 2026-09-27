import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "leaflet/dist/leaflet.css"
import "./globals.css"
import { DemoProvider } from "@/lib/data/store"
import { AppActionsProvider } from "@/lib/app/actions-store"
import { StoryModeProvider } from "@/lib/ui/story-mode"
import { COPY } from "@/lib/ui/copy"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppToaster, ChromeGate } from "@/components/shell/chrome-gate"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: COPY["app.title"],
  // The one plain-language sentence the whole app repeats (docs/ux-simplification.md §1).
  description: COPY["app.sentence"],
  applicationName: "Shieldworks",
  appleWebApp: { capable: true, title: "Shieldworks", statusBarStyle: "default" },
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-story="on" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <DemoProvider>
          <StoryModeProvider>
            <AppActionsProvider>
              <TooltipProvider delay={150}>
                {/* Desktop header, story bar and footer; skipped under /m (phone chrome in app/m/layout.tsx). */}
                <ChromeGate>{children}</ChromeGate>
                {/* Desktop toasts bottom-right; phone-app (/m) toasts below the sticky header. See AppToaster. */}
                <AppToaster />
              </TooltipProvider>
            </AppActionsProvider>
          </StoryModeProvider>
        </DemoProvider>
      </body>
    </html>
  )
}
