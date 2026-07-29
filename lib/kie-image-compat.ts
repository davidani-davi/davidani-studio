export const KIE_SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
]);

export function hasKieSupportedImageExtension(value: string): boolean {
  try {
    return /\.(?:jpe?g|png)$/i.test(new URL(value).pathname);
  } catch {
    return /\.(?:jpe?g|png)$/i.test(value);
  }
}

export function isTrustedKieNormalizationHost(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "fal.media" || host.endsWith(".fal.media");
  } catch {
    return false;
  }
}

export function canPassThroughKieUpload(file: {
  name: string;
  type: string;
}): boolean {
  const mimeType = file.type.toLowerCase();
  return (
    KIE_SUPPORTED_IMAGE_MIME_TYPES.has(mimeType) ||
    (!mimeType && hasKieSupportedImageExtension(file.name))
  );
}
