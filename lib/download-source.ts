/**
 * Which URLs the download proxy will fetch on the operator's behalf.
 *
 * A route that fetches an arbitrary caller-supplied URL from the server is an
 * SSRF hole — it can reach the cloud metadata endpoint and anything else on
 * the deploy's network. So this is an allowlist of the hosts that actually
 * serve studio renders, matching next.config.js's remotePatterns, plus the
 * blob store the rest of the app writes to.
 *
 * kie.ai's tempfile host is here because Model Studio renders never touch
 * fal: generate-model passes outputSize: null, so resizeGeneratedImages
 * returns kie's URLs untouched and every Model Studio result lives there.
 */
const ALLOWED_SUFFIXES = [
  ".fal.media",
  ".fal.ai",
  ".public.blob.vercel-storage.com",
];
const ALLOWED_HOSTS = ["fal.media", "fal.ai", "tempfile.aiquickdraw.com"];

export type DownloadSource =
  | { ok: true; url: URL }
  | { ok: false; reason: "malformed" | "protocol" | "host" };

export function resolveDownloadSource(raw: string | null | undefined): DownloadSource {
  if (!raw || typeof raw !== "string") return { ok: false, reason: "malformed" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  // https only: http would let a redirect walk this onto the private network,
  // and data:/file: bypass the host check entirely.
  if (url.protocol !== "https:") return { ok: false, reason: "protocol" };
  const host = url.hostname.toLowerCase();
  const allowed =
    ALLOWED_HOSTS.includes(host) || ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix));
  return allowed ? { ok: true, url } : { ok: false, reason: "host" };
}

/**
 * A filename the operating system will accept, derived from what the caller
 * asked for.
 *
 * Anything that could climb out of a directory or split the Content-Disposition
 * header is stripped rather than escaped, because the only legitimate contents
 * here are a style number, a run id, and an index.
 */
export function safeDownloadName(raw: string | null | undefined, fallback: string): string {
  const cleaned = (raw ?? "")
    .replace(/[\\/]/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/^[.\-]+/, "")
    .replace(/[.\-]+$/, "")
    .slice(0, 120);
  // A name made only of separators survives the character filter but is not a
  // name — "///" cleans to "---". Require something to actually read.
  return /[A-Za-z0-9]/.test(cleaned) ? cleaned : fallback;
}
