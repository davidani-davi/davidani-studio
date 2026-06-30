"use client";

import { useState } from "react";

interface Props {
  imageUrl: string;
  scale: { repeatCm: number; dpi: number } | null;
  spec: { repeatType: string; palette: { hex: string; name: string }[]; colorCount: number } | null;
}

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function CadExportPanel({ imageUrl, scale, spec }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const palette = spec?.palette ?? [];

  async function exportFiles() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cad-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          repeatCm: scale?.repeatCm ?? null,
          dpi: scale?.dpi ?? null,
          repeatType: spec?.repeatType ?? "unknown",
          palette,
          colorCount: spec?.colorCount ?? palette.length,
        }),
      });
      const raw = await res.text();
      let data: any;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Export: server returned non-JSON (${res.status})`);
      }
      if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const stamp = scale ? `${scale.repeatCm.toFixed(1)}cm-${scale.dpi}dpi` : "no-scale";
      triggerDownload(data.printFile, `davidani-print-${stamp}.png`);
      triggerDownload(data.specSheet, `davidani-spec-${stamp}.png`);
    } catch (e: any) {
      setError(e?.message || "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">Print spec</h3>

      <dl className="space-y-1 text-xs text-neutral-700">
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Repeat</dt>
          <dd>{scale ? `${scale.repeatCm.toFixed(1)} × ${scale.repeatCm.toFixed(1)} cm · ${scale.dpi} DPI` : "scale not set"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Size</dt>
          <dd>2048 × 2048 px</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Type</dt>
          <dd>{spec?.repeatType ?? "unknown"}</dd>
        </div>
      </dl>

      {palette.length ? (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
            Colorway ({spec?.colorCount ?? palette.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {palette.slice(0, 12).map((c, i) => (
              <span key={`${c.hex}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-2 py-1">
                <span className="h-3 w-3 rounded-full border border-neutral-300" style={{ backgroundColor: c.hex }} />
                <span className="font-mono text-[10px]">{c.hex}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {!scale ? (
        <p className="text-[11px] text-amber-700">No scale set — the export won't carry a physical print size. Measure above to add it.</p>
      ) : null}

      {scale &&
      spec?.repeatType &&
      !["full repeat", "all-over", "unknown"].includes(spec.repeatType.toLowerCase()) ? (
        <p className="text-[11px] text-amber-700">
          Repeat type "{spec.repeatType}" is not a simple square repeat — the true vertical repeat may differ from
          the {scale.repeatCm.toFixed(1)} cm measured here. Confirm the vertical repeat before sending to print.
        </p>
      ) : null}

      <button
        type="button"
        onClick={exportFiles}
        disabled={busy}
        className="w-full rounded-xl bg-gradient-to-b from-neutral-800 to-neutral-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-neutral-700 hover:to-neutral-900 disabled:opacity-60"
      >
        {busy ? "Preparing…" : "Export print file + spec"}
      </button>

      {error ? <p className="text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}
