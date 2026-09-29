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
   * For the image someone inspects (stage, solo output, preview): show the
   * resized copy first while the full original downloads alongside it, then
   * swap the original in, so fine detail is never judged on a WebP.
   */
  upgrade?: boolean;
};

/**
 * An <img> that downloads a resized copy (lib/thumb.ts) instead of the full
 * render, lazily, and fades in once it has arrived; the box behind it is the
 * placeholder. If the resizer fails it falls back to the original once, and
 * if that fails too it shows `fallback`, or stays hidden, never a broken icon.
 * Images the resizer can't take paint as they download, as a plain <img> does.
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
      setDead(true);
    }
  }

  // A server-rendered image can finish before React hydrates and attaches its
  // handlers. A finished load is read off the element; anything else is
  // requested again so its load or error event reaches the handlers.
  useEffect(() => {
    const img = ref.current;
    if (!img || !url || !img.complete) return;
    if (img.naturalWidth) setLoaded(true);
    else img.src = url;
    // Mount only: later loads and errors reach the handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!upgrade || url === original) return;
    let live = true;
    const full = new Image();
    full.src = original;
    full.decode().then(
      () => live && setUrl(original),
      // Keep the resized copy; the original may still be downloadable later.
      () => live && console.warn("[thumb] full-size original did not load", original),
    );
    return () => {
      live = false;
      full.src = "";
    };
  }, [upgrade, url, original]);

  // Keep a caller's own `transition` (e.g. a hover zoom) intact.
  const fade = /\btransition\b/.test(className) ? "" : "transition-opacity duration-300";
  // Only a resized copy waits to fade in; the box behind is its placeholder.
  const waiting = !loaded && url !== original;

  if (dead && fallback) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      {...rest}
      ref={ref}
      // Before src, so browsers that read attributes in order defer lazy images.
      loading={loading}
      decoding="async"
      src={url || undefined}
      // No opacity class once loaded, so a caller's own (e.g. opacity-70) applies.
      className={`${className} ${fade} ${waiting ? "opacity-0" : ""} ${dead ? "invisible" : ""}`}
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
