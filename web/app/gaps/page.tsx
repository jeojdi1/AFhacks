import type { Metadata } from "next";

import { GapsView } from "@/components/gaps/gaps-view";
import { COPY_D } from "@/lib/ui/copy-d";

export const metadata: Metadata = {
  title: COPY_D["gaps.meta.title"],
  description: COPY_D["gaps.meta.description"],
};

export default function GapsPage() {
  return <GapsView />;
}
