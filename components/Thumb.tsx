"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { thumbSrc } from "@/lib/thumb";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | undefined | null;
  /** Pixel width to fetch: about twice the width it is drawn at. */
  size: number;
};

/**
 * An <img> that downloads a resized copy (lib/thumb.ts) instead of the full
 * render, lazily, and fades in once it has arrived; the box behind it is the
 * placeholder. If the resizer fails it falls back to the original once, and
 * if that fails too the image stays hidden rather than showing a broken icon.
 */
export default function Thumb({ src, size, className = "", loading = "lazy", onLoad, onError, ...rest }: Props) {
  const resized = thumbSrc(src, size);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setFailed(false);
    // A cached image can finish before React hydrates and miss onLoad.
    const img = ref.current;
    setLoaded(Boolean(img?.complete && img.naturalWidth));
  }, [resized]);

  const url = failed ? src ?? "" : resized;
  // Keep a caller's own `transition` (e.g. a hover zoom) intact.
  const fade = /\btransition\b/.test(className) ? "" : "transition-opacity duration-300";

  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      {...rest}
      ref={ref}
      src={url}
      loading={loading}
      decoding="async"
      // No opacity class once loaded, so a caller's own (e.g. opacity-70) applies.
      className={`${className} ${fade} ${loaded ? "" : "opacity-0"}`}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      onError={(event) => {
        // Second failure: stay hidden, so the box behind shows instead of a broken icon.
        if (!failed && url !== src) setFailed(true);
        onError?.(event);
      }}
    />
  );
}
