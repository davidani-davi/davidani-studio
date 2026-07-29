export function resolveGenerateOutputSize(
  raw: boolean | undefined,
  deferResize: boolean | undefined,
  studioSize: { width: number; height: number }
): { width: number; height: number } | null {
  return raw || deferResize ? null : studioSize;
}
