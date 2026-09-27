import type { Metadata } from "next";

import { ProgramView } from "@/components/program/program-view";

export const metadata: Metadata = {
  title: "Program · Muster",
  description:
    "Upload the prime's parts list; Muster tags each line and routes every job to the best qualified Canadian shop.",
};

export default function ProgramPage() {
  return <ProgramView />;
}
