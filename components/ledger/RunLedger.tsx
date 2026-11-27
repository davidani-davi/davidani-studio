"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Plus } from "lucide-react";
import RunCard, { type RunCardProps } from "./RunCard";
import type { HistoryItem } from "../types";
import { filterRuns, wantsSecondLook, type LedgerFilter } from "@/lib/run-pipeline";

/**
 * The left column: every run that has happened, newest first, with the
 * composer docked underneath.
 *
 * This replaces both the old setup rail and the output panel's history list.
 * Those were two views of the same session in two places, and neither could
 * answer the question that actually comes up — did the change I just made help
 * — because the previous run was never on screen next to the current one.
 */

const FILTERS: Array<{ value: LedgerFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "kept", label: "Kept" },
  { value: "check", label: "Check" },
];

/**
 * Below 1024px the shell stacks (globals.css) and the stage sits under the
 * composer, so a pressed card changed a pane the phone couldn't see and the tap
 * looked dead. Scroll the stage up to meet it, as ModelAdmin does for its
 * detail pane.
 */
function revealStage() {
  if (!window.matchMedia?.("(max-width: 1023px)").matches) return;
  document.querySelector(".image-studio-stage")?.scrollIntoView({ block: "start", behavior: "smooth" });
}

export default function RunLedger({
  runs,
  currentId,
  runningId,
  filter,
  onFilterChange,
  onSelect,
  onClearHistory,
  onNewRun,
  composer,
  card,
  emptyHint = "No runs yet. Add a product photo below and press Generate.",
  checkHint = "Nothing is flagged. Every run landed on a canvas something backed, with a clean backdrop.",
}: {
  runs: HistoryItem[];
  currentId: string | null;
  /** The run currently being generated, so its card can say so. */
  runningId?: string | null;
  filter: LedgerFilter;
  onFilterChange: (filter: LedgerFilter) => void;
  onSelect: (id: string) => void;
  onClearHistory: () => void;
  /** Empty the composer and abandon any run still marked pending. */
  onNewRun?: () => void;
  composer: ReactNode;
  /** How this studio reads a run — see RunCard. Image Studio's default. */
  card?: { pipeline?: RunCardProps["pipeline"]; title?: RunCardProps["title"]; maxSlots?: number };
  /** What an empty ledger says. The default speaks of product photos. */
  emptyHint?: string;
  /** What an empty "Check" filter says — the checks differ per studio. */
  checkHint?: string;
}) {
  const shown = filterRuns(runs, filter);
  const flagged = runs.filter(wantsSecondLook).length;

  const feed = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  // Reserve the measured composer height so the last image remains reachable.
  const [dockHeight, setDockHeight] = useState(0);

  useEffect(() => {
    const el = dock.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setDockHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <aside className="image-studio-ledger relative flex h-full min-h-0 flex-col bg-[#fafafa]">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-white px-3 py-2">
        <span className="text-[13px] font-medium text-foreground">Run ledger</span>
        <span className="flex-1" />
        {onNewRun && (
          <button
            type="button"
            onClick={onNewRun}
            title="Clear the composer and start a fresh run"
            className="inline-flex h-7 items-center gap-1 rounded-lg bg-white px-2.5 text-xs font-medium text-foreground shadow-[0_0_0_1px_rgb(0_0_0/.08),0_1px_2px_rgb(0_0_0/.05)] transition hover:bg-muted"
          >
            <Plus className="size-3.5" aria-hidden />
            New
          </button>
        )}
        {/*
          beUI Tabs, segment variant: the active chip is a shared-layout
          element, so switching filters glides the black pill across instead of
          repainting two buttons. Controlled — the filter lives in page state
          because the ledger is not the only thing that reads it.
        */}
        <Tabs value={filter} onValueChange={(v) => onFilterChange(v as LedgerFilter)} variant="segment">
          <TabsList className="rounded-[10px] bg-muted p-0.5">
            {FILTERS.map((f) => (
              <TabsTrigger
                key={f.value}
                value={f.value}
                className={`h-7 gap-1 rounded-lg px-2.5 py-0 text-xs font-medium ${
                  filter === f.value ? "text-foreground" : ""
                }`}
                indicatorClassName="rounded-lg bg-white shadow-[0_0_0_1px_rgb(0_0_0/.06),0_1px_2px_rgb(0_0_0/.08)]"
              >
                {f.label}
                {f.value === "check" && flagged ? (
                  <span
                    className="rounded-md bg-[#fdf3e1] px-1 text-[11px] tabular-nums text-[#8a5a12]"
                  >
                    {flagged}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div
        ref={feed}
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3"
        style={{ paddingBottom: dockHeight + 12 }}
      >
        {shown.map((run) => (
          <RunCard
            key={run.id}
            run={run}
            active={run.id === currentId}
            running={run.id === runningId}
            onSelect={() => {
              onSelect(run.id);
              revealStage();
            }}
            {...card}
          />
        ))}

        {shown.length === 0 && (
          <p className="px-4 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
            {runs.length === 0
              ? emptyHint
              : filter === "check"
              ? checkHint
              : "No kept runs yet. Press Keep on a variant to mark it."}
          </p>
        )}

        {runs.length > 0 && (
          <button
            type="button"
            onClick={onClearHistory}
            className="mt-1 shrink-0 self-center rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Clear {runs.length} run{runs.length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      <div ref={dock} className="paper-composer-dock absolute inset-x-0 bottom-0 z-20">
        {composer}
      </div>
    </aside>
  );
}
