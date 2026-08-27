"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { StatefulButton } from "@/components/motion/button";
import { Input } from "@/components/motion/input";

/**
 * Choose an intake photo from a style's own ERP gallery.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every intake photo so far has been a phone shot dragged in from Downloads.
 * The ERP already holds the shoot for the style — the same frames the line
 * sheet and the Faire listing are built from — and going through the desktop
 * to get one of them in here loses the style number on the way, which is the
 * input that buys the approved flat lay.
 *
 * Opened per slot, so "front" and "back" each search on their own and land
 * where they were opened from.
 */

export interface ErpPhotoOption {
  index: number | null;
  label: string;
  /** Proxied through our server: ERP images sit behind the ERP's session. */
  thumb: string;
  /** The ERP original. Sent back on pick; never loaded by the browser. */
  full: string;
  isSquareHero: boolean;
  strengths: string[];
  warnings: string[];
}

export interface ErpStyleResult {
  style: string;
  regularizedFrom: string | null;
  squareThumbnail: {
    name: string;
    colorway: string;
    index: number | null;
    strengths: string[];
    warnings: string[];
  } | null;
  groups: Array<{ colorway: string; foreign: boolean; photos: ErpPhotoOption[] }>;
}

export default function ErpPicker({
  slot,
  initialStyle,
  onPick,
  onClose,
}: {
  slot: "front" | "back";
  initialStyle: string;
  /** Resolves once the photo is in the studio, so the picker can close itself. */
  onPick: (photo: ErpPhotoOption, style: string) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialStyle);
  const [result, setResult] = useState<ErpStyleResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  const search = useCallback(async (style: string) => {
    const key = style.trim();
    if (!key) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/erp/photos?style=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not reach the ERP.");
      setResult(data);
    } catch (err: any) {
      setError(err.message ?? "Could not reach the ERP.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Opened from a slot with the style number already typed, the search the
  // operator wants has no other possible argument — so run it.
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
    if (initialStyle.trim()) void search(initialStyle);
  }, [initialStyle, search]);

  const empty = result && result.groups.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-neutral-200 px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search(query);
          }}
          className="flex items-center gap-2"
        >
          {/*
            beUI Input and StatefulButton, same as the composer's Generate:
            the search is a round trip to the ERP that takes about a second,
            and the button carries that itself rather than this panel owning a
            separate spinner. The error rides the field, where it shakes it.
          */}
          <Input
            ref={field}
            value={query}
            onChange={setQuery}
            error={error ?? false}
            leftIcon={<Search />}
            placeholder="DWTS67099"
            spellCheck={false}
            autoCapitalize="characters"
            aria-label={`Style number to search for the ${slot} photo`}
            className="min-w-0 flex-1"
            classNames={{
              field: "h-10 rounded-lg bg-white",
              input: "font-mono text-[13px] uppercase tracking-wide",
              errorMessage: "text-[11px]",
            }}
          />
          <StatefulButton
            type="submit"
            state={loading ? "loading" : "idle"}
            disabled={!query.trim()}
            size="sm"
            loadingText="Searching"
            className="h-10 shrink-0 rounded-lg px-4 text-[12px] font-bold"
          >
            Search
          </StatefulButton>
        </form>
        <p className="mt-2 text-[11px] leading-snug text-neutral-500">
          Choosing a photo puts it in the <b className="text-neutral-800">{slot}</b> slot and fills
          in the style number, which is what buys the approved flat lay.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading && (
          <div className="flex justify-center py-8">
            <AnimatedBadge status="loading" size="md">
              Reading the gallery from the ERP
            </AnimatedBadge>
          </div>
        )}

        {empty && (
          <p className="py-8 text-center text-[12px] leading-relaxed text-neutral-500">
            The ERP has no photos filed under {result!.style}. Check the style number, or drop a
            photo in directly.
          </p>
        )}

        {result && result.regularizedFrom && (
          <p className="mb-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] leading-snug text-neutral-600">
            {result.regularizedFrom} is a Plus twin and has no photos of its own — showing{" "}
            {result.style}, where they live.
          </p>
        )}

        {/*
          The square thumbnail is not an ERP asset: Faire's catalogue tiles are
          square, so "<STYLE> Square.png" is generated from ONE of these frames.
          Which one is scored, not chosen, and this says which and why — using
          the same weights as the tool that builds it.
        */}
        {result?.squareThumbnail && (
          <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2">
            <p className="text-[11px] font-bold text-brand-900">
              Faire square thumbnail · {result.squareThumbnail.colorway}
              {result.squareThumbnail.index !== null ? ` frame ${result.squareThumbnail.index}` : ""}
            </p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-brand-800">
              {result.squareThumbnail.name} would be built from this frame
              {result.squareThumbnail.strengths.length
                ? ` — ${result.squareThumbnail.strengths.join(", ")}`
                : ""}
              .
            </p>
            {/* The winner is often only the best of what is filed, so the
                caveat has to read as a caveat rather than as another merit. */}
            {result.squareThumbnail.warnings.length > 0 && (
              <p className="mt-1 text-[10.5px] leading-snug text-amber-800">
                But: {result.squareThumbnail.warnings.join(", ")}.
              </p>
            )}
          </div>
        )}

        {result?.groups.map((group) => (
          <section key={group.colorway} className="mb-4">
            <h3
              className={`mb-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.15em] ${
                group.foreign ? "text-amber-700" : "text-neutral-500"
              }`}
            >
              {group.colorway}
              <span className="ml-1.5 font-sans font-medium normal-case tracking-normal text-neutral-400">
                {group.photos.length} frame{group.photos.length === 1 ? "" : "s"}
              </span>
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {group.photos.map((photo) => {
                const id = `${group.colorway}-${photo.label}`;
                const busy = picking === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={Boolean(picking)}
                    onClick={async () => {
                      setPicking(id);
                      setError(null);
                      try {
                        await onPick(photo, result.style);
                      } catch (err: any) {
                        setError(err.message ?? "Could not bring that photo in.");
                      } finally {
                        setPicking(null);
                      }
                    }}
                    title={[...photo.strengths, ...photo.warnings].join(" · ")}
                    className={`group relative overflow-hidden rounded-lg border bg-[#edeeee] transition disabled:cursor-wait ${
                      photo.isSquareHero
                        ? "border-brand-500 ring-1 ring-brand-500"
                        : "border-neutral-200 hover:border-neutral-500"
                    }`}
                    style={{ aspectRatio: "4 / 5" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumb}
                      alt={`${result.style} ${group.colorway} frame ${photo.label}`}
                      loading="lazy"
                      className="h-full w-full object-contain"
                    />
                    {photo.isSquareHero && (
                      <AnimatedBadge
                        status="info"
                        size="sm"
                        className="absolute left-1 top-1 h-5 px-1.5 text-[8px] font-bold uppercase tracking-wider"
                      >
                        Square
                      </AnimatedBadge>
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-white/85 py-0.5 text-center font-mono text-[8.5px] font-bold text-neutral-600">
                      {busy ? "Adding…" : photo.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {!result && !loading && !error && (
          <p className="py-8 text-center text-[12px] leading-relaxed text-neutral-500">
            Search a style number to see every photo the ERP holds for it.
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-neutral-200 px-4 py-2.5 text-right">
        <button
          type="button"
          onClick={onClose}
          className="text-[11.5px] font-semibold text-neutral-500 underline-offset-2 transition hover:text-neutral-900 hover:underline"
        >
          Close
        </button>
      </div>
    </div>
  );
}
