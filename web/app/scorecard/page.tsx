import type { Metadata } from "next";

import { ScorecardView } from "@/components/scorecard/scorecard-view";

export const metadata: Metadata = {
  title: "ITB Scorecard · Muster",
  description:
    "Live ITB ledger: credit earned toward the 100% obligation, the SMB target, direct vs indirect credit and the multiplier breakdown.",
};

export default function ScorecardPage() {
  return <ScorecardView />;
}
