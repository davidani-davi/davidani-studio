function parseAspectRatio(
  aspectRatio: string | undefined
): { widthPart: number; heightPart: number } | null {
  const match = aspectRatio?.trim().match(/^(\d{1,3})\s*:\s*(\d{1,3})$/);
  if (!match) return null;

  const widthPart = Number(match[1]);
  const heightPart = Number(match[2]);
  if (widthPart <= 0 || heightPart <= 0) return null;

  const ratio = widthPart / heightPart;
  if (ratio < 0.1 || ratio > 10) return null;
  return { widthPart, heightPart };
}

export function inferAspectRatioFromPrompt(prompt: string): string | null {
  const matches = [...prompt.matchAll(/\b(\d{1,3})\s*:\s*(\d{1,3})\b/g)];
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = `${matches[index][1]}:${matches[index][2]}`;
    if (parseAspectRatio(candidate)) return candidate;
  }
  return null;
}

export function resolveRequestedAspectRatio(
  selectedAspectRatio: string | undefined,
  prompt: string
): string {
  if (selectedAspectRatio && selectedAspectRatio !== "auto") {
    return selectedAspectRatio;
  }
  return inferAspectRatioFromPrompt(prompt) ?? "auto";
}

export function outputSizeForAspectRatio(
  aspectRatio: string | undefined,
  resolution: string | undefined
): { width: number; height: number } | null {
  if (!aspectRatio || aspectRatio === "auto") return null;

  const parsed = parseAspectRatio(aspectRatio);
  if (!parsed) return null;
  const { widthPart, heightPart } = parsed;

  const longEdge = resolution === "4K" ? 4096 : resolution === "2K" ? 2048 : 1024;
  const multiplier = Math.max(
    1,
    Math.floor(longEdge / Math.max(widthPart, heightPart))
  );
  return {
    width: widthPart * multiplier,
    height: heightPart * multiplier,
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
