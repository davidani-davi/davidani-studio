"use client";

import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import RunCard from "./RunCard";
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

export default function RunLedger({
  runs,
  currentId,
  runningId,
  filter,
  onFilterChange,
  onSelect,
  onClearHistory,
  composer,
}: {
  runs: HistoryItem[];
  currentId: string | null;
  /** The run currently being generated, so its card can say so. */
  runningId?: string | null;
  filter: LedgerFilter;
  onFilterChange: (filter: LedgerFilter) => void;
  onSelect: (id: string) => void;
  onClearHistory: () => void;
  composer: ReactNode;
}) {
  const shown = filterRuns(runs, filter);
  const flagged = runs.filter(wantsSecondLook).length;

  return (
    <aside className="image-studio-ledger flex h-full min-h-0 flex-col bg-neutral-50">
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2.5">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
          Run ledger
        </span>
        <span className="flex-1" />
        {/*
          beUI Tabs, segment variant: the active chip is a shared-layout
          element, so switching filters glides the black pill across instead of
          repainting two buttons. Controlled — the filter lives in page state
          because the ledger is not the only thing that reads it.
        */}
        <Tabs value={filter} onValueChange={(v) => onFilterChange(v as LedgerFilter)} variant="segment">
          <TabsList className="border border-neutral-200 bg-neutral-100/70">
            {FILTERS.map((f) => (
              <TabsTrigger
                key={f.value}
                value={f.value}
                className="gap-1 px-2.5 py-1 text-[10px] font-bold"
              >
                {f.label}
                {f.value === "check" && flagged ? (
                  <span
                    className={`font-mono text-[9px] ${
                      filter === "check" ? "text-white/70" : "text-amber-600"
                    }`}
                  >
                    {flagged}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {shown.map((run) => (
          <RunCard
            key={run.id}
            run={run}
            active={run.id === currentId}
            running={run.id === runningId}
            onSelect={() => onSelect(run.id)}
          />
        ))}

        {shown.length === 0 && (
          <p className="px-1 py-6 text-center text-[11px] leading-relaxed text-neutral-500">
            {runs.length === 0
              ? "No runs yet. Add a product photo below and press Generate."
              : filter === "check"
              ? "Nothing is flagged. Every run landed on a canvas something backed, with a clean backdrop."
              : "No kept runs yet. Press Keep on a variant to mark it."}
          </p>
        )}

        {runs.length > 0 && (
          <button
            type="button"
            onClick={onClearHistory}
            className="mt-1 shrink-0 self-center rounded-md px-2 py-1 text-[9.5px] font-semibold text-neutral-400 transition hover:text-neutral-700"
          >
            Clear {runs.length} run{runs.length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {composer}
    </aside>
  );
}
