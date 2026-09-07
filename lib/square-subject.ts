import sharp from "sharp";

/** Median of a channel across a list of pixels. */
function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)] ?? 0;
}

/**
 * The subject's horizontal centre as a fraction of the width (0..1): the
 * middle of the span of columns where more than a fifth of the pixels differ
 * from the backdrop by more than 40 in some channel. The backdrop is a
 * vertical gradient between the medians of the top and bottom edge bands
 * (outer 15% of columns), so a vignette or a floor shadow never counts.
 */
export async function measureSubjectX(buf: Buffer): Promise<number> {
  const W = 200, H = 300;
  const raw = await sharp(buf).resize(W, H, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const px = (x: number, y: number) => { const i = (y * W + x) * 3; return [raw[i], raw[i + 1], raw[i + 2]]; };
  const xs = [...Array(30).keys()].concat([...Array(30).keys()].map((i) => W - 30 + i));
  const band = (y0: number, y1: number) => {
    const cols: number[][] = [[], [], []];
    for (let y = y0; y < y1; y++) for (const x of xs) { const c = px(x, y); cols[0].push(c[0]); cols[1].push(c[1]); cols[2].push(c[2]); }
    return cols.map(median);
  };
  const top = band(0, 15), bot = band(H - 15, H);
  const cols: number[] = [];
  for (let x = 0; x < W; x++) {
    let n = 0;
    for (let y = 0; y < H; y++) {
      const t = y / (H - 1), c = px(x, y);
      const off = Math.max(...c.map((v, i) => Math.abs(v - (top[i] + (bot[i] - top[i]) * t))));
      if (off > 40) n++;
    }
    if (n / H > 0.2) cols.push(x);
  }
  if (!cols.length) return 0.5;
  return (cols[0] + cols[cols.length - 1] + 1) / 2 / W;
}
