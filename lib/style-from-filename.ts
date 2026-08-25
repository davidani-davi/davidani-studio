/**
 * Read a style number out of an uploaded photo's filename.
 *
 * WHY
 * ---
 * Batch mode ran on the pre-ERP path because one shared style field cannot
 * describe many products — stamping every queued image with the same style
 * would hand back a confidently wrong category for all but the first. Per-item
 * style numbers fix that, and they are already on disk: the studio's own photo
 * files are named after the style.
 *
 *   DWTS67099 CHARCOAL_1.png     -> DWTS67099
 *   DSP50066_8.jpg               -> DSP50066
 *   DDT9040 (7).JPG              -> DDT9040
 *   DTP67003TBN.jpg              -> DTP67003TBN   (colourway suffix included)
 *   image005(107).png            -> IMAGE005      (shape matches; ERP rejects)
 *
 * TRUST
 * -----
 * A typed style number is an assertion. A filename is an artifact — it can be
 * a copy, a re-export, or a renamed duplicate — so what comes out of here is
 * "inferred" and carries less authority than something typed. See the `trust`
 * parameter on reconcileStyleCode(). Extraction being right about the SHAPE of
 * a code says nothing about whether the file was named correctly.
 *
 * A candidate that is not a real style still costs nothing: decodeStyleCode
 * ignores unvalidated prefixes and fetchErpCategory returns null for a style
 * that does not exist, so the run lands exactly where batch sits today.
 */

/**
 * Style codes are 1–5 letters, 3–6 digits, then an OPTIONAL colourway suffix:
 * the ERP's own ids come in both forms (DSP50066 and DTP67003TBN are both real
 * idStyle values), so the suffix is kept rather than trimmed — it is more
 * specific and the ERP resolves it either way.
 *
 * The shape is loose enough that "image005" qualifies. That is deliberate and
 * unavoidable: the pattern can only say a token LOOKS like a style code, and
 * the ERP lookup is what settles whether it is one. A candidate that is not a
 * real style costs one lookup and falls back to the photo.
 */
const CODE = /^([A-Z]{1,5}\d{3,6}[A-Z]{0,4})/;

/**
 * Extract a candidate style number, or null. Case-insensitive in, uppercase
 * out. Only the START of the filename is considered: a trailing token is far
 * more likely to be a colourway, a sequence number, or an export suffix.
 */
export function styleNumberFromFilename(filename: string | null | undefined): string | null {
  const base = String(filename || "")
    .split(/[/\\]/)
    .pop()!
    .replace(/\.[a-z0-9]+$/i, "") // drop the extension
    .trim()
    .toUpperCase();
  if (!base) return null;

  // Leading separators and copy markers ("copy of DWTS67099") are common
  // enough to be worth stepping over, but only once.
  const cleaned = base.replace(/^(?:COPY[\s_-]+OF[\s_-]+|FINAL[\s_-]+|NEW[\s_-]+)/, "");
  const m = CODE.exec(cleaned);
  return m ? m[1] : null;
}

export interface FilenameStyleMatch {
  url: string;
  filename: string;
  style: string | null;
}

/**
 * Map queued batch URLs to their candidate style numbers, given the
 * URL -> original filename map the uploader already keeps.
 */
export function styleNumbersForQueue(
  urls: string[],
  filenames: Record<string, string>
): FilenameStyleMatch[] {
  return urls.map((url) => {
    const filename = filenames[url] || "";
    return { url, filename, style: styleNumberFromFilename(filename) };
  });
}
