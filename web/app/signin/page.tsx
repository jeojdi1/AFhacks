import type { Metadata } from "next"
import { SignInCards } from "@/components/auth/sign-in-cards"

export const metadata: Metadata = {
  title: "Sign in · Shieldworks",
  description: "Pick a demo account: Northgate (fictional defence company), a synthetic small shop, a college, or a trainee seat.",
}

export default function SignInPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-[2rem]">Who are you today?</h1>
        <p className="max-w-3xl text-base leading-relaxed text-slate-700 sm:text-lg">
          Shieldworks has a desk for each side of a defence contract: the defence company that owes Canada business, the small
          shop that does the work, the college that trains the welders, and the trainee.
        </p>
      </header>
      <SignInCards />
    </div>
  )
}
