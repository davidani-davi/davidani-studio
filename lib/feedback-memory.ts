export type FeedbackStudio = "image" | "model" | "model-beta";

export type FeedbackIssueKey =
  | "too-cropped"
  | "wrong-patch-placement"
  | "model-face-changed"
  | "fabric-texture-lost"
  | "too-ai-looking";

export interface FeedbackIssue {
  key: FeedbackIssueKey;
  label: string;
  prompt: string;
}

export interface FeedbackMemoryItem {
  id: string;
  createdAt: number;
  studio?: FeedbackStudio;
  generationId?: string;
  issueKeys: FeedbackIssueKey[];
  note?: string;
  sourceUrl?: string | null;
  resultUrl?: string | null;
}

const FEEDBACK_MEMORY_KEY = "davidani_feedback_memory_v1";
const LEGACY_IMAGE_FEEDBACK_MEMORY_KEY = "davidani_image_feedback_memory_v1";

export const FEEDBACK_ISSUES: FeedbackIssue[] = [
  {
    key: "too-cropped",
    label: "Too cropped",
    prompt:
      "Do not crop the garment shorter than the uploaded product. Preserve the true body length, sleeve length, hem position, waistband coverage, and full garment proportions from the source.",
  },
  {
    key: "wrong-patch-placement",
    label: "Wrong patch placement",
    prompt:
      "Preserve patch, embroidery, print, pocket, zipper, hardware, and graphic placement exactly, including wearer-left vs wearer-right orientation and sleeve/chest/back positions.",
  },
  {
    key: "model-face-changed",
    label: "Model face changed",
    prompt:
      "Preserve the selected model identity, face, hair, skin texture, expression, head scale, and body proportions. Do not beautify, repaint, age-shift, or replace the model.",
  },
  {
    key: "fabric-texture-lost",
    label: "Fabric texture lost",
    prompt:
      "Preserve the source fabric texture and material behavior, including knit loops, denim wash, ribbing, sherpa pile, fleece nap, quilting, sheen, drape, wrinkles, and edge finishes.",
  },
  {
    key: "too-ai-looking",
    label: "Too AI-looking",
    prompt:
      "Keep the output photorealistic and production-ready: natural camera optics, believable shadows, realistic hands/edges/stitching, non-glossy skin, no plastic smoothing, no warped seams, and no surreal artifacts.",
  },
];

const issueByKey = new Map(FEEDBACK_ISSUES.map((issue) => [issue.key, issue]));

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function createId() {
  try {
    return crypto.randomUUID?.() || String(Date.now());
  } catch {
    return String(Date.now());
  }
}

function readLegacyMemory(): FeedbackMemoryItem[] {
  if (!canUseStorage()) return [];
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(LEGACY_IMAGE_FEEDBACK_MEMORY_KEY) || "[]"
    ) as Array<{ createdAt?: number; note?: string }>;
    return raw
      .map((item) => ({
        id: `legacy_${item.createdAt || createId()}`,
        createdAt: item.createdAt || Date.now(),
        studio: "image" as const,
        issueKeys: [] as FeedbackIssueKey[],
        note: item.note || "",
      }))
      .filter((item) => item.note.trim());
  } catch {
    return [];
  }
}

export function readFeedbackMemory(): FeedbackMemoryItem[] {
  if (!canUseStorage()) return [];
  try {
    const current = JSON.parse(
      window.localStorage.getItem(FEEDBACK_MEMORY_KEY) || "[]"
    ) as FeedbackMemoryItem[];
    return current.filter((item) => Array.isArray(item.issueKeys));
  } catch {
    return [];
  }
}

export function writeFeedbackMemory(items: FeedbackMemoryItem[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(FEEDBACK_MEMORY_KEY, JSON.stringify(items.slice(0, 80)));
  } catch {
    /* ignore */
  }
}

export function mergeFeedbackMemory(items: FeedbackMemoryItem[]) {
  const merged = [...items, ...readFeedbackMemory()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 80);
  writeFeedbackMemory(merged);
}

export function addFeedbackMemory(input: Omit<FeedbackMemoryItem, "id" | "createdAt">) {
  const issueKeys = Array.from(new Set(input.issueKeys ?? []));
  const note = input.note?.trim();
  if (!issueKeys.length && !note) return null;
  const item: FeedbackMemoryItem = {
    ...input,
    id: createId(),
    createdAt: Date.now(),
    issueKeys,
    note,
  };
  const next: FeedbackMemoryItem[] = [item, ...readFeedbackMemory()];
  writeFeedbackMemory(next);
  return item;
}

export async function loadFeedbackMemoryFromCloud(studio?: FeedbackStudio) {
  if (typeof fetch !== "function") return [];
  try {
    const query = studio ? `?studio=${encodeURIComponent(studio)}` : "";
    const res = await fetch(`/api/feedback-memory${query}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    const items = Array.isArray(data?.items) ? (data.items as FeedbackMemoryItem[]) : [];
    if (items.length) mergeFeedbackMemory(items);
    return items;
  } catch {
    return [];
  }
}

export async function syncFeedbackMemoryToCloud(item: FeedbackMemoryItem | null) {
  if (!item || typeof fetch !== "function") return;
  try {
    await fetch("/api/feedback-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item }),
    });
  } catch {
    /* local memory still works */
  }
}

export function feedbackLabels(issueKeys: FeedbackIssueKey[] = []) {
  return issueKeys
    .map((key) => issueByKey.get(key)?.label)
    .filter((label): label is string => Boolean(label));
}

export function buildFeedbackNote(issueKeys: FeedbackIssueKey[] = [], note = "") {
  const labels = feedbackLabels(issueKeys);
  return [labels.length ? `Issues: ${labels.join(", ")}` : "", note.trim()]
    .filter(Boolean)
    .join(". ");
}

export function feedbackMemorySuffix(studio?: FeedbackStudio, limit = 8) {
  const memory = [...readFeedbackMemory(), ...readLegacyMemory()]
    .filter((item) => !studio || !item.studio || item.studio === studio)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
  if (!memory.length) return "";

  const activeIssues = Array.from(
    new Set(memory.flatMap((item) => item.issueKeys || []))
  )
    .map((key) => issueByKey.get(key))
    .filter((issue): issue is FeedbackIssue => Boolean(issue));
  const notes = memory
    .map((item) => item.note?.trim())
    .filter((note): note is string => Boolean(note))
    .slice(0, 5);

  if (!activeIssues.length && !notes.length) return "";

  return [
    "",
    "AI feedback memory from prior bad generations. Use these as cautionary QA checks when relevant; do not overcorrect if unrelated:",
    ...activeIssues.map((issue) => `- ${issue.label}: ${issue.prompt}`),
    notes.length ? `Recent designer notes: ${notes.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
