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
 * The hosts here must match `images.remotePatterns` in next.config.js, and the
 * widths must be ones Next accepts (its default imageSizes + deviceSizes).
 */

const WIDTHS = [32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];

const REMOTE_HOSTS = [
  /(^|\.)fal\.media$/,
  /(^|\.)fal\.ai$/,
  /\.public\.blob\.vercel-storage\.com$/,
  /^system\.davidani\.com$/,
];

function resizable(url: string): boolean {
  if (/\.svg($|\?)/i.test(url)) return false;
  if (url.startsWith("/")) {
    // Our own public/ files. Not protocol-relative URLs, API routes or an
    // already-resized image.
    return !url.startsWith("//") && !url.startsWith("/api/") && !url.startsWith("/_next/");
  }
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && REMOTE_HOSTS.some((host) => host.test(hostname));
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
