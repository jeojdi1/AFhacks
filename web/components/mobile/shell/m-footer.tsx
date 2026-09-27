"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { t } from "@/lib/app/strings"
import { desktopHref } from "./route"
import { useFromPrime } from "./use-from-prime"

/** Data credits and demo disclaimers (same as the desktop footer), sized for a phone. */
export function MFooter() {
  const pathname = usePathname()
  const fromPrime = useFromPrime()
  return (
    <footer className="mt-auto border-t border-border bg-muted px-4 pt-4 pb-5 text-[13px] leading-relaxed text-muted-foreground">
      <p className="font-medium text-slate-700">{t("footer.itb")}</p>
      <p>{t("footer.data")}</p>
      <p className="mt-1">{t("footer.fiction")}</p>
      <p className="mt-1">{t("footer.drawings")}</p>
      <Link
        href="/security"
        className="mt-1 flex w-fit min-h-12 items-center font-medium text-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Security and demo notice
      </Link>
      <Link
        href={desktopHref(pathname, fromPrime)}
        className="flex w-fit min-h-12 items-center font-medium text-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        data-testid="m-desktop-link"
      >
        {t("role.desktop")}
      </Link>
    </footer>
  )
}
