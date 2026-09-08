import { fal } from "@fal-ai/client";
import sharp from "sharp";

/**
 * Figure matte for a model shot: the alpha of the person (hair included)
 * against the studio sweep, from a background-removal model on fal.
 *
 * WHY A MODEL AND NOT COLOUR
 * --------------------------
 * lib/plate-restore.ts first tried to cut the figure by colour (a flood fill
 * inward from the frame edge). It worked on jeans and failed on the first
 * pair of ecru trousers: measured against the cream sweep they sat 9 levels
 * away in one channel, closer than the sweep's own mottle. No threshold
 * separates them; a matting model does, because it knows what a person is.
 *
 * The matte is the one non-deterministic step of the restore pass, and it is
 * a segmentation, not a generation — nothing in the picture is re-invented.
 */

export const MATTE_ENDPOINT = "fal-ai/birefnet/v2";

let configured = false;
function ensureFal() {
  if (configured) return;
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY environment variable is missing.");
  fal.config({ credentials: key });
  configured = true;
}

export interface Matte {
  /** One byte per pixel, 255 = figure. */
  alpha: Buffer;
  width: number;
  height: number;
}

/**
 * The matte of the image at `url`, at the image's own size. BiRefNet returns
 * the cut-out as an RGBA PNG (and, asked for, the mask alone); the alpha is
 * what this needs. Transient failures are retried once.
 */
export async function matteOf(url: string): Promise<Matte> {
  ensureFal();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res: any = await fal.subscribe(MATTE_ENDPOINT, {
        input: {
          image_url: url,
          model: "General Use (Heavy)",
          operating_resolution: "2048x2048",
          output_format: "png",
          output_mask: true,
          refine_foreground: true,
        },
        logs: false,
      });
      const data = res?.data ?? res;
      const maskUrl: string | undefined = data?.mask_image?.url;
      const imageUrl: string | undefined = data?.image?.url;
      const src = maskUrl || imageUrl;
      if (!src) throw new Error("matte returned no image");
      const buf = Buffer.from(await (await fetch(src)).arrayBuffer());
      const img = sharp(buf);
      const meta = await img.metadata();
      const width = meta.width || 0, height = meta.height || 0;
      if (!width || !height) throw new Error("matte image has no size");
      // a mask image is grey (figure white); a cut-out carries the figure in its alpha
      const alpha = maskUrl
        ? await img.removeAlpha().toColourspace("b-w").raw().toBuffer()
        : await img.ensureAlpha().extractChannel("alpha").raw().toBuffer();
      return { alpha, width, height };
    } catch (err) {
      lastErr = err;
      if (attempt === 0 && /fetch failed|network|timeout|timed out|econnreset|socket|5\d\d|rate limit/i.test(String((err as any)?.message || err))) continue;
      throw err;
    }
  }
  throw lastErr;
}
