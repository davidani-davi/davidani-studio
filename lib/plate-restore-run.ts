import { matteOf, type Matte } from "./matte";
import { restoreOnPlate, type PlateRestoreReport } from "./plate-restore";
import { uploadToFal } from "./fal";

/**
 * The restore pass for a finished view, end to end: matte the render and its
 * plate, rebuild the render on the plate's backdrop (lib/plate-restore.ts),
 * host the result on fal storage like every other render. A plate's matte is
 * cached per URL for the life of the process — the four views of a shot
 * share at most four plates, and the plates never change.
 */

const plateMattes = new Map<string, Promise<Matte>>();

function plateMatte(url: string): Promise<Matte> {
  let p = plateMattes.get(url);
  if (!p) {
    p = matteOf(url).catch((err) => { plateMattes.delete(url); throw err; });
    plateMattes.set(url, p);
  }
  return p;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url.slice(0, 80)}`);
  return Buffer.from(await res.arrayBuffer());
}

export interface RestoreRunResult {
  /** The restored render's URL, or null when the pass declined. */
  url: string | null;
  report: PlateRestoreReport;
  ms: number;
}

export async function restoreRenderOnPlate(renderUrl: string, plateUrl: string): Promise<RestoreRunResult> {
  const started = Date.now();
  const [render, plate, renderMatte, plateM] = await Promise.all([
    fetchBuffer(renderUrl), fetchBuffer(plateUrl), matteOf(renderUrl), plateMatte(plateUrl),
  ]);
  const { buffer, report } = await restoreOnPlate(render, plate, { render: renderMatte, plate: plateM });
  if (!report.applied) return { url: null, report, ms: Date.now() - started };
  const url = await uploadToFal(new Blob([Uint8Array.from(buffer)], { type: "image/jpeg" }), "restored.jpg");
  return { url, report, ms: Date.now() - started };
}
