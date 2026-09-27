import Link from "next/link"
import { Smartphone } from "lucide-react"
import { cn } from "cn"
import { buttonVariants } from "@/components/ui/button"

/**
 * Small header button that opens /phone (the QR code page). Safe to mount in a
 * server or client component; it is a plain link.
 */
export function OpenOnPhoneButton({ className, label = "Open on phone" }: { className?: string; label?: string }) {
  return (
    <Link
      href="/phone"
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5", className)}
      aria-label="Open Muster on your phone"
    >
      <Smartphone aria-hidden />
      <span>{label}</span>
    </Link>
  )
}
