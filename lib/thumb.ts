/**
 * Small copies of studio images for thumbnails and previews.
 *
 * Renders are 2160x2700 PNGs (4K ones are larger), 2-3 MB each, and every
 * ledger chip, library card and picker tile used to download the original to
 * draw it at 76-300px. A page with a few runs pulled tens of megabytes.
 * `/_next/image` resizes and re-encodes (WebP) on Vercel and caches the result
 * at the edge, so a 76px chip costs ~10 KB. Downloads and the lightbox keep
 * using the original URL.
 *
 * REMOTE must stay inside `images.remotePatterns` in next.config.js (the test
 * checks it with Next's own matcher), and the widths must be ones Next accepts
 * (its default imageSizes + deviceSizes).
 */

export const WIDTHS = [32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];

// fal's files are immutable (max-age 60 days), so a resized copy is made once
// per width. The ERP overwrites a photo in place when a style is re-shot; its
// copies follow Next's default 4-hour cache. No port and no query string, as
// in next.config.js, so a URL can't dodge the cache or the pinned folder. ERP
// photos sit directly in /upload/style/, and a name with an encoded slash or
// backslash ("..%2F") could step out of it.
const REMOTE: { host: RegExp; path?: RegExp }[] = [
  { host: /(^|\.)fal\.media$/ },
  { host: /^cdr9xgexrrfthz5f\.public\.blob\.vercel-storage\.com$/ },
  { host: /^system\.davidani\.com$/, path: /^\/upload\/style\/(?!.*%(?:2[fF]|5[cC]))[^/]+$/ },
];

function resizable(url: string): boolean {
  if (/\.svg($|\?)/i.test(url)) return false;
  if (url.startsWith("/")) {
    // Our own public/ files. Not protocol-relative URLs, API routes or an
    // already-resized image.
    return !url.startsWith("//") && !url.startsWith("/api/") && !url.startsWith("/_next/");
  }
  try {
    const { protocol, hostname, port, pathname, search } = new URL(url);
    return (
      protocol === "https:" &&
      !port &&
      !search &&
      REMOTE.some(({ host, path }) => host.test(hostname) && (!path || path.test(pathname)))
    );
  } catch {
    return false;
  }
}

/**
 * The resized URL for `url`, at least `width` pixels wide (pass about twice the
 * CSS width, for Retina screens), or `url` itself when it cannot be resized.
 */
export function thumbSrc(url: string | undefined | null, width: number): string {
  if (!url) return "";
  if (!resizable(url)) return url;
  const w = WIDTHS.find((size) => size >= width) ?? WIDTHS[WIDTHS.length - 1];
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;
}
