"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "Photos in this set" (Model Studio sidebar, recast sets only): every photo of the selected view with Download,
 * Replace photo and Undo. Download saves the stored photo as is; Replace sends an edited one back
 * (POST /api/user-models/<id>/poses/<poseId>). Its face outline is carried over when the edit kept the photo's shape;
 * when it did not, Studio asks before finding a new one, because that is a paid fal call.
 */
type View = "front" | "side" | "back" | "full";
interface Row {
  id: string;
  view: "front" | "side" | "back";
  framing: string;
  stance: string;
  arms: string;
  url: string;
  thumbUrl?: string;
  default: View[];
  live: boolean;
  checks: { pass: boolean; outline?: { ok: boolean; reason?: string } };
  removed?: { by: string; at: string };
  replaced?: { by: string; at: string };
  canUndo: boolean;
}

// Vercel refuses request bodies over 4.5 MB, so a larger edit is sent as a high-quality JPEG of the same size.
const UPLOAD_LIMIT = 4_200_000;
const MAX_SIDE = 4096;

async function fitForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (file.size <= UPLOAD_LIMIT && scale === 1) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.95, 0.9, 0.85]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= UPLOAD_LIMIT) return blob;
  }
  throw new Error("This photo is too large to send even as a JPEG. Save it smaller and try again.");
}

async function download(url: string, filename: string) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const object = URL.createObjectURL(await res.blob());
    const link = document.createElement("a");
    link.href = object;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(object), 10_000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

const extOf = (url: string) => (url.match(/\.(png|jpe?g|webp)(?:\?|$)/i)?.[1] || "png").toLowerCase();
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function status(row: Row, view: View): string {
  if (row.removed) return "Removed";
  if (!row.live) return row.checks.outline?.ok === false ? "Not used: no face outline" : "Not used: failed checks";
  return row.default.includes(view) ? "Default for this view" : "Can be picked";
}

export default function SetPhotos({ modelId, setName, view, onChanged }: {
  modelId: string;
  setName: string;
  view: View;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ poseId: string; text: string; tone: "ok" | "error" } | null>(null);
  const [confirm, setConfirm] = useState<{ poseId: string; blob: Blob; reason: string } | null>(null);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch(`/api/user-models/${encodeURIComponent(modelId)}/poses`, { cache: "no-store" });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "Could not load the photos.");
      setRows(data.poses);
    } catch (err: any) {
      setError(err?.message || "Could not load the photos.");
    }
  }, [modelId]);

  useEffect(() => {
    setRows(null);
    setMessage(null);
    setConfirm(null);
    void load();
  }, [load]);

  async function send(poseId: string, blob: Blob, autoOutline: boolean) {
    setBusy(poseId);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", blob, `${poseId}.${blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png"}`);
      if (autoOutline) form.append("autoOutline", "1");
      const res = await fetch(`/api/user-models/${encodeURIComponent(modelId)}/poses/${encodeURIComponent(poseId)}`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      if (data?.needsAutoOutline) {
        setConfirm({ poseId, blob, reason: data.reason });
        return;
      }
      if (!data?.ok) throw new Error(data?.error || "Could not replace the photo.");
      setConfirm(null);
      setMessage({ poseId, text: "Replaced. New shots use this photo.", tone: "ok" });
      await load();
      onChanged();
    } catch (err: any) {
      setMessage({ poseId, text: err?.message || "Could not replace the photo.", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function choose(poseId: string, file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage({ poseId, text: "Choose a PNG, JPEG or WebP photo.", tone: "error" });
      return;
    }
    setBusy(poseId);
    try {
      const blob = await fitForUpload(file);
      await send(poseId, blob, false);
    } catch (err: any) {
      setMessage({ poseId, text: err?.message || "Could not read that photo.", tone: "error" });
      setBusy(null);
    }
  }

  async function undo(poseId: string) {
    setBusy(poseId);
    setMessage(null);
    try {
      const res = await fetch(`/api/user-models/${encodeURIComponent(modelId)}/poses/${encodeURIComponent(poseId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ undo: true }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (!data?.ok) throw new Error(data?.error || "Could not undo.");
      setMessage({ poseId, text: "The previous photo is back.", tone: "ok" });
      await load();
      onChanged();
    } catch (err: any) {
      setMessage({ poseId, text: err?.message || "Could not undo.", tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  const poseView = view === "full" ? "front" : view;
  const shown = (rows || []).filter((r) => r.view === poseView);
  const button = "rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="mt-4">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="block text-[10px] font-medium text-neutral-500">Photos in this set · {poseView}</span>
        {rows && <span className="text-[10px] text-neutral-400">{shown.length}</span>}
      </div>
      {error ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-[11px] text-neutral-600">
          {error}{" "}
          <button type="button" onClick={() => void load()} className="font-semibold text-neutral-900 underline">Try again</button>
        </div>
      ) : !rows ? (
        <div className="grid grid-cols-2 gap-2" aria-busy="true" aria-label="Loading photos">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[2/3] animate-pulse rounded-lg bg-neutral-100" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-md border border-neutral-200 p-3 text-[11px] text-neutral-500">This set has no {poseView} photos.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {shown.map((row) => {
            const working = busy === row.id;
            const note = message?.poseId === row.id ? message : null;
            const asking = confirm?.poseId === row.id ? confirm : null;
            return (
              <div key={row.id} className={`overflow-hidden rounded-lg border border-neutral-200 bg-white ${row.live && !row.removed ? "" : "opacity-70"}`}>
                <div className="relative aspect-[2/3] bg-neutral-100">
                  {!loaded[row.id] && <div className="absolute inset-0 animate-pulse bg-neutral-100" />}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={row.thumbUrl || row.url}
                    alt={`${setName} ${row.id}`}
                    loading="lazy"
                    onLoad={() => setLoaded((l) => ({ ...l, [row.id]: true }))}
                    onError={() => setLoaded((l) => ({ ...l, [row.id]: true }))}
                    className={`h-full w-full object-cover transition-opacity duration-300 ${loaded[row.id] ? "opacity-100" : "opacity-0"}`}
                  />
                  {working && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-[11px] font-medium text-neutral-700">Saving…</div>
                  )}
                </div>
                <div className="space-y-1.5 p-2">
                  <div className="text-[11px] font-semibold text-neutral-800">{row.id}</div>
                  <div className="text-[10px] leading-snug text-neutral-500">
                    {row.framing} · {row.stance}
                    <br />
                    {status(row, view)}
                    {row.replaced && <><br />Replaced {shortDate(row.replaced.at)}</>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button type="button" className={button} disabled={working}
                      onClick={() => void download(row.url, `${setName.replace(/[^\w-]+/g, "-")}-${row.id}.${extOf(row.url)}`)}>
                      Download
                    </button>
                    <button type="button" className={button} disabled={working || Boolean(busy)} onClick={() => inputs.current[row.id]?.click()}>
                      Replace
                    </button>
                    {row.canUndo && (
                      <button type="button" className={button} disabled={working || Boolean(busy)} onClick={() => void undo(row.id)}>
                        Undo
                      </button>
                    )}
                    <input
                      ref={(el) => { inputs.current[row.id] = el; }}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        void choose(row.id, file);
                      }}
                    />
                  </div>
                  {asking && (
                    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-2 text-[10px] leading-snug text-neutral-700">
                      Not saved yet: {asking.reason}. Studio can find a new face outline with one paid fal call (under 1¢).
                      <div className="mt-1.5 flex gap-1">
                        <button type="button" className="rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                          disabled={working} onClick={() => void send(row.id, asking.blob, true)}>
                          Find outline and save
                        </button>
                        <button type="button" className={button} disabled={working} onClick={() => setConfirm(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                  {note && (
                    <p className={`text-[10px] leading-snug ${note.tone === "error" ? "text-red-700" : "text-neutral-600"}`} role="status">{note.text}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
        Download a photo, edit it, then Replace. Keep the same shape so its face outline carries over. Undo puts the old photo back.
      </p>
    </div>
  );
}
