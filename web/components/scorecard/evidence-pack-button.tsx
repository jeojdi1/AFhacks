"use client";

// "Download evidence pack (CSV)" (/scorecard): shown to the defence company and in signed-out
// Story mode, hidden for the shop, college and trainee accounts. The CSV is built here in the
// browser (evidence-pack.ts) and saved with a temporary <a download>; nothing is uploaded.

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { LedgerResponse } from "@/lib/api/types";
import { useAppActions } from "@/lib/app/actions-store";
import { useSession } from "@/lib/auth/session";
import { useDemo } from "@/lib/data/store";
import { c } from "@/lib/ui/copy";

import { EVIDENCE_PACK_FILENAME, evidencePackCsv, type EvidenceShop } from "./evidence-pack";

const SOURCE_LABEL = { synthetic: "Synthetic", public: "Public data (unverified)" } as const;

function saveCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Let the browser start the download before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function EvidencePackButton({ ledger }: { ledger: LedgerResponse | null }) {
  const demo = useDemo();
  const actions = useAppActions();
  const { session, hydrated } = useSession();
  const [busy, setBusy] = useState(false);

  // Defence company or signed out only (after hydration, so it never flashes for other roles).
  if (!hydrated || (session && session.role !== "prime")) return null;

  const ready = !!ledger && ledger.transactions.length > 0;

  const run = async () => {
    if (!ledger) return;
    setBusy(true);
    try {
      const shopIds = [...new Set(ledger.transactions.map((t) => t.shop_id))];
      const list = await demo.getShops().catch(() => null);
      const byId = new Map((list?.shops ?? []).map((s) => [s.id, s]));
      const details = await Promise.allSettled(shopIds.map((id) => demo.getShop(id)));
      const shops: Record<string, EvidenceShop> = {};
      shopIds.forEach((id, i) => {
        const item = byId.get(id);
        const d = details[i].status === "fulfilled" ? details[i].value : null;
        const shop = d?.shop ?? item ?? null;
        const synthetic = shop?.source === "synthetic";
        const certs = d
          ? d.certifications.map((x) => ({
              type: x.type,
              status: x.status,
              source: x.source_url || (synthetic ? "synthetic demo data" : x.note || "not stated"),
            }))
          : (item?.cert_summary ?? []).map((x) => ({ type: x.type, status: x.status, source: synthetic ? "synthetic demo data" : "not stated" }));
        shops[id] = {
          name: shop?.name ?? id,
          label: shop?.label || (shop ? SOURCE_LABEL[shop.source] : ""),
          is_sme: shop?.is_sme ?? null,
          certs,
        };
      });
      const fundedAt: Record<string, string> = {};
      for (const e of actions.events) if (e.kind === "package_funded" && e.package_id) fundedAt[e.package_id] = e.ts;
      const csv = evidencePackCsv({
        transactions: ledger.transactions,
        assignments: demo.assignments,
        jobs: demo.jobs,
        packages: demo.gaps?.suggestions ?? [],
        shops,
        routedAt: actions.routedAt,
        fundedAt,
        today: new Date().toISOString().slice(0, 10),
      });
      saveCsv(csv, EVIDENCE_PACK_FILENAME);
      toast.success(c("score.evidence.done"), { description: c("score.evidence.done.body", { n: ledger.transactions.length }) });
    } catch (e) {
      toast.error(c("score.evidence.failed"), { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-0.5 sm:items-end">
      <Button
        variant="outline"
        className="h-9 gap-2 px-3.5 text-sm"
        disabled={!ready || busy}
        aria-busy={busy || undefined}
        aria-describedby={!ready ? "evidence-pack-hint" : undefined}
        onClick={() => void run()}
        data-testid="evidence-pack"
      >
        {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
        {busy ? c("score.evidence.busy") : c("score.evidence")}
      </Button>
      {!ready ? (
        <span id="evidence-pack-hint" className="text-xs text-slate-500">
          {c("score.evidence.hint")}
        </span>
      ) : null}
    </span>
  );
}
