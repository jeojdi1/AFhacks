import type { Metadata } from "next";

import { ProgramView } from "@/components/program/program-view";

export const metadata: Metadata = {
  title: "Northgate's parts list · Shieldworks",
  description:
    "Load Northgate's parts list (a fictional defence company). Shieldworks reads each line and offers each job to one qualified small Canadian shop, with no bidding.",
};

export default function ProgramPage() {
  return <ProgramView />;
}
