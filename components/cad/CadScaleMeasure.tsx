"use client";

import { useEffect, useRef, useState } from "react";
import { repeatCmToDpi } from "@/lib/cad-export";

interface Pt {
  x: number; // fraction 0..1 of displayed width
  y: number; // fraction 0..1 of displayed height
}
interface Line {
  a: Pt;
  b: Pt;
}

interface Props {
  imageUrl: string;
  onChange: (scale: { repeatCm: number; dpi: number } | null) => void;
}

const DEFAULT_REF: Line = { a: { x: 0.2, y: 0.15 }, b: { x: 0.5, y: 0.15 } };
const DEFAULT_REPEAT: Line = { a: { x: 0.2, y: 0.6 }, b: { x: 0.5, y: 0.6 } };

type Handle = { line: "ref" | "rep"; end: "a" | "b" } | null;

export default function CadScaleMeasure({ imageUrl, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ref, setRef] = useState<Line>(DEFAULT_REF);
  const [rep, setRep] = useState<Line>(DEFAULT_REPEAT);
  const [refCm, setRefCm] = useState<string>("");
  const [drag, setDrag] = useState<Handle>(null);

  function pxLen(line: Line): number {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const dx = (line.a.x - line.b.x) * rect.width;
    const dy = (line.a.y - line.b.y) * rect.height;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const refPx = pxLen(ref);
  const repPx = pxLen(rep);
  const cm = parseFloat(refCm);
  const repeatCm = cm > 0 && refPx > 0 && repPx > 0 ? (repPx / refPx) * cm : null;
  const dpi = repeatCm ? repeatCmToDpi(repeatCm) : null;

  useEffect(() => {
    onChange(repeatCm && dpi ? { repeatCm, dpi } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatCm, dpi]);

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const setter = drag.line === "ref" ? setRef : setRep;
    setter((cur) => ({ ...cur, [drag.end]: { x, y } }));
  }

  function handle(line: "ref" | "rep", end: "a" | "b", color: string) {
    const src = line === "ref" ? ref : rep;
    const p = src[end];
    return (
      <circle
        cx={`${p.x * 100}%`}
        cy={`${p.y * 100}%`}
        r={9}
        fill="white"
        stroke={color}
        strokeWidth={3}
        style={{ cursor: "grab" }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          setDrag({ line, end });
        }}
        onPointerUp={() => setDrag(null)}
      />
    );
  }

  function lineEl(line: Line, color: string, dashed: boolean) {
    return (
      <line
        x1={`${line.a.x * 100}%`}
        y1={`${line.a.y * 100}%`}
        x2={`${line.b.x * 100}%`}
        y2={`${line.b.y * 100}%`}
        stroke={color}
        strokeWidth={2.5}
        strokeDasharray={dashed ? "8 6" : undefined}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div
        ref={wrapRef}
        className="relative select-none overflow-hidden rounded-lg border border-neutral-200"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setDrag(null)}
      >
        <img src={imageUrl} alt="Garment for measuring" className="block w-full" draggable={false} />
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {lineEl(ref, "#0e7490", false)}
          {lineEl(rep, "#b45309", true)}
          <g className="pointer-events-auto">
            {handle("ref", "a", "#0e7490")}
            {handle("ref", "b", "#0e7490")}
            {handle("rep", "a", "#b45309")}
            {handle("rep", "b", "#b45309")}
          </g>
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded bg-cyan-700" /> Reference
        </span>
        <label className="inline-flex items-center gap-1.5">
          real length
          <input
            type="number"
            inputMode="decimal"
            value={refCm}
            onChange={(e) => setRefCm(e.target.value)}
            placeholder="cm"
            className="w-20 rounded border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-brand-500"
          />
          cm
        </label>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t-2 border-dashed border-amber-700" /> Repeat span
        </span>
      </div>

      <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
        {repeatCm && dpi ? (
          <span>
            Print at <b>{repeatCm.toFixed(1)} × {repeatCm.toFixed(1)} cm</b> → <b>{dpi} DPI</b> (2048px tile)
          </span>
        ) : (
          <span className="text-neutral-400">
            Drag the cyan line across a known dimension and enter its cm, then drag the dashed line from one
            motif to the next. Measure both on a flat-facing area to avoid perspective skew.
          </span>
        )}
      </div>
    </div>
  );
}
