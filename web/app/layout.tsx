import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "leaflet/dist/leaflet.css"
import "./globals.css"
import { DemoProvider } from "@/lib/data/store"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { AppHeader } from "@/components/shell/app-header"
import { ProgramContextBar } from "@/components/shell/program-context-bar"
import { AppFooter } from "@/components/shell/app-footer"

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
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <DemoProvider>
          <TooltipProvider delay={150}>
            <AppHeader />
            <ProgramContextBar />
            <main className="flex w-full flex-1 flex-col">{children}</main>
            <AppFooter />
            <Toaster theme="light" position="top-right" closeButton />
          </TooltipProvider>
        </DemoProvider>
      </body>
    </html>
  )
}
