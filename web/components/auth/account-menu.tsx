"use client"

// <AccountMenu />: header control for the demo sign-in.
//   Signed out: "Sign in" (→ /signin).
//   Signed in:  "Signed in as … · Switch account · Sign out", plus a link to the account's desk.
// Demo sign-in — fictional accounts, no real authentication.

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeftRight, ChevronDown, LayoutDashboard, LogIn, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { DEMO_SIGNIN_LABEL } from "@/lib/auth/accounts"
import { useSession } from "@/lib/auth/session"
import { buttonVariants } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { ROLE_ICON } from "./role-icon"

const itemCls =
  "flex h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-[0.95rem] font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"

export function AccountMenu({ className }: { className?: string }) {
  const router = useRouter()
  const { account, signOut } = useSession()

  if (!account) {
    return (
      <Link
        href="/signin"
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-3", className)}
        data-testid="account-signin"
      >
        <LogIn data-icon="inline-start" aria-hidden />
        Sign in
      </Link>
    )
  }

  const Icon = ROLE_ICON[account.role]
  return (
    <Popover>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "outline", size: "lg" }), "max-w-44 px-2.5", className)}
        aria-label={`Signed in as ${account.who}. Account menu`}
        data-testid="account-menu"
      >
        <Icon data-icon="inline-start" aria-hidden />
        <span className="truncate">{account.short}</span>
        <ChevronDown data-icon="inline-end" className="text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-80 gap-2 p-3">
        <PopoverHeader className="px-1">
          <PopoverDescription className="text-xs">Signed in as</PopoverDescription>
          <PopoverTitle className="text-[0.95rem] leading-snug">{account.who}</PopoverTitle>
          <p className="text-xs text-muted-foreground">{DEMO_SIGNIN_LABEL}</p>
        </PopoverHeader>
        <div className="flex flex-col gap-0.5 border-t border-border pt-2">
          <Link href={account.home} className={itemCls}>
            <LayoutDashboard className="size-4 text-muted-foreground" aria-hidden />
            Go to my desk
          </Link>
          <Link href="/signin" className={itemCls}>
            <ArrowLeftRight className="size-4 text-muted-foreground" aria-hidden />
            Switch account
          </Link>
          <button
            type="button"
            className={itemCls}
            onClick={() => {
              signOut()
              router.push("/signin")
            }}
          >
            <LogOut className="size-4 text-muted-foreground" aria-hidden />
            Sign out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
