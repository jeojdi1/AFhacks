import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "leaflet/dist/leaflet.css"
import "./globals.css"
import { DemoProvider } from "@/lib/data/store"
import { AppActionsProvider } from "@/lib/app/actions-store"
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
  title: "Muster — defence work and workers for small Canadian factories",
  description:
    "Muster routes defence contract work to qualified small Canadian shops, tracks ITB credit live, and funds the training that unblocks the rest.",
  applicationName: "Muster",
  appleWebApp: { capable: true, title: "Muster", statusBarStyle: "default" },
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <DemoProvider>
          <AppActionsProvider>
            <TooltipProvider delay={150}>
              {/* Desktop header, program bar and footer; skipped under /m (phone chrome in app/m/layout.tsx). */}
              <ChromeGate>{children}</ChromeGate>
              {/* Desktop toasts bottom-right; phone-app (/m) toasts below the sticky header. See AppToaster. */}
              <AppToaster />
            </TooltipProvider>
          </AppActionsProvider>
        </DemoProvider>
      </body>
    </html>
  )
}
