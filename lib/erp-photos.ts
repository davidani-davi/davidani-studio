import { ERP_BASE } from "./erp-category";

/**
 * Read an ERP style photo's identity out of its URL.
 *
 * The gallery pages only ever link thumbnails:
 *
 *   https://system.davidani.com/upload/style/T_DWTS67099 CHARCOAL_1.png   32 KB
 *   https://system.davidani.com/upload/style/DWTS67099 CHARCOAL_1.png    4.8 MB
 *
 * The `T_` prefix on the FILENAME is the only difference — same directory,
 * same name otherwise. That is what makes an ERP picker worth building: the
 * thumbnails are cheap enough to show a whole style at once, and the original
 * is one string operation away once a frame is chosen.
 *
 * NAMES ARE NOT A SCHEMA
 * ----------------------
 * There is no metadata per frame; the filename is all there is, and it is not
 * consistent. Sampled from the live ERP:
 *
 *   T_DWTS67099 CHARCOAL_1.png       style, colourway, index
 *   T_DDT9040 (7).JPG                style, no colourway, parenthesised index
 *   T_DT42174H, DP58531_13.jpg       TWO style codes, then an index
 *   T_DT42174H.jpg                   style alone
 *   T_image012(58).png               a foreign file sitting in the gallery
 *
 * An earlier version of this parser assumed the first shape and returned null
 * for everything else, which silently dropped 59 of DDT9040's 60 frames — the
 * style looked to the studio like the ERP had nothing for it. So this now
 * tokenises rather than matching a template, and only refuses a URL that is
 * not an image at all.
 */

export interface ErpPhoto {
  /** Full-resolution original, for actually generating from. */
  fullUrl: string;
  /** Small copy, for showing a whole style at once. */
  thumbUrl: string;
  /** Uppercased words in the filename, minus the trailing index. */
  tokens: string[];
  /** Word tokens left after the style code — the colourway, when named. */
  colorway: string | null;
  /**
   * Other style codes in the filename: the garments styled WITH this one.
   *
   * DJ52056's frames are named "DJ52056 DT52025 DP50116_1.jpg" — one green
   * bomber shot over a top and jeans that have their own codes. Read as part
   * of the colourway they made a nonsense heading out of two SKUs.
   */
  coStyled: string[];
  /** Trailing number in either `_N` or `(N)` form, when the name carries one. */
  index: number | null;
}

const THUMB_PREFIX = "T_";
const IMAGE = /\.(png|jpe?g|gif)$/i;
/** `_13` or ` (7)` or `(58)` at the very end of the stem. */
const TRAILING_INDEX = /(?:_|\s*\()(\d+)\)?$/;

function splitUrl(url: string): { dir: string; file: string } | null {
  const cut = url.lastIndexOf("/");
  if (cut < 0) return null;
  return { dir: url.slice(0, cut + 1), file: url.slice(cut + 1) };
}

/** The full-resolution counterpart of a gallery thumbnail URL. */
export function fullSizeUrl(url: string): string {
  const parts = splitUrl(url);
  if (!parts) return url;
  return parts.file.startsWith(THUMB_PREFIX)
    ? `${parts.dir}${parts.file.slice(THUMB_PREFIX.length)}`
    : url;
}

/** The thumbnail counterpart of a full-resolution URL. */
export function thumbUrl(url: string): string {
  const parts = splitUrl(url);
  if (!parts) return url;
  return parts.file.startsWith(THUMB_PREFIX) ? url : `${parts.dir}${THUMB_PREFIX}${parts.file}`;
}

/**
 * Whether a filename token is a style code rather than a word.
 *
 * Style codes carry digits — DT52025, DP40212A, DWT52362 — and colourways do
 * not: CHARCOAL, MOCHA BEIGE, BUTTER YELLOW, ARMY GREEN. That is the whole
 * distinction, and it is reliable in both directions.
 */
export function looksLikeStyleCode(token: string): boolean {
  return /^[A-Z]{1,5}\d{3,}[A-Z]?$/.test(token);
}

/**
 * Split a filename stem into words.
 *
 * Commas and underscores separate as surely as spaces do — "DT42174H, DP58531"
 * is two style codes, and treating the comma as part of the first one made it
 * stop matching the style it belongs to.
 */
export function nameTokens(stem: string): string[] {
  return stem
    .toUpperCase()
    .split(/[\s,_]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * @param style the style being browsed, so its own token can be told apart
 *              from the colourway. Optional — without it every token reads as
 *              part of the label.
 */
export function parseErpPhoto(url: string, style?: string): ErpPhoto | null {
  const parts = splitUrl(url);
  if (!parts) return null;
  const file = decodeURIComponent(
    parts.file.startsWith(THUMB_PREFIX) ? parts.file.slice(THUMB_PREFIX.length) : parts.file
  );
  if (!IMAGE.test(file)) return null;

  const stem = file.replace(IMAGE, "");
  const found = stem.match(TRAILING_INDEX);
  const index = found ? Number.parseInt(found[1], 10) : null;
  const tokens = nameTokens(found ? stem.slice(0, found.index) : stem);

  const key = style?.trim().toUpperCase();
  const rest = key ? tokens.filter((t) => t !== key) : tokens;
  // A colour name has letters in it. Bare numbers turn up as stray tokens in
  // names like "DT42174H, DP50188 4" and were heading groups "4" and "15".
  const words = rest.filter((t) => /[A-Z]/.test(t) && !looksLikeStyleCode(t));
  return {
    fullUrl: fullSizeUrl(url),
    thumbUrl: thumbUrl(url),
    tokens,
    colorway: words.length ? words.join(" ") : null,
    coStyled: rest.filter(looksLikeStyleCode),
    index,
  };
}

/**
 * Plus twin -> regular twin.
 *
 * A P-style has no photos of its own; they are filed against the D-style.
 * Without this a Plus code returns an empty gallery and the ERP looks like it
 * holds nothing for the style.
 */
export function regularizeStyle(code: string): string {
  const key = code.trim().toUpperCase();
  return key.startsWith("P") ? `D${key.slice(1)}` : key;
}

/** Whether this frame is named for the style whose gallery it appeared in. */
export function namedForStyle(photo: ErpPhoto, style: string): boolean {
  return photo.tokens.includes(style.trim().toUpperCase());
}

/**
 * Only ERP style-photo URLs may be proxied.
 *
 * The proxy carries the ERP session cookie, so an unchecked `src` would turn it
 * into an authenticated read of any page in the ERP — orders, costs, customer
 * records — for anyone who can reach the studio.
 */
export function isErpPhotoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const base = new URL(ERP_BASE);
  if (parsed.protocol !== base.protocol || parsed.host !== base.host) return false;
  if (!parsed.pathname.toLowerCase().startsWith("/upload/style/")) return false;
  return IMAGE.test(decodeURIComponent(parsed.pathname));
}

/** What to head a group of frames with. */
export const UNTAGGED_GROUP = "All frames";
export const FOREIGN_GROUP = "Other files in this gallery";

export interface ErpPhotoGroup {
  /** The heading, already readable. */
  label: string;
  /** Which kind of heading it is, so the UI can say what it means. */
  kind: "colorway" | "styled" | "all" | "foreign";
  /** Set for a styled group: the other garments in the shot. */
  styledWith: string[];
  photos: ErpPhoto[];
}

/**
 * Group a style's frames for display.
 *
 * By colourway where the names carry one. Where they instead name the other
 * garments in the shot, the split is still worth keeping — those are separate
 * looks — but it is labelled as what it is. Reading those codes as a colourway
 * headed eleven frames of one green bomber "DT52025 DP50116", which names two
 * garments that are not the product.
 *
 * Files NOT named for the style are separated out — foreign files do leak into
 * shared galleries (real cases: "T_2597.png", "T_4 Polka Horse Dark Brown.png")
 * — and mixing them in makes the gallery look wrong.
 */
export function groupForDisplay(photos: ErpPhoto[], style: string): ErpPhotoGroup[] {
  const groups = new Map<string, ErpPhotoGroup>();
  for (const photo of photos) {
    if (!namedForStyle(photo, style)) {
      const found = groups.get(FOREIGN_GROUP);
      if (found) found.photos.push(photo);
      else
        groups.set(FOREIGN_GROUP, {
          label: FOREIGN_GROUP,
          kind: "foreign",
          styledWith: [],
          photos: [photo],
        });
      continue;
    }
    const styled = photo.coStyled.join(" ");
    const key = photo.colorway ?? (styled || UNTAGGED_GROUP);
    const found = groups.get(key);
    if (found) {
      found.photos.push(photo);
      continue;
    }
    groups.set(key, {
      label: photo.colorway ?? (styled ? `Styled with ${photo.coStyled.join(" · ")}` : UNTAGGED_GROUP),
      kind: photo.colorway ? "colorway" : styled ? "styled" : "all",
      styledWith: photo.colorway ? [] : photo.coStyled,
      photos: [photo],
    });
  }
  const byIndex = (a: ErpPhoto, b: ErpPhoto) =>
    (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER);
  const all = [...groups.values()].map((g) => ({ ...g, photos: [...g.photos].sort(byIndex) }));
  // Foreign files last, whatever order they appeared in.
  return [...all.filter((g) => g.kind !== "foreign"), ...all.filter((g) => g.kind === "foreign")];
}
