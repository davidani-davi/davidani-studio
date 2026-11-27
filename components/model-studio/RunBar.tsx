"use client";

// The run controls: method, engine (Advanced) and front takes for Setup; the floating run bar with the one Generate
// button the core decides (front preview first, then "Generate remaining N") and what to do with the finished set.
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

/**
 * Canvas-first: the bar floats over the foot of the stage (fixed to the bottom on phones). It holds what every run
 * needs in view: the garment photos it will use, the setup as one line, the Generate button the core decides, and
 * what to do with the finished set. Everything else lives in Setup.
 */
export function RunBar({ label, canRun, blocker, changeNote, summary, recipe, front, back, staleCount, kept, savedCount, busy, saveText, sendTo, onRun, onRedoStale, onDownload, onSave, onLoadSaved, onSetup }: {
  label: string; canRun: boolean; blocker: string; changeNote: string; summary: string; staleCount: number; kept: number; savedCount: number;
  /** The setup as one line (person, look, engine, photos), so a run on the wrong person shows before it starts. */
  recipe: string;
  /** Thumbnails of the photos assigned as Front and Back ("" when empty). */
  front: string; back: string;
  /** The Send to menu (Faire listing, ERP file); it sits first in the finished-set row. */
  sendTo?: ReactNode;
  busy: "" | "download" | "save"; saveText: string;
  onRun: () => void; onRedoStale: () => void; onDownload: () => void; onSave: () => void; onLoadSaved: () => void; onSetup: () => void;
}) {
  const slot = (src: string, name: string) => (
    <button type="button" onClick={onSetup} className={cn("ms-bar__slot", !src && "is-empty")} aria-label={`${name} photo: ${src ? "change in Setup" : "pick in Setup"}`}>
      {src ? <img src={src} alt="" /> : <span aria-hidden>{name[0]}</span>}
    </button>
  );
  return (
    <div className="ms-bar" role="region" aria-label="Run">
      {(changeNote || staleCount > 0) && (
        <div className="ms-bar__notes">
          {changeNote && <Alert variant="warning" className="rounded-[12px]"><AlertDescription>{changeNote}</AlertDescription></Alert>}
          {staleCount > 0 && (
            <Alert variant="info" className="rounded-[12px]">
              <AlertDescription>{staleCount} finished view{staleCount === 1 ? " was" : "s were"} made from an older front.</AlertDescription>
              <AlertAction><Button size="sm" variant="outline" onClick={onRedoStale}>Redo {staleCount} view{staleCount === 1 ? "" : "s"}</Button></AlertAction>
            </Alert>
          )}
        </div>
      )}
      <div className="ms-bar__main">
        <div className="ms-bar__slots">{slot(front, "Front")}{slot(back, "Back")}</div>
        <div className="ms-bar__text">
          <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-foreground" data-testid="recipe">{recipe}</p>
          <p className="truncate text-[12px] text-muted-foreground" data-testid="run-summary">{blocker || summary}</p>
        </div>
        <Button size="lg" className="ms-bar__run rounded-[10px]" disabled={!canRun} onClick={onRun}><Play data-icon="inline-start" aria-hidden />{label}</Button>
      </div>
      <div className="ms-bar__keep">
        {sendTo}
        <Button size="sm" variant="outline" disabled={!kept || busy !== ""} onClick={onDownload} title={kept ? undefined : "Tick Keep on the views you want first."}>
          <Download data-icon="inline-start" aria-hidden />{busy === "download" ? "Downloading…" : `Download${kept ? ` (${kept})` : ""}`}
        </Button>
        <Button size="sm" variant="outline" disabled={!kept || busy !== ""} onClick={onSave} title={kept ? undefined : "Tick Keep on the views you want first."}>
          <Save data-icon="inline-start" aria-hidden />{busy === "save" ? "Saving…" : "Save set"}
        </Button>
        <Button size="sm" variant="ghost" disabled={!savedCount} onClick={onLoadSaved}><FolderOpen data-icon="inline-start" aria-hidden />Load saved{savedCount ? ` (${savedCount})` : ""}</Button>
        <span className="ms-bar__saved truncate text-[11px] text-muted-foreground">{saveText}</span>
      </div>
    </div>
  );
}
