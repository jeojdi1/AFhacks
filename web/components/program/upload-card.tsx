"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  ShieldAlert,
  Sparkles,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Job, PartsUploadResponse } from "@/lib/api/types";
import { fx } from "@/lib/data/fixture-source";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Stage } from "@/lib/data/store";

// Value of the checked-in Northgate list, so the card copy cannot drift from the loaded chip.
const DEMO_UPLOAD = fx<PartsUploadResponse>("POST", "/programs/northgate/parts");
const DEMO_LINES = DEMO_UPLOAD?.jobs.length ?? 40;
const DEMO_TOTAL = (DEMO_UPLOAD?.jobs ?? []).reduce((s, j) => s + (j.est_value_cad ?? 0), 0);
const DEMO_JOB_IDS = new Set((DEMO_UPLOAD?.jobs ?? []).map((j) => j.id));

export interface UploadCardProps {
  stage: Stage;
  busy: string | null;
  jobs: Job[];
  /** Name of the uploaded CSV (from the store); null for the demo list. */
  fileName: string | null;
  onUpload: (file?: File) => void | Promise<void>;
  onRoute: () => void | Promise<void>;
}

export function UploadCard({ stage, busy, jobs, fileName: storeFileName, onUpload, onRoute }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const fileName = storeFileName ?? pickedName;
  const isBusy = busy !== null;
  const uploading = isBusy && /^tagging/i.test(busy ?? "");
  const routing = isBusy && /^routing/i.test(busy ?? "");

  function pick(file: File | undefined) {
    if (!file) return;
    setPickedName(file.name);
    void onUpload(file);
  }

  if (stage === "empty" && jobs.length === 0) {
    return (
      <Card className="py-0">
        <CardContent className="grid gap-0 p-0 md:grid-cols-[1.3fr_1fr]">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "m-4 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
              dragging
                ? "border-primary/60 bg-primary/5"
                : "border-slate-300 bg-slate-50/60 hover:border-slate-400 hover:bg-slate-50",
              isBusy && "pointer-events-none opacity-60",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <div className="flex size-12 items-center justify-center rounded-full bg-white ring-1 ring-slate-200">
              {uploading && fileName ? (
                <Loader2 className="size-5 animate-spin text-slate-500" />
              ) : (
                <Upload className="size-5 text-slate-500" />
              )}
            </div>
            <div>
              <p className="text-base font-medium text-slate-900">
                {uploading && fileName ? `${busy} (${fileName})` : "Drop the prime's parts list (CSV)"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                or <span className="font-medium text-slate-700 underline underline-offset-4">choose a file</span>
                {" · "}columns: part_no, description, qty, unit_price_cad
              </p>
            </div>
          </label>

          <div className="flex flex-col justify-center gap-4 border-t border-slate-200 p-6 md:border-t-0 md:border-l">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-slate-500" />
              <div>
                <p className="text-base font-medium text-slate-900">Northgate demo parts list</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {DEMO_LINES} lines from a fictional armoured-vehicle program, fleet-lifetime quantities
                  {DEMO_TOTAL > 0 ? ` (about ${fmtMoney(DEMO_TOTAL, { compact: true })})` : ""}.
                </p>
              </div>
            </div>
            <Button
              size="lg"
              className="h-auto min-h-11 w-full py-2 text-[15px] whitespace-normal"
              disabled={isBusy}
              onClick={() => {
                setPickedName(null);
                void onUpload();
              }}
            >
              {uploading && !fileName ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              {uploading && !fileName ? busy : `Load Northgate demo parts list (${DEMO_LINES} lines)`}
            </Button>
            {isBusy && !uploading ? (
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="size-3.5 animate-spin" /> {busy}
              </p>
            ) : null}
            <p className="text-xs text-slate-500">
              Muster never stores drawings or technical data: only the parts-list text.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- uploaded / routed / funded ----
  const controlled = jobs.filter((j) => j.controlled).length;
  const total = jobs.reduce((s, j) => s + (j.est_value_cad ?? 0), 0);
  const routed = stage === "routed" || stage === "funded";
  // Name the demo list only when the loaded jobs are the demo list's jobs.
  const isDemoList =
    jobs.length === DEMO_JOB_IDS.size && DEMO_JOB_IDS.size > 0 && jobs.every((j) => DEMO_JOB_IDS.has(j.id));

  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" />
            <p className="text-base font-medium text-slate-900">
              Parts list loaded
              {fileName ? `: ${fileName}` : isDemoList ? ": Northgate demo parts list" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip>
              <span className="font-semibold tabular-nums">{jobs.length}</span> lines tagged
            </Chip>
            {total > 0 ? (
              <Chip>
                <span className="font-semibold tabular-nums">{fmtMoney(total, { compact: true })}</span> work package
              </Chip>
            ) : null}
            <Chip tone="violet">
              <ShieldAlert className="size-3.5" />
              <span className="font-semibold tabular-nums">{controlled}</span> controlled · CGP only
            </Chip>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {routed ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle2 className="size-4" /> Jobs routed
              </span>
            </>
          ) : (
            <Button size="lg" className="h-11 px-5 text-[15px]" disabled={isBusy} onClick={() => void onRoute()}>
              {routing ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : null}
              {routing ? busy : "Route jobs"}
              {!routing ? <ArrowRight data-icon="inline-end" /> : null}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Chip({
  children,
  tone,
  muted,
}: {
  children: React.ReactNode;
  tone?: "violet";
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ring-1",
        tone === "violet"
          ? "bg-violet-50 text-violet-800 ring-violet-200"
          : muted
            ? "bg-white text-slate-600 ring-slate-200"
            : "bg-slate-50 text-slate-800 ring-slate-200",
      )}
    >
      {children}
    </span>
  );
}
