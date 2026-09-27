import type { Metadata } from "next"
import { WalletView } from "@/components/mobile/wallet/wallet-view"

export const metadata: Metadata = {
  title: "Certifications · Muster",
}

/** Compliance wallet (docs/app-spec.md §2.4). */
export default async function CertsPage({ params }: PageProps<"/m/shops/[id]/certs">) {
  const { id } = await params
  return <WalletView shopId={decodeURIComponent(id)} />
}
