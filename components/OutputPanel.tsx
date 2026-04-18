"use client";

import { useEffect, useState } from "react";
import type { HistoryItem } from "./types";

interface Props {
  current: HistoryItem | null;
  history: HistoryItem[];
  onSelectHistory: (id: string) => void;
  onClearHistory: () => void;
}

export default function OutputPanel({ current, history, onSelectHistory, onClearHistory }: Props) {
  const [index, setIndex] = useState(0);

  // Whenever the current run changes (e.g. new generation, clicked a different
  // history item), reset the gallery to image 0 so we never show a stale
  // out-of-range index left over from a previous multi-variant run.
  useEffect(() => {
    setIndex(0);
  }, [current?.id]);

  // Defensive clamp — if index somehow exceeds the current run's image count,
  // fall back to 0 rather than showing undefined.
  const safeIndex =
    current && index < current.imageUrls.length ? index : 0;
  const active = current?.imageUrls[safeIndex] ?? null;

  function download(url: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `davidani-${Date.now()}.png`;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadAll() {
    if (!current) return;
    for (const [i, url] of current.imageUrls.entries()) {
      download(url);
      // small stagger so the browser doesn't block
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">
            {current ? `Run #${current.id.slice(0, 4)}` : "No runs yet"}
          </h2>
          {current && (
            <p className="text-[11px] text-neutral-500">
              {new Date(current.timestamp).toLocaleString()} · {current.modelId}
            </p>
          )}
        </div>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          {current ? "DONE" : "—"}
        </span>
      </div>

      {/* gallery thumbnails */}
      {current && current.imageUrls.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-neutral-100 px-5 py-3">
          {current.imageUrls.map((u, i) => (
            <button
              key={u}
              onClick={() => setIndex(i)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border ${
                i === safeIndex ? "border-brand-500 ring-2 ring-brand-200" : "border-neutral-200"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" />
              <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[9px] text-white">
                {i + 1}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* main preview */}
      <div className="flex min-h-0 flex-1 items-center justify-center bg-neutral-50 p-5">
        {active ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={active}
            alt="Generated output"
            className="max-h-full max-w-full rounded-lg object-contain shadow-sm"
          />
        ) : (
          <p className="text-center text-sm text-neutral-500">
            Your generations will appear here.
          </p>
        )}
      </div>

      {current && (
        <div className="flex items-center gap-2 border-t border-neutral-200 px-5 py-3">
          <button
            onClick={() => active && download(active)}
            disabled={!active}
            className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50"
          >
            Download
          </button>
          <button
            onClick={downloadAll}
            className="flex-1 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800"
          >
            Download all
          </button>
        </div>
      )}

      {/* History list */}
      <div className="flex min-h-0 flex-col border-t border-neutral-200 bg-neutral-50">
        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
            History
          </h3>
          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-800"
            >
              Clear
            </button>
          )}
        </div>
        <ul className="max-h-48 overflow-y-auto px-5 pb-4">
          {history.length === 0 && (
            <li className="text-xs text-neutral-500">No history yet.</li>
          )}
          {history.map((h) => (
            <li key={h.id}>
              <button
                onClick={() => onSelectHistory(h.id)}
                className={`my-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-white ${
                  current?.id === h.id ? "bg-white" : ""
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-brand-500" />
                <span className="font-medium">Run #{h.id.slice(0, 4)}</span>
                <span className="ml-auto text-[10px] text-neutral-500">
                  ({h.imageUrls.length})
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
