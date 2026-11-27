"use client";

// The style's workspace record: read once when a style opens, then saved ~600 ms after each change. A save built
// on an older revision comes back 409 with the saved record; the page then asks "Keep my setup / Use saved version".
import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioState } from "@/lib/model-studio/types";
import { ApiError, saveWorkspace } from "./api";

export type SaveStatus = "idle" | "saving" | "saved" | "error";
export interface Conflict { revision: number; savedAt: string | null; studio: StudioState | null }

export const SAVE_DEBOUNCE_MS = 600;

export function useWorkspace(state: StudioState | null) {
  const revision = useRef(0);
  const skip = useRef(true);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [error, setError] = useState("");

  /** A record was just loaded (or adopted): remember its revision and do not save it straight back. */
  const adopt = useCallback((rev: number, at: string | null) => {
    revision.current = rev;
    skip.current = true;
    setSavedAt(at);
    setConflict(null);
    setStatus(rev ? "saved" : "idle");
  }, []);

  const save = useCallback(async (studio: StudioState, onRevision = revision.current) => {
    setStatus("saving");
    try {
      const r = await saveWorkspace(studio.style, onRevision, studio);
      revision.current = r.revision;
      setSavedAt(r.savedAt);
      setStatus("saved");
      setError("");
      setConflict(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const current = (err.body.current || null) as { revision?: number; savedAt?: string; studio?: StudioState } | null;
        setConflict({ revision: current?.revision ?? 0, savedAt: current?.savedAt ?? null, studio: current?.studio ?? null });
        setStatus("error");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not save this setup.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!state?.style) return;
    if (skip.current) { skip.current = false; return; }
    if (conflict) return; // the banner decides first
    const t = setTimeout(() => void save(state), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [state, conflict, save]);

  /** Keep my setup: save it on top of the newer revision. */
  const keepMine = useCallback(() => {
    if (!state || !conflict) return;
    const rev = conflict.revision;
    setConflict(null);
    skip.current = true;
    void save(state, rev);
  }, [state, conflict, save]);

  return { status, savedAt, conflict, error, adopt, keepMine, revision };
}
