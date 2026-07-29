import type { UploadedImage } from "@/components/types";

export function parsePlaygroundPrompts(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function alphabeticImageLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function orderSelectedReferenceUrls(
  references: UploadedImage[],
  selectedUrls: string[]
): string[] {
  const selected = new Set(selectedUrls);
  return references
    .filter((reference) => selected.has(reference.url))
    .map((reference) => reference.url);
}

export function restorePersistedReferences(
  referencesJson: string | null,
  selectionJson: string | null
): { references: UploadedImage[]; selectedUrls: string[] } {
  if (!referencesJson) return { references: [], selectedUrls: [] };

  const parsedReferences: unknown = JSON.parse(referencesJson);
  if (!Array.isArray(parsedReferences)) {
    return { references: [], selectedUrls: [] };
  }

  const references = parsedReferences.filter(
    (item): item is UploadedImage =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as UploadedImage).url === "string" &&
      (item as UploadedImage).url.length > 0 &&
      typeof (item as UploadedImage).name === "string"
  );
  const available = new Set(references.map((reference) => reference.url));

  if (!selectionJson) {
    return {
      references,
      selectedUrls: references.map((reference) => reference.url),
    };
  }

  const parsedSelection: unknown = JSON.parse(selectionJson);
  return {
    references,
    selectedUrls: Array.isArray(parsedSelection)
      ? parsedSelection.filter(
          (url): url is string => typeof url === "string" && available.has(url)
        )
      : [],
  };
}

export function appendUniqueReferences(
  current: UploadedImage[],
  added: UploadedImage[]
): UploadedImage[] {
  const known = new Set(current.map((reference) => reference.url));
  return [
    ...current,
    ...added.filter((reference) => {
      if (known.has(reference.url)) return false;
      known.add(reference.url);
      return true;
    }),
  ];
}
