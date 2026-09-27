"use client"

import { Building2, HandCoins, HelpCircle } from "lucide-react"
import type { TrainingPackage } from "@/lib/api/types"
import { fmtMoney } from "@/lib/format"
import { t } from "@/lib/app/strings"
import { packageCaveat, packageTitle } from "@/lib/app/copy"
import { otherFunding } from "@/lib/app/readiness"
import { AssumptionTag } from "@/components/muster/assumption-tag"
import { SourceLink } from "./grow-chips"

/** "Who pays": the prime-fundable package (if any) and other programs the shop may qualify for. */
export function WhoPays({ pkg, requirement }: { pkg: TrainingPackage | null; requirement: string }) {
  const others = otherFunding()
  return (
    <section aria-labelledby="who-pays-title" className="flex flex-col gap-3">
      <h3 id="who-pays-title" className="text-lg font-semibold tracking-tight">
        {t("ready.whoPays")}
      </h3>

      {pkg ? (
        <div className="rounded-xl border border-funded/30 bg-funded-soft/60 p-4">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 size-5 shrink-0 text-funded" aria-hidden />
            <div className="min-w-0">
              <p className="text-base leading-snug font-semibold">
                {t(requirement === "CWB_W47.1" ? "ready.primeFunds" : "ready.primeFundsGeneric", {
                  cost: fmtMoney(pkg.est_cost_cad, { compact: true }),
                  credit: fmtMoney(pkg.est_credit_cad, { compact: true }),
                  mult: pkg.multiplier,
                })}{" "}
                <AssumptionTag className="align-middle" note="Training cost and credit are demo estimates (data/rules/training_costs.json)" />
              </p>
              <p className="mt-1.5 text-sm leading-snug text-muted-foreground">
                <span className="font-mono text-[13px]">{pkg.id}</span> · {packageTitle(pkg)}
              </p>
              {packageCaveat(pkg) ? <p className="mt-1 text-sm leading-snug text-muted-foreground">{packageCaveat(pkg)}</p> : null}
              <p className="mt-1 text-sm leading-snug text-muted-foreground">
                {t("ready.primeFundsBody", { trainees: pkg.trainees, provider: pkg.recipient_example })}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t("label.simplifiedItb")}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted p-4">
          <HelpCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-base font-medium">{t("ready.noPackage")}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("ready.noPackageBody")}</p>
          </div>
        </div>
      )}

      {others.map((o) => (
        <div key={o.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <HandCoins className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("ready.alsoEligible")}</p>
              <p className="mt-1 text-base leading-snug">
                <span className="font-semibold">{o.name}:</span> {o.text}
              </p>
              <div>
                <SourceLink href={o.source_url} label={t("ready.source")} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}
