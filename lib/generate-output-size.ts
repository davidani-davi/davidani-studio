export function outputSizeForAspectRatio(
  aspectRatio: string | undefined,
  resolution: string | undefined
): { width: number; height: number } | null {
  if (!aspectRatio || aspectRatio === "auto") return null;

  const [widthPart, heightPart] = aspectRatio.split(":").map(Number);
  if (
    !Number.isFinite(widthPart) ||
    !Number.isFinite(heightPart) ||
    widthPart <= 0 ||
    heightPart <= 0
  ) {
    return null;
  }

  const longEdge = resolution === "4K" ? 4096 : resolution === "2K" ? 2048 : 1024;
  if (widthPart >= heightPart) {
    return {
      width: longEdge,
      height: Math.round((longEdge * heightPart) / widthPart),
    };
  }
  return {
    width: Math.round((longEdge * widthPart) / heightPart),
    height: longEdge,
  };
}

export function resolveGenerateOutputSize(
  raw: boolean | undefined,
  deferResize: boolean | undefined,
  studioSize: { width: number; height: number },
  aspectRatio?: string,
  resolution?: string
): { width: number; height: number } | null {
  if (deferResize) return null;
  if (raw) return outputSizeForAspectRatio(aspectRatio, resolution);
  return studioSize;
}
