// The routes the web Model Studio calls. All are same-origin and ride the studio's session cookie.
import type { Catalogue, Gallery, SavedShot } from "@/lib/model-studio/types";

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown> = {}) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.ok === false) {
    const why = typeof body.error === "string" ? body.error : `The studio answered ${res.status}.`;
    throw new ApiError(why === "unauthorized" ? "Your studio session ended. Sign in again." : why, res.status, body);
  }
  return body as T;
}

export const loadCatalogue = () => api<Catalogue & { ok: true }>("/api/model-shots").then((c) => ({ models: c.models || [], people: c.people || [] }));
export const loadGallery = (style: string) => api<Gallery & { ok: true }>(`/api/erp/photos?style=${encodeURIComponent(style)}`);
export const loadSaved = (style: string) => api<{ shots: SavedShot[] }>(`/api/saved-shots?style=${encodeURIComponent(style)}`).then((r) => r.shots || []);

export interface WorkspaceRead { revision: number; savedAt: string | null; studio: unknown }
export const loadWorkspace = (style: string) => api<WorkspaceRead>(`/api/model-studio/workspace?style=${encodeURIComponent(style)}`);
export const saveWorkspace = (style: string, revision: number, studio: unknown) =>
  api<{ revision: number; savedAt: string }>("/api/model-studio/workspace", { method: "PUT", body: JSON.stringify({ style, revision, studio }) });

export const submitShot = (body: unknown) => api<{ taskId?: string; url?: string; status?: string }>("/api/model-shots", { method: "POST", body: JSON.stringify(body) });
export const pollShot = (taskId: string) =>
  api<{ task: { status: "running" | "done" | "failed"; result?: Record<string, unknown> } }>(`/api/model-shots?taskId=${encodeURIComponent(taskId)}`);
export const healShot = (body: unknown) => api<Record<string, unknown>>("/api/model-shots", { method: "POST", body: JSON.stringify(body) });

export const saveShots = (style: string, shots: unknown[]) =>
  api<{ shots: SavedShot[]; added: number }>("/api/saved-shots", { method: "POST", body: JSON.stringify({ style, shots }) });

/** Same-origin copy through /api/download, so the browser keeps the ERP file name (spaces included). */
export async function downloadAs(url: string, name: string): Promise<void> {
  const res = await fetch(`/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new ApiError(`Could not download ${name}.`, res.status);
  const href = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** #3: one paid look sheet from the finished front (app/api/model-studio/look-sheet). */
export const makeLookSheet = (body: {
  frontRenderUrl: string; frontPhotoUrl?: string; hem?: string; backPhotoUrl?: string; sidePhotoUrl?: string; title?: string; color?: string; humanModelId: string; poseId: string;
}) => api<{ url: string }>("/api/model-studio/look-sheet", { method: "POST", body: JSON.stringify({ confirmSpend: true, ...body }) });
