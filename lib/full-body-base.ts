/** A full-body base for a bottoms full shot: an ERP style photo or an image in our Blob store. */
export function isFullBodyBase(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 2000) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ((u.hostname === "system.davidani.com" && /^\/+upload\/+style\//.test(u.pathname))
      || /\.public\.blob\.vercel-storage\.com$/.test(u.hostname));
  } catch { return false; }
}
