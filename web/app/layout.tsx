import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "leaflet/dist/leaflet.css"
import "./globals.css"
import { DemoProvider } from "@/lib/data/store"
import { AppActionsProvider } from "@/lib/app/actions-store"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { ChromeGate } from "@/components/shell/chrome-gate"

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
              {/*
                Under 600 px (the /m phone app) toasts sit below the 56 px sticky header, so
                Back and the status badge stay tappable while an Undo toast is up. Undo is the
                safety net that replaces a confirm dialog, so it gets a 44 px target; the close
                button is 32 px with an invisible 44 px hit area.
              */}
              <Toaster
                theme="light"
                position="top-right"
                closeButton
                mobileOffset={{ top: "calc(env(safe-area-inset-top) + 64px)" }}
                toastOptions={{
                  classNames: {
                    toast: "cn-toast",
                    actionButton: "!h-11 !min-w-11 !rounded-lg !px-4 !text-base !font-semibold",
                    closeButton: "!size-8 after:absolute after:-inset-1.5 after:content-['']",
                  },
                }}
              />
            </TooltipProvider>
          </AppActionsProvider>
        </DemoProvider>
      </body>
    </html>
  )
}
