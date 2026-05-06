export type TasteSignalType = "inspiration" | "concept";

export interface TasteSignal {
  key: string;
  type: TasteSignalType;
  title: string;
  category?: string;
  tags?: string[];
  note?: string;
  imageUrl?: string;
  createdAt: string;
}

export interface BlankBase {
  id: string;
  name: string;
  imageUrl: string;
  createdAt: string;
}

const TASTE_KEY = "davidani:design-memory:taste-signals";
const BLANK_BASES_KEY = "davidani:design-memory:blank-bases";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function readTasteSignals(): TasteSignal[] {
  return readJson<TasteSignal[]>(TASTE_KEY, []).filter(
    (item) => item && item.key && item.title
  );
}

export function isTasteSignalLiked(key: string): boolean {
  return readTasteSignals().some((item) => item.key === key);
}

export function toggleTasteSignal(signal: Omit<TasteSignal, "createdAt">): boolean {
  const signals = readTasteSignals();
  const exists = signals.some((item) => item.key === signal.key);
  if (exists) {
    writeJson(
      TASTE_KEY,
      signals.filter((item) => item.key !== signal.key)
    );
    return false;
  }

  const next: TasteSignal = {
    ...signal,
    tags: signal.tags?.map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
    createdAt: new Date().toISOString(),
  };
  writeJson(TASTE_KEY, [next, ...signals].slice(0, 200));
  return true;
}

export function designTasteSummary(limit = 14): string {
  const signals = readTasteSignals().slice(0, limit);
  if (!signals.length) return "";

  const tags = new Map<string, number>();
  for (const signal of signals) {
    for (const tag of signal.tags || []) {
      const clean = tag.trim().toLowerCase();
      if (clean) tags.set(clean, (tags.get(clean) || 0) + 1);
    }
  }

  const topTags = [...tags.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 18)
    .map(([tag]) => tag);

  const likedTitles = signals
    .map((signal) => signal.title)
    .filter(Boolean)
    .slice(0, 8);

  return [
    "Designer taste memory from liked references and generated concepts:",
    likedTitles.length ? `Liked ideas: ${likedTitles.join("; ")}.` : "",
    topTags.length ? `Recurring taste tags: ${topTags.join(", ")}.` : "",
    "Use these likes as preference signals for mood, detail level, novelty, silhouette, commerciality, and styling world. Do not copy any liked image exactly; use them only to understand the designer's taste.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function readBlankBases(): BlankBase[] {
  return readJson<BlankBase[]>(BLANK_BASES_KEY, []).filter(
    (item) => item && item.id && item.imageUrl
  );
}

export function saveBlankBases(bases: BlankBase[]) {
  writeJson(BLANK_BASES_KEY, bases.slice(0, 80));
}

export function addBlankBases(
  uploads: { name?: string; url: string }[],
  existing = readBlankBases()
): BlankBase[] {
  const now = new Date().toISOString();
  const next: BlankBase[] = [
    ...uploads
      .filter((upload) => upload.url && !existing.some((base) => base.imageUrl === upload.url))
      .map((upload) => ({
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: upload.name || "Blank base",
        imageUrl: upload.url,
        createdAt: now,
      })),
    ...existing,
  ].slice(0, 80);
  saveBlankBases(next);
  return next;
}

export function removeBlankBase(id: string): BlankBase[] {
  const next = readBlankBases().filter((base) => base.id !== id);
  saveBlankBases(next);
  return next;
}
