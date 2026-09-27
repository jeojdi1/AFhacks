import { Suspense } from "react"
import type { Metadata } from "next"
import { PhoneConnect } from "@/components/qr/phone-connect"

export const metadata: Metadata = {
  title: "Open on your phone · Muster",
  description: "Scan a code to open the Muster phone app on a phone that shares this laptop's Wi-Fi.",
}

export default function PhonePage() {
  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-[2rem]">
          Open Muster on your phone
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-slate-700 sm:text-lg">
          Three steps and you&apos;re holding the same app a shop, a defence company, a college or a trainee would use.
        </p>
      </header>
      <Suspense fallback={<div className="aspect-square w-full max-w-[300px] animate-pulse rounded-lg bg-muted" />}>
        <PhoneConnect />
      </Suspense>
    </div>
  )
}
