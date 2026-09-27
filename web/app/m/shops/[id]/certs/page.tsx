import type { Metadata } from "next"
import { WalletView } from "@/components/mobile/wallet/wallet-view"

export const metadata: Metadata = {
  title: "Certifications · Muster",
}

/**
 * The demo shop is prerendered, so its tab screens are fully prefetchable and still open
 * offline once the phone has loaded one of them. Any other shop id renders on request.
 */
export function generateStaticParams() {
  return [{ id: "syn-012" }]
}

/** Compliance wallet (docs/app-spec.md §2.4). */
export default async function CertsPage({ params }: PageProps<"/m/shops/[id]/certs">) {
  const { id } = await params
  return <WalletView shopId={decodeURIComponent(id)} />
}
