"use client";

// One view of the run. Not made yet → a quiet placeholder; running or failed → the kit's RenderStatus (with Retry);
// unconfirmed → Resume, which re-sends the same request id (the studio hands back the same task); done → the picture
// with Keep, Redo + note, Previous, Heal and a details row.
import { useState } from "react";
import { Check, History, RotateCcw, Wand2 } from "lucide-react";
import { RenderStatus } from "@/components/kit/RenderStatus";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import core from "@/lib/model-shots-core";
import { canHeal, renderStatusOf } from "@/lib/model-studio/request";
import type { Slot } from "@/lib/model-studio/types";
import { cn } from "@/lib/utils";
import { Tag, Thumb } from "./bits";

export const RENDER_ESTIMATE_MS = 70_000;
const RESOLUTION = "1024 × 1536";

export interface ViewCardActions {
  onRedo: (index: number, note: string) => void;
  onPrevious: (index: number) => void;
  onHeal: (index: number) => void;
  onResume: (index: number) => void;
  onKeep: (index: number) => void;
}

function faceText(faceCheck: unknown): string {
  const f = (faceCheck || {}) as { ok?: boolean; verdict?: string; score?: number };
  if (!faceCheck) return "Not checked";
  if (typeof f.verdict === "string") return f.verdict;
  if (typeof f.ok === "boolean") return f.ok ? "Passed" : "Needs a look";
  return "Recorded";
}

export default function ViewCard({ slot, index, stale, waiting, healing, actions }: {
  slot: Slot; index: number; stale: boolean; waiting: string; healing: boolean; actions: ViewCardActions;
}) {
  const [note, setNote] = useState("");
  const label = core.VIEW_LABEL[slot.view];
  const heal = canHeal(slot);

  if (slot.status === "queued" && !slot.url) {
    return (
      <article className="ms-view flex flex-col rounded-[12px] border border-dashed border-border bg-card p-3" aria-label={`${label}, not made yet`}>
        <div className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-1 rounded-[10px] bg-muted/60 px-4 text-center">
          <span className="text-[13px] font-medium text-foreground">{label}</span>
          <span className="text-[12px] text-muted-foreground">{waiting || (slot.view === "front" ? "Starts with Generate front preview." : "Follows the finished front.")}</span>
        </div>
      </article>
    );
  }

  if (slot.status === "running" && slot.pending) {
    return (
      <article className="ms-view flex flex-col rounded-[12px] border border-border bg-card p-3" aria-label={`${label}, unconfirmed`}>
        <div className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-3 rounded-[10px] bg-[#fdf3e1] px-5 text-center">
          <p className="text-[13px] font-medium text-[#7a4a0b]">The studio has not answered for this {label.toLowerCase()}.</p>
          <p className="text-[12px] text-[#7a4a0b]/80">Resume asks for the same render again. It does not start a second one.</p>
          <Button size="sm" variant="outline" onClick={() => actions.onResume(index)}><RotateCcw data-icon="inline-start" aria-hidden />Resume</Button>
        </div>
        <p className="mt-2 text-[13px] font-medium">{label}</p>
      </article>
    );
  }

  if (slot.status !== "done") {
    return (
      <RenderStatus
        className="ms-view rounded-[12px]"
        status={renderStatusOf(slot)}
        startedAt={slot.startedAt || Date.now()}
        estimateMs={RENDER_ESTIMATE_MS}
        title={label}
        resolution={RESOLUTION}
        error={slot.error}
        onRetry={slot.status === "failed" ? () => actions.onRedo(index, slot.note || "") : undefined}
      />
    );
  }

  return (
    <article className={cn("ms-view flex flex-col rounded-[12px] border bg-card p-3", slot.approved ? "border-foreground/70" : "border-border")} aria-label={`${label}, done`}>
      <div className="relative">
        <Thumb src={slot.url} alt={`${label} render`} className="aspect-[2/3] w-full" />
        <div className="absolute top-2 left-2 flex gap-1">
          {stale && <Tag tone="amber">Older front</Tag>}
          {slot.healedFrom && <Tag tone="green">Healed</Tag>}
          {slot.savedId && <Tag tone="blue">Saved</Tag>}
        </div>
      </div>

      <div className="mt-2.5 flex h-8 items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold">{label}</h3>
        <Button size="sm" variant={slot.approved ? "default" : "outline"} aria-pressed={slot.approved} onClick={() => actions.onKeep(index)}>
          <Check data-icon="inline-start" aria-hidden />{slot.approved ? "Kept" : "Keep"}
        </Button>
      </div>

      <label className="sr-only" htmlFor={`ms-note-${index}`}>Redo note for {label}</label>
      <Textarea
        id={`ms-note-${index}`}
        rows={2}
        maxLength={300}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={slot.note ? `Last note: ${slot.note}` : "Optional note for a redo, e.g. sleeves to the wrist"}
        className="mt-2 min-h-[52px] resize-none rounded-[10px] text-[13px]"
      />
      <div className="mt-1 flex justify-end text-[11px] tabular-nums text-muted-foreground">{note.length}/300</div>

      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => { actions.onRedo(index, note); setNote(""); }}><RotateCcw data-icon="inline-start" aria-hidden />Redo</Button>
        <Button size="sm" variant="outline" disabled={!slot.history?.length} onClick={() => actions.onPrevious(index)}><History data-icon="inline-start" aria-hidden />Previous</Button>
        {heal && (
          <Button size="sm" variant="outline" className="col-span-2" disabled={healing} onClick={() => actions.onHeal(index)}>
            <Wand2 data-icon="inline-start" aria-hidden />{healing ? "Healing…" : "Heal face edges (free)"}
          </Button>
        )}
      </div>

      <details className="ms-details mt-2.5 border-t border-border pt-2 text-[12px]">
        <summary className="cursor-pointer text-muted-foreground select-none">Details</summary>
        <dl className="mt-2 grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 gap-y-1">
          <dt className="text-muted-foreground">Engine</dt><dd>{slot.engine || "—"}{slot.resolution ? ` · ${slot.resolution}` : ""}</dd>
          <dt className="text-muted-foreground">Model</dt><dd className="truncate">{slot.humanModelId || "—"}{slot.poseId ? ` · ${slot.poseId}` : ""}</dd>
          <dt className="text-muted-foreground">Face</dt><dd>{faceText(slot.faceCheck)}</dd>
          <dt className="text-muted-foreground">Prompt</dt><dd className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">{slot.prompt || "Not returned"}</dd>
        </dl>
      </details>
    </article>
  );
}
