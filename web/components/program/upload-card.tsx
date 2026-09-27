"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Lock, Play, Upload } from "lucide-react";

import { Details } from "@/components/muster/details";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Job, PartsUploadResponse } from "@/lib/api/types";
import { fx } from "@/lib/data/fixture-source";
import type { Stage } from "@/lib/data/store";
import { fmtMoney } from "@/lib/format";
import { cb } from "@/lib/ui/copy-b";
import { cn } from "@/lib/utils";

// Value of the checked-in Northgate list, so the card copy cannot drift from the loaded list.
const DEMO_UPLOAD = fx<PartsUploadResponse>("POST", "/programs/northgate/parts");
const DEMO_LINES = DEMO_UPLOAD?.jobs.length ?? 40;
const DEMO_TOTAL = (DEMO_UPLOAD?.jobs ?? []).reduce((s, j) => s + (j.est_value_cad ?? 0), 0);

export interface UploadCardProps {
  stage: Stage;
  busy: string | null;
  jobs: Job[];
  /** Name of the uploaded CSV (from the store); null for the demo list. */
  fileName: string | null;
  onUpload: (file?: File) => void | Promise<void>;
}

/**
 * Step 1's card (docs/ux-simplification.md §5.1): one big "Load Northgate's parts list (40 parts)"
 * button; the CSV dropzone sits behind "Use your own parts list (CSV)" (collapsed in Story mode).
 * Once loaded, a one-line summary: "40 parts · $42.7M of work · 5 controlled (…)".
 */
export function UploadCard({ stage, busy, jobs, fileName: storeFileName, onUpload }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const fileName = storeFileName ?? pickedName;
  const isBusy = busy !== null;
  const uploading = isBusy && /^tagging/i.test(busy ?? "");
  const busyText = uploading ? cb("busy.upload") : busy;

  function pick(file: File | undefined) {
    if (!file) return;
    setPickedName(file.name);
    void onUpload(file);
  }

  if (stage === "empty" && jobs.length === 0) {
    return (
      <Card className="py-0">
        <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <FileSpreadsheet className="mt-0.5 size-6 shrink-0 text-slate-500" aria-hidden />
              <div className="min-w-0">
                <p className="text-lg font-semibold text-slate-900">{cb("program.upload.demo.title")}</p>
                <p className="mt-0.5 text-[15px] text-slate-600">
                  {cb("program.upload.demo.body", {
                    n: DEMO_LINES,
                    value: DEMO_TOTAL > 0 ? fmtMoney(DEMO_TOTAL, { compact: true }) : "$40M",
                  })}
                </p>
              </div>
            </div>
            <Button
              size="lg"
              className="h-auto min-h-12 shrink-0 gap-2 px-5 py-2 text-base font-semibold whitespace-normal shadow-sm"
              disabled={isBusy}
              onClick={() => {
                setPickedName(null);
                void onUpload();
              }}
            >
              {uploading && !fileName ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
              {uploading && !fileName ? busyText : cb("program.upload.button")}
            </Button>
          </div>

          {isBusy && !uploading ? (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> {busy}
            </p>
          ) : null}

          <p className="flex items-start gap-1.5 text-sm text-slate-600">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-violet-700" aria-hidden />
            <span>{cb("program.drawings")}</span>
          </p>

          <Details summary={cb("program.upload.csv")}>
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
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
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
              <div className="flex size-11 items-center justify-center rounded-full bg-white ring-1 ring-slate-200">
                {uploading && fileName ? (
                  <Loader2 className="size-5 animate-spin text-slate-500" aria-hidden />
                ) : (
                  <Upload className="size-5 text-slate-500" aria-hidden />
                )}
              </div>
              <div>
                <p className="text-base font-medium text-slate-900">
                  {uploading && fileName ? `${busyText} (${fileName})` : cb("program.upload.drop")}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {cb("program.upload.or")}{" "}
                  <span className="font-medium text-slate-700 underline underline-offset-4">
                    {cb("program.upload.choose")}
                  </span>
                  {" · "}
                  {cb("program.upload.columns")}
                </p>
              </div>
            </label>
          </Details>
        </CardContent>
      </Card>
    );
  }

  // ---- uploaded (the view hides this card once jobs are matched) ----
  const controlled = jobs.filter((j) => j.controlled).length;
  const total = jobs.reduce((s, j) => s + (j.est_value_cad ?? 0), 0);

  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
        <p className="flex items-center gap-2 text-base font-medium text-slate-900">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden />
          {fileName ? cb("program.loaded.file", { file: fileName }) : cb("program.loaded")}
        </p>
        <p className="text-[15px] text-slate-700 tabular-nums">
          {cb("program.stats.uploaded", {
            n: jobs.length,
            value: fmtMoney(total, { compact: true }),
            controlled,
          })}
        </p>
      </CardContent>
    </Card>
  );
}
