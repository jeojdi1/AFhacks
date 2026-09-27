import type { Metadata } from "next";

import { ScorecardView } from "@/components/scorecard/scorecard-view";
import { cc } from "@/lib/ui/copy-c";

export const metadata: Metadata = {
  title: cc("score.meta.title"),
  description: cc("score.meta.description"),
};

export default function ScorecardPage() {
  return <ScorecardView />;
}
