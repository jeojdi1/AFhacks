import type { FundResponse, Snapshot } from "@/lib/api/types";

export interface FundingSummary {
  funded: FundResponse[];
  /** State before the first package was funded (smallest "before" credit). */
  baseline: Snapshot | null;
  training: { packageId: string; creditCad: number; costCad: number; multiplier: number }[];
  trainingCreditCad: number;
  jobsCreditCad: number;
  unblockedJobs: number;
  /** Package ids whose training transaction should be highlighted. */
  packageIds: Set<string>;
}

export function summarizeFunding(
  fundResults: Record<string, FundResponse> | null | undefined,
  lastFund: FundResponse | null | undefined,
): FundingSummary | null {
  const byId = new Map<string, FundResponse>();
  for (const r of Object.values(fundResults ?? {})) {
    if (r?.package_id) byId.set(r.package_id, r);
  }
  if (lastFund?.package_id) byId.set(lastFund.package_id, lastFund);
  const funded = [...byId.values()];
  if (funded.length === 0) return null;

  let baseline: Snapshot | null = null;
  for (const f of funded) {
    if (!baseline || f.before.credit_total_cad < baseline.credit_total_cad) {
      baseline = f.before;
    }
  }

  const training = funded.map((f) => ({
    packageId: f.package_id,
    creditCad: f.credit_added_breakdown?.training_cad ?? f.training_txn?.credit_cad ?? 0,
    costCad: f.training_txn?.value_cad ?? f.package?.est_cost_cad ?? 0,
    multiplier: f.training_txn?.multiplier ?? f.package?.multiplier ?? 5,
  }));

  return {
    funded,
    baseline,
    training,
    trainingCreditCad: training.reduce((a, t) => a + t.creditCad, 0),
    jobsCreditCad: funded.reduce((a, f) => a + (f.credit_added_breakdown?.jobs_cad ?? 0), 0),
    unblockedJobs: funded.reduce((a, f) => a + (f.unblocked_jobs?.length ?? 0), 0),
    packageIds: new Set(funded.map((f) => f.package_id)),
  };
}
