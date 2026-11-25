"use client";

// #3 look sheet and #4 front takes: both sit between the run bar and the view grid.
import { Check, LayoutPanelLeft } from "lucide-react";
import { RenderStatus } from "@/components/kit/RenderStatus";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RENDER_COST_USD } from "@/lib/model-studio/variants";
import { renderStatusOf } from "@/lib/model-studio/request";
import type { Slot } from "@/lib/model-studio/types";
import { cn } from "@/lib/utils";
import { Section, Segmented, Thumb } from "./bits";
import { RENDER_ESTIMATE_MS } from "./ViewCard";

export function LookSheetPanel({ sheetUrl, useSheet, status, error, onMake, onToggle }: {
  sheetUrl: string; useSheet: boolean; status: "idle" | "loading" | "error"; error: string;
  onMake: () => void; onToggle: (on: boolean) => void;
}) {
  const cost = `1 render, about $${RENDER_COST_USD.toFixed(2)}`;
  return (
    <Section
      title="Look sheet"
      hint="One front/back/side sheet made from the finished front, so back and side details match. Faces never come from it."
      action={<Button size="sm" variant="outline" disabled={status === "loading"} onClick={onMake}><LayoutPanelLeft data-icon="inline-start" aria-hidden />{sheetUrl ? `New look sheet (${cost})` : `Make look sheet (${cost})`}</Button>}
    >
      {status === "loading" ? (
        <div aria-busy="true" aria-label="Making the look sheet"><Skeleton className="aspect-[3/2] w-full rounded-[10px]" /><p className="mt-2 text-[12px] text-muted-foreground">Making the sheet, usually about a minute.</p></div>
      ) : status === "error" ? (
        <Alert variant="error" className="rounded-[12px]"><AlertDescription>{error}</AlertDescription></Alert>
      ) : sheetUrl ? (
        <Thumb src={sheetUrl} alt="Look sheet" fit="contain" className="aspect-[3/2] w-full bg-muted" />
      ) : (
        <p className="rounded-[10px] border border-dashed border-border p-4 text-center text-[13px] text-muted-foreground">No sheet yet. Back and side follow the front render alone.</p>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium">Use sheet for back/side</p>
          <p className="text-[11px] text-muted-foreground">{sheetUrl ? "Sent with every later view, next to the front." : "Make a sheet first."}</p>
        </div>
        <Segmented label="Use sheet for back and side" disabled={!sheetUrl} value={useSheet && Boolean(sheetUrl) ? "on" : "off"} onChange={(v) => onToggle(v === "on")}
          options={[{ value: "off", label: "Off" }, { value: "on", label: "On" }]} />
      </div>
    </Section>
  );
}

export function TakesStrip({ takes, onUse, onResume }: { takes: Slot[]; onUse: (index: number) => void; onResume: (index: number) => void }) {
  const waiting = takes.filter((t) => t.status === "running").length;
  return (
    <Section title={`Front takes (${takes.length})`} hint={waiting ? `${waiting} still rendering. Pick the best one; the others stay in the front's history.` : "Pick the best one. The others stay in the front's history."}>
      <div className={cn("grid gap-3", takes.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {takes.map((t, i) => (
          <div key={t.request?.requestId || i} className="min-w-0">
            {t.status === "done" ? (
              <div className="rounded-[12px] border border-border p-1.5">
                <Thumb src={t.url} alt={`Take ${i + 1}`} className="aspect-[2/3] w-full" />
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <span className="text-[12px] font-medium">Take {i + 1}</span>
                  <Button size="xs" onClick={() => onUse(i)}><Check data-icon="inline-start" aria-hidden />Use this</Button>
                </div>
              </div>
            ) : t.pending ? (
              <div className="flex aspect-[2/3] flex-col items-center justify-center gap-2 rounded-[12px] bg-[#fdf3e1] p-3 text-center">
                <p className="text-[12px] text-[#7a4a0b]">No answer for take {i + 1}.</p>
                <Button size="xs" variant="outline" onClick={() => onResume(i)}>Resume</Button>
              </div>
            ) : (
              <RenderStatus className="rounded-[12px]" status={renderStatusOf(t)} startedAt={t.startedAt || Date.now()} estimateMs={RENDER_ESTIMATE_MS} title={`Take ${i + 1}`} resolution="1024 × 1536" error={t.error} />
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
