"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { thumbSrc } from "@/lib/thumb";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | undefined | null;
  /** Pixel width to fetch: about twice the width it is drawn at. */
  size: number;
  /** Shown instead when neither copy loads (e.g. an expired temp-file link). */
  fallback?: ReactNode;
  /**
   * For the one big image someone inspects (stage, output, preview): show the
   * resized copy first, then swap in the full original once it has downloaded,
   * so fine detail is never judged on a WebP.
   */
  upgrade?: boolean;
};

/**
 * An <img> that downloads a resized copy (lib/thumb.ts) instead of the full
 * render, lazily, and fades in once it has arrived; the box behind it is the
 * placeholder. If the resizer fails it falls back to the original once, and
 * if that fails too it shows `fallback`, or stays hidden, never a broken icon.
 */
export default function Thumb(props: Props) {
  // A new image starts from scratch: no stale "failed" or "loaded" state.
  return <ThumbImage key={props.src ?? ""} {...props} />;
}

function ThumbImage({
  src,
  size,
  fallback,
  upgrade = false,
  className = "",
  loading = "lazy",
  onLoad,
  onError,
  ...rest
}: Props) {
  const original = src ?? "";
  const [url, setUrl] = useState(() => thumbSrc(src, size));
  const [loaded, setLoaded] = useState(false);
  const [dead, setDead] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  function fail() {
    if (url !== original) {
      console.warn("[thumb] resized copy failed, using the original", original);
      setUrl(original);
    } else {
      // Stay hidden, so the box behind shows instead of a broken icon.
      setDead(true);
    }
  }

  // A server-rendered image can finish, or fail, before React hydrates and
  // attaches its handlers.
  useEffect(() => {
    const img = ref.current;
    if (!img || !url || !img.complete) return;
    if (img.naturalWidth) setLoaded(true);
    else fail();
    // Mount only: later loads and errors reach the handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!upgrade || !loaded || url === original) return;
    const full = new Image();
    full.onload = () => setUrl(original);
    full.src = original;
    return () => {
      full.onload = null;
    };
  }, [upgrade, loaded, url, original]);

  // Keep a caller's own `transition` (e.g. a hover zoom) intact.
  const fade = /\btransition\b/.test(className) ? "" : "transition-opacity duration-300";

  if (dead && fallback) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      {...rest}
      ref={ref}
      src={url || undefined}
      loading={loading}
      decoding="async"
      // No opacity class once loaded, so a caller's own (e.g. opacity-70) applies.
      className={`${className} ${fade} ${loaded ? "" : "opacity-0"}`}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      onError={(event) => {
        fail();
        onError?.(event);
      }}
    />
  );
}
