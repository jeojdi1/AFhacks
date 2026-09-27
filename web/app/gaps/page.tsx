import type { Metadata } from "next";

import { GapsView } from "@/components/gaps/gaps-view";

export const metadata: Metadata = {
  title: "Gaps & Training · Muster",
  description:
    "Jobs no qualified shop can take, and ITB-eligible training the prime can fund to unblock them.",
};

export default function GapsPage() {
  return <GapsView />;
}
