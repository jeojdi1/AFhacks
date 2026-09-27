"use client";

// The ITB training-credit cap in one plain line (simplified demo rules, ITB model terms §7.5.4.1):
// training credit can count for at most 25% of what the defence company owes.
// Used on /scorecard (multiplier chart), under the /gaps fund-moment headline and in the /m/prime
// fund sheet. No credit number changes: cap = obligation × 0.25, used = Σ credit of the ledger's
// funded-training transactions (origin "training"), so it updates after each funded package.

import type { LedgerResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtPct } from "@/lib/format";
import { c } from "@/lib/ui/copy";

/** Share of the obligation that training credit may count for (simplified demo rules). */
export const TRAINING_CAP_SHARE = 0.25;
const RULES_LABEL = "Simplified ITB rules for demo";

export interface TrainingCap {
  cap: number;
  used: number;
  /** used / cap (0–1). */
  share: number;
}

/** Cap, credit used by funded training, and the share of the cap used. */
export function trainingCapOf(ledger: Pick<LedgerResponse, "obligation_cad" | "transactions">, extraCredit = 0): TrainingCap {
  const cap = (ledger.obligation_cad || 0) * TRAINING_CAP_SHARE;
  const used =
    ledger.transactions.reduce((s, t) => (t.origin === "training" ? s + (t.credit_cad || 0) : s), 0) + Math.max(0, extraCredit);
  return { cap, used, share: cap > 0 ? used / cap : 0 };
}

/** The line itself (text only): "Training credit can count for at most 25% … of that cap." */
export function trainingCapText(t: TrainingCap, mode: "uses" | "wouldUse" = "uses"): string {
  const vars = { cap: fmtMoney(t.cap, { compact: true }), used: fmtMoney(t.used, { compact: true }), pct: fmtPct(t.share, 1) };
  if (t.used <= 0) return c("score.cap.none", vars);
  return c(mode === "wouldUse" ? "score.cap.wouldUse" : "score.cap.line", vars);
}

/** The line with the "Simplified ITB rules for demo" tag. */
export function TrainingCapNote({
  ledger,
  extraCredit = 0,
  mode = "uses",
  className,
  rulesLabel,
}: {
  ledger: Pick<LedgerResponse, "obligation_cad" | "transactions">;
  /** Credit of a package about to be funded (the /m/prime confirm sheet). */
  extraCredit?: number;
  mode?: "uses" | "wouldUse";
  className?: string;
  rulesLabel?: string;
}) {
  const t = trainingCapOf(ledger, extraCredit);
  if (t.cap <= 0) return null;
  return (
    <p className={cn("text-sm leading-snug text-slate-600", className)} data-testid="training-cap">
      {trainingCapText(t, mode)}{" "}
      <span className="inline-flex h-5 items-center rounded-full border border-dashed border-slate-400 px-2 align-middle text-xs font-medium whitespace-nowrap text-slate-600">
        {rulesLabel || RULES_LABEL}
      </span>
    </p>
  );
}
