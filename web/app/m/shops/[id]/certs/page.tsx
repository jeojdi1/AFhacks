import type { Metadata } from "next"
import { WalletView } from "@/components/mobile/wallet/wallet-view"
import { PAGES_EXPORT, allShopIds } from "@/lib/pages/static-params"

export const metadata: Metadata = {
  title: "Certifications · Shieldworks",
}

/**
 * The demo shop is prerendered, so its tab screens are fully prefetchable and still open
 * offline once the phone has loaded one of them. Any other shop id renders on request.
 * The GitHub Pages export (static, no server) lists every demo shop instead.
 */
export function generateStaticParams() {
  return PAGES_EXPORT ? allShopIds().map((id) => ({ id })) : [{ id: "syn-012" }]
}

/** Compliance wallet (docs/app-spec.md §2.4). */
export default async function CertsPage({ params }: PageProps<"/m/shops/[id]/certs">) {
  const { id } = await params
  return <WalletView shopId={decodeURIComponent(id)} />
}
