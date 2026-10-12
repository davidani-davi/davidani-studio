// Client-side image downscaling. Vercel's serverless functions have a hard
// 4.5 MB request-body limit, and a modern phone photo is routinely 5-10 MB.
// We shrink images in the browser before they ever hit our upload endpoint.
//
// Target: longest edge 2048 px, JPEG @ 0.85 quality (PNG when the image has
// transparency). For fashion flat-lay
// product photos at this resolution, the quality drop is imperceptible to
// both humans and Nano Banana. A 4000x6000 10 MB HEIC typically lands
// around 600-900 KB after this pass.

const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.85;
// Was 3 MB, which sent 1-3 MB PNGs up untouched. On a home or show-floor
// uplink every megabyte is roughly another second of waiting, and a 2048 px
// JPEG of a garment is usually 300-700 KB.
const SKIP_IF_BYTES_UNDER = 1024 * 1024; // 1 MB

export async function resizeIfNeeded(
  file: File,
  opts?: { skipIfBytesUnder?: number }
): Promise<File> {
  // Small files pass through untouched (no quality loss for already-small PNGs).
  // Callers can change the threshold; ModelSidebar already asked for 1 MB.
  const threshold = opts?.skipIfBytesUnder ?? SKIP_IF_BYTES_UNDER;
  const heic = /heic|heif/i.test(file.type);
  if (file.size < threshold && !heic) {
    return file;
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(await fileToDataUrl(file));
  } catch {
    // Not decodable in this browser (HEIC outside Safari). /api/upload
    // converts it server-side, so send it as it is rather than fail here.
    return file;
  }

  const { width, height } = img;
  const longest = Math.max(width, height);
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";

  // A cut-out keeps its transparency: as a JPEG its background turns black.
  if (!/jpe?g/i.test(file.type) && hasTransparency(ctx, targetW, targetH)) {
    if (scale === 1) return file;
    const png = await canvasBlob(canvas, "image/png");
    return new File([png], `${baseName}.png`, { type: "image/png" });
  }

  const jpeg = await canvasBlob(canvas, "image/jpeg", JPEG_QUALITY);
  // An already-compressed JPEG can come out bigger; keep the original then.
  if (scale === 1 && !heic && jpeg.size >= file.size) return file;
  // Preserve the display name but force .jpg extension so server sees correct type.
  return new File([jpeg], `${baseName}.jpg`, { type: "image/jpeg" });
}

function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    // Unreadable pixels: assume transparency so nothing gets flattened.
    return true;
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas blob failed"))),
      type,
      quality
    );
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = src;
  });
}
