"use client";

// The run controls: method, engine (Advanced), front takes, the one Generate button the core decides
// (front preview first, then "Generate remaining N"), and what to do with the finished set.
import type { ReactNode } from "react";
import { Download, FolderOpen, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { ENGINES, type Engine } from "@/lib/model-studio/types";
import { variantCostText, MAX_VARIANTS } from "@/lib/model-studio/variants";
import { cn } from "@/lib/utils";
import { Row, Section, Segmented, Tag } from "./bits";


export function RenderSettings({ engine, variantCount, frontNext, onEngine, onVariants }: {
  engine: Engine; variantCount: number; frontNext: boolean; onEngine: (e: Engine) => void; onVariants: (n: number) => void;
}) {
  return (
    <Section title="Render">
      {/* TODO(model-studio): real-shoot, direct and native methods come after Simple is signed off. */}
      <Row label="Method"><div className="flex h-8 items-center gap-2"><Tag tone="neutral">Simple garment swap</Tag><span className="text-[12px] text-muted-foreground">product photo sets the garment</span></div></Row>
      <Row label="Front takes">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Front takes" value={variantCount} onChange={onVariants}
            options={Array.from({ length: MAX_VARIANTS }, (_, i) => ({ value: i + 1, label: String(i + 1) }))} />
          <span className="text-[12px] tabular-nums text-muted-foreground" data-testid="variant-cost">{variantCostText(variantCount)}</span>
        </div>
        {!frontNext && variantCount > 1 && <p className="mt-1 text-[11px] text-muted-foreground">Used the next time a front runs.</p>}
      </Row>
      <details className="ms-advanced mt-1 border-t border-border pt-2">
        <summary className="cursor-pointer text-[12px] font-medium text-muted-foreground select-none">Advanced · engine: {ENGINES.find((e) => e.id === engine)?.label}</summary>
        <div className="mt-2 grid gap-1.5" role="radiogroup" aria-label="Engine">
          {ENGINES.map((e) => (
            <button key={e.id} type="button" role="radio" aria-checked={engine === e.id} onClick={() => onEngine(e.id)}
              className={cn("flex h-10 items-center justify-between rounded-[10px] border px-3 text-left", engine === e.id ? "border-foreground/70" : "border-border")}>
              <span className="text-[13px] font-medium">{e.label}</span>
              <span className="text-[11px] text-muted-foreground">{e.note}</span>
            </button>
          ))}
        </div>
      </details>
    </Section>
  );
}

export function RunBar({ label, canRun, blocker, changeNote, summary, staleCount, kept, savedCount, busy, saveText, sendTo, onRun, onRedoStale, onDownload, onSave, onLoadSaved }: {
  label: string; canRun: boolean; blocker: string; changeNote: string; summary: string; staleCount: number; kept: number; savedCount: number;
  /** The Send to menu (Faire listing, ERP file); it sits first in the finished-set row. */
  sendTo?: ReactNode;
  busy: "" | "download" | "save"; saveText: string;
  onRun: () => void; onRedoStale: () => void; onDownload: () => void; onSave: () => void; onLoadSaved: () => void;
}) {
  return (
    <div className="ms-runbar space-y-2.5">
      <div className="flex flex-wrap items-center gap-2.5 rounded-[12px] border border-border bg-card p-2.5">
        <Button size="lg" className="rounded-[10px]" disabled={!canRun} onClick={onRun}><Play data-icon="inline-start" aria-hidden />{label}</Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-foreground" data-testid="run-summary">{blocker || summary}</p>
          <p className="truncate text-[11px] text-muted-foreground">{saveText}</p>
        </div>
      </div>

      {changeNote && <Alert variant="warning" className="rounded-[12px]"><AlertDescription>{changeNote}</AlertDescription></Alert>}
      {staleCount > 0 && (
        <Alert variant="info" className="rounded-[12px]">
          <AlertDescription>{staleCount} finished view{staleCount === 1 ? " was" : "s were"} made from an older front.</AlertDescription>
          <AlertAction><Button size="sm" variant="outline" onClick={onRedoStale}>Redo {staleCount} view{staleCount === 1 ? "" : "s"}</Button></AlertAction>
        </Alert>
      )}

      <div className="ms-keep grid grid-cols-2 gap-2 min-[481px]:flex min-[481px]:flex-wrap min-[481px]:items-center">
        {sendTo}
        <Button variant="outline" disabled={!kept || busy !== ""} onClick={onDownload}><Download data-icon="inline-start" aria-hidden />{busy === "download" ? "Downloading…" : `Download selected${kept ? ` (${kept})` : ""}`}</Button>
        <Button variant="outline" disabled={!kept || busy !== ""} onClick={onSave}><Save data-icon="inline-start" aria-hidden />{busy === "save" ? "Saving…" : "Save set"}</Button>
        <Button variant="ghost" disabled={!savedCount} onClick={onLoadSaved}><FolderOpen data-icon="inline-start" aria-hidden />Load saved set{savedCount ? ` (${savedCount})` : ""}</Button>
        <p className="col-span-2 text-[11px] text-muted-foreground min-[481px]:basis-full">{kept ? "Send to puts the kept views on the Faire listing or in an ERP file." : "Tick Keep on the views you want, then send, download or save them."}</p>
      </div>
    </div>
  );
}
