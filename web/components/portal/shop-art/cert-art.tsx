// Pictures for Tallowfield's shop desk (/shop): a certificate-with-ribbon badge for
// "One step to more work" and one small icon per certificate type. Decorative only.

import {
  Award,
  BadgeCheck,
  FlaskConical,
  Flame,
  LockKeyhole,
  Plane,
  ShieldCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"

/** A certificate sheet with a rosette and ribbon: "one certificate away". Decorative. */
export function CertBadgeArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={cn("size-24 shrink-0", className)} aria-hidden focusable="false">
      <circle cx="48" cy="48" r="46" className="fill-public-soft" />
      {/* sheet */}
      <rect x="18" y="20" width="50" height="60" rx="4" className="fill-white stroke-slate-300" strokeWidth="2" />
      <path d="M26 32h34M26 40h28M26 48h32M26 56h18" strokeWidth="3" strokeLinecap="round" className="stroke-slate-300" />
      {/* ribbon */}
      <path d="M62 62l-6 22 8-5 6 7 2-22z" className="fill-public" />
      <path d="M72 62l4 22-8-4-4 6-2-22z" className="fill-public/70" />
      {/* rosette */}
      <circle cx="66" cy="58" r="13" className="fill-public" />
      <circle cx="66" cy="58" r="8" className="fill-white/90" />
      <path d="M62 58l3 3 5-6" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-public" />
    </svg>
  )
}

/** Icon per certificate type (CWB welding, ISO quality, Controlled Goods, ...). */
function CertIcon({ type, className }: { type: string; className?: string }) {
  if (type.startsWith("CWB")) return <Flame className={className} />
  if (type.startsWith("ISO")) return <BadgeCheck className={className} />
  if (type === "CGP") return <ShieldCheck className={className} />
  if (type.startsWith("CPCSC")) return <LockKeyhole className={className} />
  if (type.startsWith("AS9100")) return <Plane className={className} />
  if (type.startsWith("NADCAP")) return <FlaskConical className={className} />
  return <Award className={className} />
}

/** Tinted round tile holding the certificate icon. Decorative. */
export function CertIconTile({ type, tone = "neutral" }: { type: string; tone?: "neutral" | "warn" | "training" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl",
        tone === "warn" ? "bg-blocked/10 text-blocked" : tone === "training" ? "bg-amber-50 text-amber-700" : "bg-muted text-slate-700"
      )}
    >
      <CertIcon type={type} className="size-5" />
    </span>
  )
}
