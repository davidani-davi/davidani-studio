// Client-side image downscaling. Vercel's serverless functions have a hard
// 4.5 MB request-body limit, and a modern phone photo is routinely 5-10 MB.
// We shrink images in the browser before they ever hit our upload endpoint.
//
// Target: longest edge 2048 px, JPEG @ 0.85 quality. For fashion flat-lay
// product photos at this resolution, the quality drop is imperceptible to
// both humans and Nano Banana. A 4000x6000 10 MB HEIC typically lands
// around 600-900 KB after this pass.

const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.85;
// Skip resizing entirely for files already well under the limit.
const SKIP_IF_BYTES_UNDER = 3 * 1024 * 1024; // 3 MB

export async function resizeIfNeeded(file: File): Promise<File> {
  // Small files pass through untouched (no quality loss for already-small PNGs).
  if (file.size < SKIP_IF_BYTES_UNDER && !/heic|heif/i.test(file.type)) {
    return file;
  }

  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);

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

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas blob failed"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });

  // Preserve the display name but force .jpg extension so server sees correct type.
  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
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
