"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/motion/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import RunCard, { type RunCardProps } from "./RunCard";
import type { HistoryItem } from "../types";
import { filterRuns, wantsSecondLook, type LedgerFilter } from "@/lib/run-pipeline";
import { nextDockHidden } from "@/lib/scroll-dock";

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
  const lastTop = useRef(0);
  const [ducked, setDucked] = useState(false);
  /**
   * The composer's height, mirrored onto the feed as bottom padding.
   *
   * The composer is positioned rather than laid out, so it can slide clear of
   * the column without the feed reflowing under it mid-scroll — a height
   * animation would change the scroll metrics on every frame of the thing that
   * is being scrolled. The padding is what keeps the last run reachable, and
   * it stays put whether the composer is up or down so the scroll position
   * does not jump when it ducks.
   */
  const [dockHeight, setDockHeight] = useState(0);
  const dockHeightRef = useRef(0);
  dockHeightRef.current = dockHeight;

  useEffect(() => {
    const el = dock.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setDockHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = feed.current;
    if (!el) return;
    const top = el.scrollTop;
    // Read into a local BEFORE the ref is advanced. Passing `lastTop.current`
    // into the updater meant React read it whenever it got around to running
    // the updater — by which time the line below had already set it to `top`,
    // so the delta was always zero and the composer never moved.
    const previous = lastTop.current;
    // Minus the dock's own reserved space: that padding is not content, and
    // counting it made a feed holding one short run look scrollable enough to
    // duck the composer away from nothing.
    const overflow = el.scrollHeight - el.clientHeight - dockHeightRef.current;
    lastTop.current = top;
    setDucked((hidden) => nextDockHidden({ hidden, top, lastTop: previous, overflow }));
  }, []);

  return (
    <aside className="image-studio-ledger relative flex h-full min-h-0 flex-col bg-neutral-50">
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2.5">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
          Run ledger
        </span>
        <span className="flex-1" />
        {onNewRun && (
          <button
            type="button"
            onClick={onNewRun}
            title="Clear the composer and start a fresh run"
            className="rounded-[3px] border border-neutral-200 bg-white px-2 py-1 text-[10px] font-bold text-neutral-700 transition hover:border-neutral-400 hover:text-black"
          >
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

      <div
        ref={feed}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3"
        style={{ paddingBottom: dockHeight + 12 }}
      >
        {shown.map((run) => (
          <RunCard
            key={run.id}
            run={run}
            active={run.id === currentId}
            running={run.id === runningId}
            onSelect={() => onSelect(run.id)}
            {...card}
          />
        ))}

        {shown.length === 0 && (
          <p className="px-1 py-6 text-center text-[11px] leading-relaxed text-neutral-500">
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
            className="mt-1 shrink-0 self-center rounded-md px-2 py-1 text-[9.5px] font-semibold text-neutral-400 transition hover:text-neutral-700"
          >
            Clear {runs.length} run{runs.length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {/*
        The way back up, drawn.

        Ducked, the composer is entirely off the column, and "scroll up" is a
        gesture nobody is told about. A run ledger you cannot get the composer
        back from is the same dead end the opened intake photo was.
      */}
      {/* beUI Button, primary: it is the one thing to press on a ledger whose
          composer has left the screen, and it presses like every other. */}
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => setDucked(false)}
        tabIndex={ducked ? 0 : -1}
        aria-hidden={!ducked}
        className={`absolute inset-x-0 bottom-3 z-30 mx-auto w-fit gap-1.5 rounded-full px-3.5 text-[11px] font-bold shadow-lg transition-[opacity,transform] duration-200 motion-reduce:transition-none ${
          ducked ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        <span aria-hidden="true" className="text-[12px] leading-none">
          ↑
        </span>
        New run
      </Button>

      {/*
        Focus brings it back: hidden it is still in the tab order, and tabbing
        into a control that is off the bottom of the column is the one way this
        could strand someone.
      */}
      <div
        ref={dock}
        onFocusCapture={() => setDucked(false)}
        className={`absolute inset-x-0 bottom-0 z-20 transition-transform duration-300 ease-out motion-reduce:transition-none ${
          ducked ? "translate-y-full" : "translate-y-0"
        }`}
      >
        {composer}
      </div>
    </aside>
  );
}
