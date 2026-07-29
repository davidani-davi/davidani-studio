# User-Uploaded Reference Images & Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload + save team-shared product-shot reference presets (Image Studio) and add new human models (Model Studio), persisted in Vercel Blob.

**Architecture:** A new `lib/user-assets.ts` stores two JSON indexes + image bytes in Vercel Blob (local `.data/` fallback in dev), mirroring `lib/style-library.ts`. Two new API routes expose list/save/delete. `/api/models` and the Model Studio server pages merge user models into the existing `HumanModel` catalog; the analyze/generate routes resolve user-model pose URLs from Blob before falling back to the filesystem registry. UI: "Save as preset" in Image Studio's sidebar, "+ Add model" in Model Studio's picker, delete affordances on user-added items only.

**Tech Stack:** Next.js 16 App Router, TypeScript, `@vercel/blob` (already a dependency), Tailwind.

## Global Constraints

- **No test framework exists in this repo** (no jest/vitest). Each task's test cycle = `npm run build` (typecheck) and/or `curl` against `npm run dev` on `http://localhost:3000`. Do not add a test framework.
- Dev has no `BLOB_READ_WRITE_TOKEN` → the local `.data/` fallback is what curl tests exercise. That's expected and correct.
- Model uploads: **front photo required**, side/back/full optional; missing views fall back to front.
- IDs: `slug(name)-<base36 timestamp>` so duplicate names never collide.
- Client-side resize with existing `resizeIfNeeded` from `@/lib/image-resize` before any upload (Vercel 4.5 MB body cap).
- Delete affordances appear ONLY on user-added items (`userAdded: true`).
- Commit after every task. Commit messages end with the standard Co-Authored-By/Claude-Session trailer used in this repo's recent commits.
- Working dir: `/Users/davidpark/Downloads/DaviStudio/TBN FORMATING/davidani-studio` (note the space — quote paths).

---

### Task 1: Storage layer — `lib/user-assets.ts`

**Files:**
- Create: `lib/user-assets.ts`

**Interfaces:**
- Consumes: `put`, `list`, `del` from `@vercel/blob`; `fs/promises`, `path`.
- Produces (used by Tasks 2–4):
  - `interface UserReference { id: string; label: string; imageUrl: string; createdAt: string }`
  - `interface UserModel { id: string; name: string; createdAt: string; views: { front: string; side?: string; back?: string; full?: string } }`
  - `listUserReferences(): Promise<UserReference[]>`
  - `saveUserReference(file: File, label: string): Promise<UserReference>`
  - `deleteUserReference(id: string): Promise<void>`
  - `listUserModels(): Promise<UserModel[]>`
  - `saveUserModel(name: string, files: { front: File; side?: File; back?: File; full?: File }): Promise<UserModel>`
  - `deleteUserModel(id: string): Promise<void>`
  - `findUserModelViewUrl(modelId: string, view: "front" | "side" | "back" | "full"): Promise<string | null>`

- [ ] **Step 1: Write `lib/user-assets.ts`**

```ts
// Team-shared user-uploaded assets: Image Studio reference presets and
// Model Studio user-added models. JSON indexes + image bytes live in
// Vercel Blob; when no BLOB_READ_WRITE_TOKEN is set (local dev) both fall
// back to .data/ on disk. Mirrors the lib/style-library.ts pattern.

import fs from "node:fs/promises";
import path from "node:path";
import { del, list, put } from "@vercel/blob";

export interface UserReference {
  id: string;
  label: string;
  imageUrl: string;
  createdAt: string;
}

export interface UserModel {
  id: string;
  name: string;
  createdAt: string;
  views: { front: string; side?: string; back?: string; full?: string };
}

interface ReferenceIndex {
  references: UserReference[];
}
interface ModelIndex {
  models: UserModel[];
}

const REF_INDEX_KEY = "user-references/index.json";
const MODEL_INDEX_KEY = "user-models/index.json";
const LOCAL_REF_STORE = path.join(process.cwd(), ".data", "user-references.json");
const LOCAL_MODEL_STORE = path.join(process.cwd(), ".data", "user-models.json");
const LOCAL_FILES_DIR = path.join(process.cwd(), "public", "user-assets");

function canUseBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function nowIso(): string {
  return new Date().toISOString();
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function makeAssetId(name: string): string {
  return `${slug(name) || "asset"}-${Date.now().toString(36)}`;
}

function fileExt(file: File): string {
  const fromName = (file.name.split(".").pop() || "").toLowerCase();
  if (["png", "jpg", "jpeg", "webp"].includes(fromName)) return fromName;
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/webp") return "webp";
  return "png";
}

// ---------- generic JSON index helpers ----------

async function readLocalJson<T>(store: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(store, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeLocalJson<T>(store: string, value: T): Promise<void> {
  await fs.mkdir(path.dirname(store), { recursive: true });
  await fs.writeFile(store, JSON.stringify(value, null, 2));
}

async function readBlobJson<T>(key: string, localStore: string, fallback: T): Promise<T> {
  if (!canUseBlob()) return readLocalJson(localStore, fallback);
  try {
    const found = await list({ prefix: key, limit: 1 });
    const blob = found.blobs.find((item) => item.pathname === key) ?? found.blobs[0];
    if (!blob) return fallback;
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[user-assets] blob read failed for ${key}:`, err);
    return readLocalJson(localStore, fallback);
  }
}

async function writeBlobJson<T>(key: string, localStore: string, value: T): Promise<void> {
  if (!canUseBlob()) {
    await writeLocalJson(localStore, value);
    return;
  }
  await put(key, JSON.stringify(value, null, 2), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
  });
}

// ---------- image byte storage ----------

/**
 * Store image bytes and return a stable public URL. In production this is a
 * Vercel Blob URL; in dev the file is written under public/user-assets/ and
 * served by Next at /user-assets/... (relative URL — the client resolves it
 * against the origin, same as the hardcoded /product-shots/ presets).
 */
async function storeImage(key: string, file: File): Promise<string> {
  if (canUseBlob()) {
    const blob = await put(key, file, { access: "public", allowOverwrite: true });
    return blob.url;
  }
  const target = path.join(LOCAL_FILES_DIR, key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, Buffer.from(await file.arrayBuffer()));
  return `/user-assets/${key}`;
}

async function removeImage(url: string): Promise<void> {
  try {
    if (canUseBlob() && url.startsWith("https://")) {
      await del(url);
    } else if (url.startsWith("/user-assets/")) {
      await fs.rm(path.join(process.cwd(), "public", url.slice(1)), { force: true });
    }
  } catch (err) {
    console.warn("[user-assets] image delete failed (index already updated):", err);
  }
}

// ---------- references ----------

export async function listUserReferences(): Promise<UserReference[]> {
  const index = await readBlobJson<ReferenceIndex>(REF_INDEX_KEY, LOCAL_REF_STORE, {
    references: [],
  });
  return Array.isArray(index.references) ? index.references : [];
}

export async function saveUserReference(file: File, label: string): Promise<UserReference> {
  const id = makeAssetId(label);
  const imageUrl = await storeImage(`user-references/${id}.${fileExt(file)}`, file);
  const entry: UserReference = { id, label: label.trim(), imageUrl, createdAt: nowIso() };
  const references = [...(await listUserReferences()), entry];
  await writeBlobJson(REF_INDEX_KEY, LOCAL_REF_STORE, { references });
  return entry;
}

export async function deleteUserReference(id: string): Promise<void> {
  const references = await listUserReferences();
  const target = references.find((r) => r.id === id);
  await writeBlobJson(REF_INDEX_KEY, LOCAL_REF_STORE, {
    references: references.filter((r) => r.id !== id),
  });
  if (target) await removeImage(target.imageUrl);
}

// ---------- models ----------

const MODEL_VIEWS = ["front", "side", "back", "full"] as const;
export type UserModelView = (typeof MODEL_VIEWS)[number];

export async function listUserModels(): Promise<UserModel[]> {
  const index = await readBlobJson<ModelIndex>(MODEL_INDEX_KEY, LOCAL_MODEL_STORE, {
    models: [],
  });
  return Array.isArray(index.models) ? index.models : [];
}

export async function saveUserModel(
  name: string,
  files: { front: File; side?: File; back?: File; full?: File }
): Promise<UserModel> {
  const id = makeAssetId(name);
  const views: UserModel["views"] = { front: "" };
  for (const view of MODEL_VIEWS) {
    const file = files[view];
    if (!file) continue;
    views[view] = await storeImage(`user-models/${id}/${view}.${fileExt(file)}`, file);
  }
  const entry: UserModel = { id, name: name.trim(), createdAt: nowIso(), views };
  const models = [...(await listUserModels()), entry];
  await writeBlobJson(MODEL_INDEX_KEY, LOCAL_MODEL_STORE, { models });
  return entry;
}

export async function deleteUserModel(id: string): Promise<void> {
  const models = await listUserModels();
  const target = models.find((m) => m.id === id);
  await writeBlobJson(MODEL_INDEX_KEY, LOCAL_MODEL_STORE, {
    models: models.filter((m) => m.id !== id),
  });
  if (target) {
    for (const url of Object.values(target.views)) {
      if (url) await removeImage(url);
    }
  }
}

/**
 * If modelId is a user-added model, return the stored URL for the requested
 * view (falling back to front). Returns null for built-in models so callers
 * can fall through to the filesystem registry.
 */
export async function findUserModelViewUrl(
  modelId: string,
  view: UserModelView
): Promise<string | null> {
  const models = await listUserModels();
  const model = models.find((m) => m.id === modelId);
  if (!model) return null;
  return model.views[view] || model.views.front || null;
}
```

- [ ] **Step 2: Gitignore the dev fallback dirs**

Append to `.gitignore`:

```
# user-assets dev fallback (Blob substitute when no BLOB_READ_WRITE_TOKEN)
/public/user-assets/
/.data/
```

(Check first whether `.data/` is already ignored; don't duplicate.)

- [ ] **Step 2b: Verify it typechecks**

Run: `cd "/Users/davidpark/Downloads/DaviStudio/TBN FORMATING/davidani-studio" && npx tsc --noEmit`
Expected: exits 0 (pre-existing unrelated errors, if any, must match the count before your change — run once before editing to baseline).

- [ ] **Step 3: Commit**

```bash
git add lib/user-assets.ts
git commit -m "feat(user-assets): blob-backed storage for user references + models"
```

---

### Task 2: API route — `/api/user-references`

**Files:**
- Create: `app/api/user-references/route.ts`

**Interfaces:**
- Consumes: `listUserReferences`, `saveUserReference`, `deleteUserReference` from `@/lib/user-assets` (Task 1).
- Produces (used by Task 5): `GET → { ok: true, references: UserReference[] }`; `POST multipart(file, label) → { ok: true, reference: UserReference }`; `DELETE ?id=<id> → { ok: true }`. Errors: `{ ok: false, error: string }` with 400/500.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import {
  deleteUserReference,
  listUserReferences,
  saveUserReference,
} from "@/lib/user-assets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, references: await listUserReferences() });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to list references" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const label = String(form.get("label") ?? "").trim();
    if (!(file instanceof File) || !file.type.startsWith("image/")) {
      return NextResponse.json({ ok: false, error: "An image file is required." }, { status: 400 });
    }
    if (!label) {
      return NextResponse.json({ ok: false, error: "A preset name is required." }, { status: 400 });
    }
    const reference = await saveUserReference(file, label);
    return NextResponse.json({ ok: true, reference });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to save reference" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
    }
    await deleteUserReference(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to delete reference" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify with curl against dev server**

Start dev server in background if not running: `npm run dev`. Note: the proxy middleware password-gates pages; API routes under `/api` may also be gated — if curl gets a redirect to /login, log in via browser once and reuse the cookie, or temporarily test with `curl -b "<auth cookie>"`. Check `proxy.ts` to see if `/api/user-references` needs the cookie.

```bash
curl -s -X POST http://localhost:3000/api/user-references \
  -F "label=Test preset" -F "file=@public/product-shots/style-reference.png"
# Expected: {"ok":true,"reference":{"id":"test-preset-...","label":"Test preset","imageUrl":"/user-assets/user-references/test-preset-....png",...}}
curl -s http://localhost:3000/api/user-references
# Expected: the saved reference in the list
curl -s -X DELETE "http://localhost:3000/api/user-references?id=<id from above>"
# Expected: {"ok":true}; GET now returns empty list; public/user-assets/... file removed
```

- [ ] **Step 3: Commit**

```bash
git add app/api/user-references/route.ts
git commit -m "feat(api): /api/user-references — list/save/delete saved reference presets"
```

---

### Task 3: API route — `/api/user-models`

**Files:**
- Create: `app/api/user-models/route.ts`

**Interfaces:**
- Consumes: `listUserModels`, `saveUserModel`, `deleteUserModel` from `@/lib/user-assets`.
- Produces (used by Task 6): `GET → { ok: true, models: UserModel[] }`; `POST multipart(name, front, side?, back?, full?) → { ok: true, model: UserModel }`; `DELETE ?id= → { ok: true }`.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { deleteUserModel, listUserModels, saveUserModel } from "@/lib/user-assets";

export const runtime = "nodejs";
export const maxDuration = 120;

function asImage(value: FormDataEntryValue | null): File | undefined {
  return value instanceof File && value.type.startsWith("image/") ? value : undefined;
}

export async function GET() {
  try {
    return NextResponse.json({ ok: true, models: await listUserModels() });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to list models" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    const front = asImage(form.get("front"));
    if (!name) {
      return NextResponse.json({ ok: false, error: "A model name is required." }, { status: 400 });
    }
    if (!front) {
      return NextResponse.json(
        { ok: false, error: "A front photo is required." },
        { status: 400 }
      );
    }
    const model = await saveUserModel(name, {
      front,
      side: asImage(form.get("side")),
      back: asImage(form.get("back")),
      full: asImage(form.get("full")),
    });
    return NextResponse.json({ ok: true, model });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to save model" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
    }
    await deleteUserModel(id);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to delete model" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify with curl**

```bash
curl -s -X POST http://localhost:3000/api/user-models \
  -F "name=Test Model" -F "front=@public/product-shots/style-reference.png"
# Expected: {"ok":true,"model":{"id":"test-model-...","views":{"front":"/user-assets/user-models/test-model-.../front.png"}}}
curl -s -X POST http://localhost:3000/api/user-models -F "name=No Front"
# Expected: 400 {"ok":false,"error":"A front photo is required."}
curl -s -X DELETE "http://localhost:3000/api/user-models?id=<id>"
# Expected: {"ok":true}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/user-models/route.ts
git commit -m "feat(api): /api/user-models — list/save/delete user-added models"
```

---

### Task 4: Merge user models into the catalog + pose URL resolution

**Files:**
- Modify: `lib/models-registry.ts` (add `userAdded?: boolean` to `HumanModel`; add `listAllHumanModels()`)
- Modify: `app/api/models/route.ts` (return merged list)
- Modify: `app/model-studio/page.tsx`, `app/model-studio-beta/page.tsx` (await merged list)
- Modify: `app/api/analyze-model/route.ts:38-46` and `app/api/generate-model/route.ts:15-25` (user-model branch in the pose-URL helper)

**Interfaces:**
- Consumes: `listUserModels`, `findUserModelViewUrl` from `@/lib/user-assets`.
- Produces: `listAllHumanModels(): Promise<HumanModel[]>` — filesystem models followed by user models converted to `HumanModel` shape with `userAdded: true` and a single pose with id `` `${model.id}-pose` ``.

- [ ] **Step 1: Add `userAdded` flag and `listAllHumanModels` to `lib/models-registry.ts`**

In the `HumanModel` interface add:

```ts
  /** True for user-uploaded models stored in Blob (deletable in the UI). */
  userAdded?: boolean;
```

At the bottom of the file add (plus `import { listUserModels } from "./user-assets";` at the top):

```ts
/**
 * Filesystem/static models followed by user-uploaded (Blob) models converted
 * to the HumanModel shape. Async because user models live in Blob storage.
 */
export async function listAllHumanModels(): Promise<HumanModel[]> {
  const userModels = await listUserModels().catch((err) => {
    console.warn("[models-registry] user models unavailable:", err);
    return [];
  });
  const converted: HumanModel[] = userModels.map((um) => {
    const views: ModelPose["views"] = {};
    for (const view of ["front", "side", "back", "full"] as const) {
      const url = um.views[view];
      if (url) views[view] = { filename: view, publicPath: url };
    }
    return {
      id: um.id,
      name: um.name,
      userAdded: true,
      poses: [
        {
          id: `${um.id}-pose`,
          label: um.name,
          publicPath: um.views.front,
          filename: "front",
          subdir: "",
          views,
        },
      ],
    };
  });
  return [...listHumanModels(), ...converted];
}
```

- [ ] **Step 2: Return the merged list from `/api/models`**

In `app/api/models/route.ts` replace `listHumanModels()` with `await listAllHumanModels()` (update the import accordingly).

- [ ] **Step 3: Await the merged list in both server pages**

In `app/model-studio/page.tsx` and `app/model-studio-beta/page.tsx`:

```ts
import { listAllHumanModels } from "@/lib/models-registry";

export default async function ModelStudioPage() {
  const humanModels = await listAllHumanModels();
  return <ModelStudioClient initialHumanModels={humanModels} />;
}
```

(beta page keeps its `beta` prop.)

- [ ] **Step 4: User-model branch in both pose-URL helpers**

In `app/api/analyze-model/route.ts` and `app/api/generate-model/route.ts`, each has a local async helper that currently does:

```ts
  if (process.env.VERCEL) {
    const publicPath = getPosePublicPath(modelId, poseId, view, poseVariantIndex);
    return new URL(publicPath, req.url).toString();
  }
  return getPoseUrl(modelId, poseId, view, poseVariantIndex);
```

Add BEFORE that block (and `import { findUserModelViewUrl } from "@/lib/user-assets";`):

```ts
  // User-added models store absolute Blob URLs (dev: /user-assets/ paths) —
  // resolve those directly; built-in models fall through to the registry.
  const userUrl = await findUserModelViewUrl(modelId, view);
  if (userUrl) {
    return userUrl.startsWith("http") ? userUrl : new URL(userUrl, req.url).toString();
  }
```

(Both helpers already receive `req`; if one doesn't, use its existing URL-building pattern — check the enclosing function signature.)

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` → clean (vs. baseline).
Curl: `curl -s http://localhost:3000/api/models | python3 -c "import json,sys; d=json.load(sys.stdin); print([m['id'] for m in d['models']])"` after POSTing a test model via Task 3 — the test model id must appear with `userAdded: true`.

- [ ] **Step 6: Commit**

```bash
git add lib/models-registry.ts app/api/models/route.ts app/model-studio/page.tsx app/model-studio-beta/page.tsx app/api/analyze-model/route.ts app/api/generate-model/route.ts
git commit -m "feat(models): merge blob user models into catalog + pose URL resolution"
```

---

### Task 5: Image Studio UI — save/delete reference presets

**Files:**
- Modify: `lib/product-shot-references.ts` (extend type)
- Modify: `app/page.tsx` (fetch user refs, keep last uploaded file, save/delete handlers)
- Modify: `components/Sidebar.tsx` (Save-as-preset UI, delete × on user presets)

**Interfaces:**
- Consumes: `/api/user-references` (Task 2).
- Produces: `ProductShotReference` gains `userAdded?: boolean`.

- [ ] **Step 1: Extend the type**

In `lib/product-shot-references.ts`, the exported entry type (or inline shape) gains `userAdded?: boolean`. If the type lives elsewhere (Sidebar imports `ProductShotReference` — find its definition with `grep -rn "ProductShotReference" lib components app --include="*.ts*"`), add the optional field there.

- [ ] **Step 2: Wire state + handlers in `app/page.tsx`**

Near the existing reference state (`~line 214-227`):

```ts
  const [userReferences, setUserReferences] = useState<
    { id: string; label: string; imageUrl: string }[]
  >([]);
  const [referenceSaving, setReferenceSaving] = useState(false);
  // Bytes of the last successfully uploaded custom reference — needed to save
  // it as a preset (the fal URL from /api/upload isn't guaranteed permanent).
  const lastReferenceFileRef = useRef<File | null>(null);

  useEffect(() => {
    fetch("/api/user-references")
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setUserReferences(d.references);
      })
      .catch(() => {});
  }, []);
```

In `replaceReferenceImage`, after `const resized = await resizeIfNeeded(file);` add:

```ts
      lastReferenceFileRef.current = resized;
```

Add the save + delete handlers next to `resetReferenceImage`:

```ts
  async function saveReferenceAsPreset(label: string) {
    const file = lastReferenceFileRef.current;
    if (!file) return;
    setReferenceSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("label", label);
      const data = await fetchJson("Save reference preset", "/api/user-references", {
        method: "POST",
        body: form,
      });
      const saved = data.reference as { id: string; label: string; imageUrl: string };
      setUserReferences((existing) => [...existing, saved]);
      // Select the saved preset and clear the one-off override so the grid
      // checkmark reflects reality.
      setSelectedProductShotPath(saved.imageUrl);
      setReferenceImageUrl(null);
      lastReferenceFileRef.current = null;
    } catch (err: any) {
      setError(err.message || "Saving preset failed");
    } finally {
      setReferenceSaving(false);
    }
  }

  async function deleteReferencePreset(id: string) {
    try {
      await fetchJson("Delete reference preset", `/api/user-references?id=${id}`, {
        method: "DELETE",
      });
      setUserReferences((existing) => {
        const removed = existing.find((r) => r.id === id);
        if (removed && selectedProductShotPath === removed.imageUrl) {
          setSelectedProductShotPath(PRODUCT_SHOT_REFERENCES[0]?.path ?? "");
        }
        return existing.filter((r) => r.id !== id);
      });
    } catch (err: any) {
      setError(err.message || "Deleting preset failed");
    }
  }
```

Merge for the sidebar prop (replace the current `productShotReferences={PRODUCT_SHOT_REFERENCES}` at `~line 985`):

```ts
            productShotReferences={[
              ...PRODUCT_SHOT_REFERENCES,
              ...userReferences.map((r) => ({
                id: r.id,
                label: r.label,
                path: r.imageUrl,
                userAdded: true as const,
              })),
            ]}
            canSaveReference={Boolean(referenceImageUrl && lastReferenceFileRef.current)}
            referenceSaving={referenceSaving}
            onReferenceSave={saveReferenceAsPreset}
            onPresetDelete={deleteReferencePreset}
```

- [ ] **Step 3: Sidebar UI in `components/Sidebar.tsx`**

Add to the props interface (after `referenceUploading: boolean;`):

```ts
  /** True when a freshly uploaded custom reference can be saved as a preset. */
  canSaveReference: boolean;
  referenceSaving: boolean;
  onReferenceSave: (label: string) => void;
  onPresetDelete: (id: string) => void;
```

Add local state inside the component: `const [presetName, setPresetName] = useState("");`

Directly after the Replace/Reset button row (after the `</div>` closing `mt-2 flex gap-1.5`, `~line 429`), add:

```tsx
            {p.canSaveReference && (
              <div className="mt-2 flex gap-1.5">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Preset name"
                  className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[11px] text-neutral-700 placeholder:text-neutral-400 focus:border-brand-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const label = presetName.trim();
                    if (!label) return;
                    p.onReferenceSave(label);
                    setPresetName("");
                  }}
                  disabled={p.referenceSaving || !presetName.trim()}
                  className="rounded-md border border-brand-300 bg-brand-50 px-2 py-1.5 text-[11px] font-medium text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {p.referenceSaving ? "Saving…" : "Save as preset"}
                </button>
              </div>
            )}
```

In the preset grid button (`~line 450-476`): the outer element is currently a `<button>`; a nested delete button inside a button is invalid HTML. Change the outer `<button>` to a `<div role="button" tabIndex={0}` with the same className and `onClick`, and add inside it, after the checkmark span:

```tsx
                    {ref.userAdded && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete preset "${ref.label}"?`)) p.onPresetDelete(ref.id);
                        }}
                        title="Delete preset"
                        className="absolute left-1 top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-neutral-800/70 text-[9px] font-bold text-white group-hover:flex"
                      >
                        ×
                      </button>
                    )}
```

- [ ] **Step 4: Verify**

`npx tsc --noEmit` clean. Then in a browser on `npm run dev` (`/` page): upload a custom reference → name it → Save as preset → tile appears in grid with delete × on hover → refresh page → tile persists → delete works.

- [ ] **Step 5: Commit**

```bash
git add lib/product-shot-references.ts app/page.tsx components/Sidebar.tsx
git commit -m "feat(image-studio): save uploaded references as team-shared presets"
```

---

### Task 6: Model Studio UI — add/delete user models

**Files:**
- Modify: `components/ModelStudioClient.tsx:395` (add setter + refresh)
- Modify: `components/ModelSidebar.tsx` (+ Add model form, delete on user models)

**Interfaces:**
- Consumes: `/api/user-models` (Task 3), merged `/api/models` (Task 4), `resizeIfNeeded` from `@/lib/image-resize`.
- Produces: ModelSidebar props gain `onModelsRefresh: () => Promise<void>`.

- [ ] **Step 1: Setter + refresh in `ModelStudioClient.tsx`**

Change line 395 to:

```ts
  const [humanModels, setHumanModels] = useState<HumanModel[]>(initialHumanModels);
```

Add below it:

```ts
  async function refreshHumanModels() {
    try {
      const res = await fetch("/api/models", { cache: "no-store" });
      const data = await res.json();
      if (data?.ok && Array.isArray(data.models)) setHumanModels(data.models);
    } catch (err) {
      console.warn("[model-studio] models refresh failed:", err);
    }
  }
```

Pass to the sidebar at `~line 2628` alongside `humanModels={humanModels}`:

```ts
            onModelsRefresh={refreshHumanModels}
```

- [ ] **Step 2: Add-model form + delete in `ModelSidebar.tsx`**

Imports: `import { useRef, useState } from "react";` (merge with existing), `import { resizeIfNeeded } from "@/lib/image-resize";`

Props: add `onModelsRefresh: () => Promise<void>;`

Component-local state:

```ts
  const [addingModel, setAddingModel] = useState(false);
  const [newModelName, setNewModelName] = useState("");
  const [newModelFiles, setNewModelFiles] = useState<{
    front?: File;
    side?: File;
    back?: File;
    full?: File;
  }>({});
  const [addModelBusy, setAddModelBusy] = useState(false);
  const [addModelError, setAddModelError] = useState<string | null>(null);

  async function submitNewModel() {
    if (!newModelName.trim() || !newModelFiles.front) return;
    setAddModelBusy(true);
    setAddModelError(null);
    try {
      const form = new FormData();
      form.append("name", newModelName.trim());
      for (const view of ["front", "side", "back", "full"] as const) {
        const file = newModelFiles[view];
        if (file) form.append(view, await resizeIfNeeded(file));
      }
      const res = await fetch("/api/user-models", { method: "POST", body: form });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "Failed to add model");
      await p.onModelsRefresh();
      p.onHumanModelChange(data.model.id);
      setAddingModel(false);
      setNewModelName("");
      setNewModelFiles({});
    } catch (err: any) {
      setAddModelError(err.message || "Failed to add model");
    } finally {
      setAddModelBusy(false);
    }
  }

  async function deleteUserModel(id: string, name: string) {
    if (!confirm(`Delete model "${name}"? This removes it for the whole team.`)) return;
    try {
      const res = await fetch(`/api/user-models?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || "Delete failed");
      await p.onModelsRefresh();
      if (p.selectedHumanModelId === id) {
        const fallback = p.humanModels.find((m) => m.id !== id);
        if (fallback) p.onHumanModelChange(fallback.id);
      }
    } catch (err: any) {
      setAddModelError(err.message || "Delete failed");
    }
  }
```

In the model tile render (the `familyModels.map` button, `~line 419`): the tile is a `<button>` — as in Task 5, nested buttons are invalid, so on user-added models render the delete control as a sibling overlay. Simplest correct approach: change the tile `<button>` to `<div role="button" tabIndex={0}` with identical classes/onClick, then inside after the name markup add:

```tsx
                          {m.userAdded && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteUserModel(m.id, m.name);
                              }}
                              title="Delete model"
                              className="absolute right-1 top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-neutral-800/70 text-[9px] font-bold text-white group-hover:flex"
                            >
                              ×
                            </button>
                          )}
```

(Add `relative` to the tile's className if not already present.)

After the family-bucket render block (after the `})()` IIFE, still inside the models section), add the Add-model tile + form:

```tsx
          {!addingModel ? (
            <button
              type="button"
              onClick={() => setAddingModel(true)}
              className="mt-2 w-full rounded-lg border border-dashed border-neutral-300 bg-white px-2 py-2.5 text-[11px] font-medium text-neutral-500 transition hover:border-brand-400 hover:text-brand-600"
            >
              + Add model
            </button>
          ) : (
            <div className="mt-2 space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <input
                type="text"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                placeholder="Model name"
                className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[11px] focus:border-brand-400 focus:outline-none"
              />
              {(["front", "side", "back", "full"] as const).map((view) => (
                <label key={view} className="flex items-center gap-2 text-[11px] text-neutral-600">
                  <span className="w-10 capitalize">
                    {view}
                    {view === "front" ? " *" : ""}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      setNewModelFiles((existing) => ({ ...existing, [view]: file }));
                    }}
                    className="flex-1 text-[10px]"
                  />
                </label>
              ))}
              {addModelError && <p className="text-[10px] text-red-600">{addModelError}</p>}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => void submitNewModel()}
                  disabled={addModelBusy || !newModelName.trim() || !newModelFiles.front}
                  className="flex-1 rounded-md border border-brand-300 bg-brand-50 px-2 py-1.5 text-[11px] font-medium text-brand-700 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addModelBusy ? "Saving…" : "Save model"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingModel(false);
                    setAddModelError(null);
                  }}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[11px] text-neutral-600 hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
```

- [ ] **Step 3: Verify**

`npx tsc --noEmit` clean. Browser on `/model-studio`: + Add model → name + front photo → Save → model appears in picker (own family bucket) and is auto-selected → run a generation (all 4 views must complete; back/side/full fall back to the front photo) → hover model tile shows × → delete works and selection falls back.

- [ ] **Step 4: Commit**

```bash
git add components/ModelStudioClient.tsx components/ModelSidebar.tsx
git commit -m "feat(model-studio): add + delete user-uploaded models in the picker"
```

---

### Task 7: Build, deploy, end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: compiles with no type errors.

- [ ] **Step 2: Confirm Blob token exists in production**

Run: `npx vercel env ls 2>&1 | grep -i blob`
Expected: `BLOB_READ_WRITE_TOKEN` present for production (it should be — style library already uses Blob). If missing, STOP and tell the user it must be added in the Vercel dashboard.

- [ ] **Step 3: Deploy**

Run: `npx vercel --prod --yes`
Expected: "Ready". Production URL: https://davidani-studio.vercel.app

- [ ] **Step 4: Manual e2e on production (user or agent via browser)**

1. Image Studio: upload reference → Save as preset → hard refresh → persists → select it → generate → delete it.
2. Model Studio: + Add model (front only) → generate all 4 views → delete model.
3. Second browser/incognito (after login): saved items visible (team-shared).

- [ ] **Step 5: Report results to user, including anything that failed.**
