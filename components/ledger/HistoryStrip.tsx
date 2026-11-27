"use client";

import { Check, Info, Plus } from "lucide-react";
import Thumb from "@/components/Thumb";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { filterRuns, intakeShots, runTitle, runVerdict, wantsSecondLook, type LedgerFilter } from "@/lib/run-pipeline";
import { cn } from "@/lib/utils";
import type { HistoryItem } from "../types";

/**
 * Canvas-first run history: one thumbnail per run in a narrow column (a row
 * on phones), newest first. The picture is the kept take, else the first
 * take, else the garment photo while it paints. A dot in the corner carries
 * the verdict so the column reads at a glance; the hover label carries the
 * words. Replaces the wide RunLedger on Image studio so the stage gets the
 * width.
 */
export interface HistoryStripProps {
  runs: HistoryItem[];
  currentId?: string | null;
  filter: LedgerFilter;
  onFilterChange: (filter: LedgerFilter) => void;
  onSelect: (run: HistoryItem) => void;
  onNewRun?: () => void;
  title?: (run: HistoryItem) => string;
}

export default function HistoryStrip({
  runs,
  currentId,
  filter,
  onFilterChange,
  onSelect,
  onNewRun,
  title = runTitle,
}: HistoryStripProps) {
  const flagged = runs.filter(wantsSecondLook).length;
  const shown = filterRuns(runs, filter);
  return (
    <nav className="history-strip" aria-label="Run history">
      {onNewRun ? (
        <button type="button" className="history-strip__new" onClick={onNewRun} aria-label="New run" title="New run">
          <Plus className="size-4" aria-hidden />
        </button>
      ) : null}
      {flagged > 0 || filter !== "all" ? (
        <button
          type="button"
          className="history-strip__filter"
          aria-pressed={filter === "check"}
          onClick={() => onFilterChange(filter === "check" ? "all" : "check")}
          title={filter === "check" ? "Show every run" : "Show only runs to check"}
        >
          {filter === "check" ? "All" : `${flagged} check`}
        </button>
      ) : runs.length === 0 ? null : (
        <span className="history-strip__count">{runs.length} {runs.length === 1 ? "run" : "runs"}</span>
      )}
      {shown.length === 0 ? (
        <p className="history-strip__empty">{runs.length === 0 ? "No runs yet" : "Nothing to check"}</p>
      ) : null}
      {shown.map((run) => (
        <HistoryThumb
          key={run.id}
          run={run}
          active={run.id === currentId}
          label={title(run)}
          onSelect={() => onSelect(run)}
        />
      ))}
    </nav>
  );
}

function HistoryThumb({
  run,
  active,
  label,
  onSelect,
}: {
  run: HistoryItem;
  active: boolean;
  label: string;
  onSelect: () => void;
}) {
  const verdict = runVerdict(run);
  const picked = run.abTest?.selectedImage;
  const kept = picked === "right" ? run.imageUrls[1] : picked === "left" ? run.imageUrls[0] : undefined;
  const src = kept ?? run.imageUrls[0] ?? intakeShots(run)[0]?.url ?? null;
  const painting = verdict.tone === "running";
  const time = new Date(run.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="history-strip__thumb"
            aria-current={active ? "true" : undefined}
            aria-label={`${label}, ${verdict.label}, ${time}`}
            onClick={onSelect}
          />
        }
      >
        <span className={cn("history-strip__img", painting && "is-painting")}>
          <Thumb src={src} size={120} alt="" fallback={<span className="history-strip__blank" aria-hidden />} />
        </span>
        <StatusDot tone={verdict.tone} />
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        <span className="flex flex-col items-start leading-tight">
          <span>
            {run.styleNumber ? `${run.styleNumber} · ` : ""}
            {verdict.label}
          </span>
          <span className="text-[11px] font-normal opacity-70">
            {label} · {time}
          </span>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function StatusDot({ tone }: { tone: ReturnType<typeof runVerdict>["tone"] }) {
  if (tone === "clean") return null;
  return (
    <span className={cn("history-strip__dot", `is-${tone}`)} aria-hidden>
      {tone === "running" ? <Spinner className="size-2.5" /> : null}
      {tone === "kept" ? <Check className="size-2.5" strokeWidth={3} /> : null}
      {tone === "check" ? <Info className="size-2.5" strokeWidth={3} /> : null}
    </span>
  );
}
