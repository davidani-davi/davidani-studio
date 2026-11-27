// "Send to" for the web Model Studio (2026-11-27): where the kept views go once they are good.
//
// - ERP file: one ZIP with the kept views under the extension's file-name rules (core.shotFilename) plus a
//   manifest.csv (style, colour, view, file, link, model, engine) that an ERP or spreadsheet import can read.
// - Faire listing: the views are saved to the shared Saved shots store (the extension reads the same store),
//   then the listing opens on Faire with #ddto-studio=<saved ids>. The extension's Model Studio puts those
//   shots into their views and hands them to its square editor; nothing reaches Faire until Upload is
//   clicked there.
import core from "@/lib/model-shots-core";
import type { SavedShot, Slot } from "./types";
import { downloadName } from "./request";

export interface ExportRow {
  style: string; color: string; view: string; viewLabel: string; file: string; url: string; model: string; engine: string;
}

/** One row per kept view, with the file name it gets in the ZIP. A second take of a view gets " 2". */
export function exportRows(style: string, color: string, kept: Slot[], fallbackModel = ""): ExportRow[] {
  const seen: Record<string, number> = {};
  return kept.map((s) => {
    seen[s.view] = (seen[s.view] || 0) + 1;
    return {
      style: style.toUpperCase(), color: color || "", view: s.view, viewLabel: core.VIEW_LABEL[s.view] || s.view,
      file: downloadName(style, s, color, seen[s.view]), url: s.url || "", model: s.humanModelId || fallbackModel, engine: s.engine || "",
    };
  });
}

const CSV_COLUMNS: [keyof ExportRow, string][] = [
  ["style", "Style"], ["color", "Color"], ["viewLabel", "View"], ["file", "File"], ["url", "Link"], ["model", "Model"], ["engine", "Engine"],
];

function csvCell(v: string): string {
  // A leading = + - @ would run as a formula when the sheet opens; prefix it so it stays text.
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function manifestCsv(rows: ExportRow[]): string {
  const lines = [CSV_COLUMNS.map(([, h]) => h).join(","), ...rows.map((r) => CSV_COLUMNS.map(([k]) => csvCell(String(r[k] ?? ""))).join(","))];
  return lines.join("\r\n") + "\r\n";
}

export function exportZipName(style: string, color: string): string {
  return `${[style, color, "MODEL VIEWS"].map((p) => String(p || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean).join(" ")}.zip`;
}

// ── a store-only ZIP writer: the renders are already compressed, so deflate would buy nothing ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d: Date): [number, number] {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
}

export function zipFiles(files: { name: string; data: Uint8Array }[], when = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const [time, date] = dosTime(when);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); lv.setUint16(10, time, true); lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, f.data.length, true); lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true); cv.setUint16(12, time, true); cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, f.data.length, true); cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, f.data);
    centrals.push(central);
    offset += local.length + f.data.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, at); at += part.length; }
  return out;
}

// ── Faire handoff ──
export const FAIRE_PRODUCT_BASE = "https://www.faire.com/brand-portal/my-shop/products/";

export interface FaireDestination { productId: string | null; state: string | null; url: string | null }

/** The listing page with the saved shots the extension should put into its views. */
export function faireHandoffUrl(productId: string, savedIds: string[]): string {
  if (!/^p_\w+$/.test(productId)) throw new Error("That is not a Faire listing id.");
  const ids = savedIds.filter((id) => /^[\w-]{1,80}$/.test(id));
  return `${FAIRE_PRODUCT_BASE}${productId}#ddto-studio${ids.length ? `=${ids.join(",")}` : ""}`;
}

/** The saved shot that holds each kept view (matched the same way the panel marks "in slot"). */
export function savedIdsFor(kept: Slot[], saved: SavedShot[]): string[] {
  return kept.map((s) => s.savedId || core.savedMatch(s, saved)?.id || "").filter(Boolean);
}

export function faireStateLabel(state: string | null): string {
  switch ((state || "").toUpperCase()) {
    case "DRAFT": return "Draft";
    case "PUBLISHED": return "Published";
    case "UNPUBLISHED": return "Unpublished";
    case "": return "";
    default: return state!.charAt(0) + state!.slice(1).toLowerCase();
  }
}
