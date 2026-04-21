"use client";

import { useEffect } from "react";

/**
 * Full-screen image preview overlay. Conditional on `src` — pass null to keep
 * it closed, pass a URL to open. The caller owns the state so a single
 * component can be reused from multiple unrelated triggers on the same page.
 *
 * Behaviour:
 *   - ESC closes
 *   - backdrop click closes
 *   - X button closes
 *   - clicks on the image itself do NOT close (so users can zoom-pan)
 *   - locks body scroll while open so the page behind doesn't drift
 */
interface Props {
  src: string | null;
  onClose: () => void;
  /** Optional alt text for accessibility. */
  alt?: string;
}

export default function ImageLightbox({ src, onClose, alt = "Preview" }: Props) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <button
        onClick={onClose}
        className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white transition hover:bg-white/20"
        aria-label="Close preview"
      >
        ×
      </button>

      <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-white/80">
        Press Esc or click outside to close
      </span>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full cursor-default rounded-lg object-contain shadow-2xl"
      />
    </div>
  );
}

/**
 * Small magnifying-glass button meant to sit in the corner of a clickable
 * thumbnail. Call sites handle visibility (e.g. show on hover via
 * `group-hover:opacity-100`) and wire onClick to open the lightbox.
 *
 * Always calls stopPropagation so it never fires the parent's click handler
 * (which on thumbnails is typically "select this image").
 */
export function ZoomButton({
  onClick,
  className = "",
  title = "Preview",
}: {
  onClick: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      title={title}
      aria-label={title}
      className={`flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black/90 ${className}`}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
        <path d="M9 3a6 6 0 014.472 10.03l3.249 3.248a1 1 0 01-1.414 1.415l-3.249-3.249A6 6 0 119 3zm0 2a4 4 0 100 8 4 4 0 000-8zm-.5 1.75a.75.75 0 01.75.75V8.5h1a.75.75 0 010 1.5h-1v1a.75.75 0 01-1.5 0v-1h-1a.75.75 0 010-1.5h1V7.5a.75.75 0 01.75-.75z" />
      </svg>
    </button>
  );
}
