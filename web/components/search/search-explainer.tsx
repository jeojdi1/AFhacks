"use client"

import { Details } from "@/components/muster/details"
import { Term } from "@/components/muster/term"

/**
 * "Explain how search works": hard rules first, then ranking. Collapsed by default in both
 * Story modes (a toggle, never hidden). Simplified ITB rules for demo.
 */
export function SearchExplainer() {
  return (
    <Details summary="Explain how search works" openSummary="Hide how search works" storyHidden={false}>
      <div className="grid gap-4 rounded-xl border border-border bg-muted/50 p-4 text-sm leading-relaxed md:grid-cols-2">
        <div>
          <p className="font-semibold">1. Hard rules come first (pass or fail)</p>
          <p className="mt-1 text-muted-foreground">
            When Northgate sends a job, a shop is only considered if it passes every rule:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>It does the process the part needs (for example welding or 5-axis machining).</li>
            <li>The part fits its machines (size).</li>
            <li>It holds the certificates the job asks for.</li>
            <li>
              Controlled parts go only to <Term k="CGP" first /> shops. Shieldworks never stores drawings.
            </li>
            <li>It has free capacity (hours a week) for the job.</li>
          </ol>
        </div>
        <div>
          <p className="font-semibold">2. Then shops that pass are ranked</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Fit: right machines, materials and precision.</li>
            <li>Distance from Northgate&apos;s London site.</li>
            <li>Lead time: how soon it can start.</li>
            <li>
              <Term k="SMB">Small-business</Term> credit: small-business work counts double toward what Northgate owes.
            </li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            On this page: shops that have every process and certificate you picked (certificates count when
            held, stated or in training), then the closest first. Real shops found in public data are listed
            but never sent work until they claim their profile. Simplified ITB rules for demo.
          </p>
        </div>
      </div>
    </Details>
  )
}
