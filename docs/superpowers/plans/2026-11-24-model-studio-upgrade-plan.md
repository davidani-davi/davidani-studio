# Model Studio upgrade: move the Faire Model Studio into davidani-studio (research + ranked plan)

Date: 2026-11-24 · Claude Code (Mac mini) · Phase 1 = research only, no code changed.
Status: **waiting for David to pick features.** Nothing below is built.

Rules this plan keeps:
- Never edit the Faire Tools extension or Jeonga's team add-on (David, 2026-11-24). All work lands in davidani-studio (Vercel).
- Follow `davidani-faire-management/docs/simple-garment-swap.md`: real D&D shoot bases, the product photo controls construction, a matching pose reference per view, reviewed hash-bound face contours, and checking the real outputs.
- Higgsfield is free-only (no credits). Codex is the default free image engine, with `codex_guard.py` run before every call.
- New UI uses the Kobra kit (`claude/kobra-foundation`, opt-in `.kobra` scope, `components/kit/RenderStatus.tsx`).

## 1. What exists today

**Extension Model Studio** (`thumbnail-optimizer/model_shots.js` 3,402 lines + `model_shots_core.js` 749 + css 1,274; same files in `faire-daily/listing-shared/`)
- Flow:
  - Load the ERP gallery, colours, OTS and saved shots.
  - Assign the garment photos (front, back and side, plus a full base for bottoms; borrow a donor colour; upload your own photo; build a set sheet).
  - Pick the model or reference set. "Auto by style" lets the studio choose. Simple mode has "Fit + pose" or "Pose only".
  - Pick the editing method (simple, real-shoot, direct or native) and the engine (gpt25, gpt2, nano or tryon).
  - Generate the front first, then "Generate remaining N" with the front as an anchor.
  - Redo with a note, Previous and Compare, Heal and Resume.
  - Tick the views you want, then "Upload to ERP" (Style File) and "Add to listing".
- Shared state lives in the Faire Daily workspace (an encrypted Blob record per style, ETag 409 conflicts, one active job per view, a `setupKey` against `runKey` check). Jobs go through `listing-jobs`, which rewrites them into `POST /api/model-shots`.
- The pure logic sits in CORE (node-testable, 766-line test file): `setupKey`, `setupChanges`, `staleViews`, `otherColorNotes`, the borrow guard, category, hem and framing, `previewAction` front-first, colour-from-filename, `shotFilename`.

**davidani-studio**
- `/api/model-shots` (606 lines) already does the hard part:
  - Simple swap with reviewed contours.
  - Face align and face check with one retry.
  - Heal, async shot-tasks, recast sets, auto plate.
  - The pants collection, borrowed views and the no-plate path.
- **The web `/model-studio` page never calls it.** It runs the older `/api/analyze-model` + `/api/generate-model` pipeline, in `ModelStudioClient.tsx` (3,237 lines).
- In code, "model" means a pose set. There is no first-class *person* (Chloe, Celine, Vision) entity: the identity is implicit in each plate, and faces are protected one photo at a time.
- `mini-worker/wording/` is the outbound-polling Codex worker pattern (leases, `codex_guard`). Model Studio has no such worker yet.

### Gaps (what the web app needs to match the extension)
1. A new client on `/api/model-shots` with front-first, anchor, redo and notes, history, Compare, Heal and Resume.
2. A TypeScript port of CORE plus its tests, so web and extension agree on `setupKey`, framing and borrow rules.
3. A per-style workspace in studio Blob, using the `user-asset-records` new-pathname-per-version pattern, with conflict handling.
4. Studio-side ERP reads: gallery, colours, OTS, and the Style File upload. Reuse the ERP session (one login, one request at a time).
5. The model and set picker, with the set viewer (Replace, Undo, Re-outline), which already exists as `SetPhotos.tsx` and the `/api/user-models` routes.
6. Faire-only steps (Add to listing, square thumbnail, Faire draft) stay in the extension. The web app ends at "Upload to ERP" plus Download.

## 2. Higgsfield research (zero credits spent)
How they keep a person consistent:
- **Soul ID** is a trained identity built from 8-12 varied photos in about 10 minutes. It only works on Soul models, and each generation takes one reference image, so it cannot also take our garment photo plus a pose plate. That rules it out for garment swaps.
- **Elements** are reusable single-image references injected as `<<<id>>>`, several per prompt, on GPT Image 2.x, Nano Banana and Seedream.
- **Character sheet** is a three-panel neutral sheet: front from the neck down, full back, and a head-and-shoulders portrait, on a plain light-grey ground with soft even light and exactly one face. It is the anchor for every later look.
- **Look sheets** attach the face, the new outfit and the parent sheet with an explicit priority order: change request, then outfit image, then base sheet, then archetype.
- **Prompt doctrine**:
  - Every image is named by its role.
  - The face image is the single source of truth.
  - **Facial features are never described in words**, because written features bring in a different person.
  - The outfit image beats any words.
  - Wording is positive only (the model draws every noun it reads), with one light described.
  - On failure it retries once, with a stated reason.
- **Product Photoshoot, virtual try-on** uses no identity at all: it describes a new model from scratch every time. What it adds is UX: 10 modes, up to 3 short intake questions, silent defaults, 3 materially different variants, one focused refinement per variant, and quality gates.
- **AI Influencer** is a structured trait picker (build, hair, skin tone, age, face shape, eyes and so on) plus character-sheet presets.

**Conclusion.** Our face lock (pixel-exact reviewed contours, alignment and face check) is already stronger than anything Higgsfield ships for this job. What we should copy is how they organise a person, their anchor sheets, their prompt contract and their intake and variant UX.

## 3. Ranked recommendations

| # | Feature | Win | Effort | Risks |
|---|---|---|---|---|
| 0 | **Port (foundation):** new Kobra Model Studio page on `/api/model-shots` + CORE port + workspace + ERP reads | Web app does what the extension does; one place to improve | L (2-3 PRs) | Logic drift between the extension and the web app (mitigate: shared test vectors from `test_model_shots_core.js`); ERP load (session reuse, no sweeps) |
| 1 | **Prompt contract audit** in `simple-reference-shot.ts`: role tag + priority line per image, no facial adjectives, positive wording only, one light | Less shoulder/cuff ghosting and drift; cheap | S | Regressions: A/B on a fixed 10-style set, Heal-style same-frame comparison, real outputs reviewed |
| 2 | **Person library:** Chloe, Celine and Vision as first-class people, each with a canonical identity sheet and their approved sets. Pick the person, then the pose | Matches David's "one model per colour gallery" rule; less picking; the base for 3 and 6 | M | `plates.json` migration; must keep hash-bound contours per photo |
| 3 | **Look sheet anchor:** after the front is approved, make one neutral 3-panel look sheet (front, back, portrait) and pass it, instead of only the front, as the continuity image for side, back and full | Back and side views match the front's garment details better | M | +1 render per style; the sheet itself can drift, so it gets the same review; faces still come from the contour lock |
| 4 | **Variants:** 2-3 takes of the front, each with a different light or angle note, then pick one | Fewer redo loops | S | fal spend ×2-3: show the cost, default 1, cap 3 |
| 5 | **Guided intake + presets:** "Catalog (cream set)" by default; at most 3 short questions only when something is missing; one-line recipe summary | Faster for the team; fewer wrong setups | S-M | Can't hide the controls David relies on, so it sits above the full panel |
| 6 | **Cast a new model** with a trait picker → `dd-model` (Codex, free) → David reviews → identity sheet + contours → library | New faces without a shoot | M | Identity drift between Codex passes; David approves every face |
| 7 | **Free Codex preview lane** (mini worker, wording-worker pattern): quick drafts before paid fal renders | Saves fal spend on dead-end setups | M | Codex weekly cap; no face lock, so previews only, never uploaded |
| 8 | Soul ID training | — | — | **Don't build:** it can't take a garment photo; it costs credits; at most later for PoliEco lifestyle shots, with David's OK |

Suggested order: 0, then 1 (they can run in parallel), then 2 → 3, then 4 and 5. 6 and 7 are optional.

## 4. Build notes per feature
- **0**:
  - Route `/model-studio` → new client; keep the old one at `/model-studio-legacy` until David signs off.
  - `lib/model-shots-core.ts` ported 1:1 with the CORE test vectors.
  - Workspace records at `model-studio/<style>/<version>.json`.
  - RenderStatus for each view.
  - ERP via the studio's own session (shared cookie cache, one request at a time, stop on 403).
- **1**: change only the prompt text. Keep `SIMPLE_PROMPT_VERSION` bumped so Compare shows which version made a render.
- **2**:
  - `lib/people.ts` + `public/models/people.json` (`id`, `name`, `sheetUrl`, `setIds[]`, `approvedBy`, `date`).
  - Use the `character` tags on the catalog for the first pass.
- **3**:
  - `anchorImageUrl` is joined by `anchorSheetUrl`.
  - The prompt line reads "image 3 = look sheet: garment truth for back and side details; face comes from image 1."
- **4**: `variants: 1-3` sent as separate async tasks with a shared `requestId` prefix; the UI shows a strip and a "Use this" button.
- **6, 7**: copy `mini-worker/wording/` (claim, heartbeat, complete, `codex_guard`, never `--allow-credits`).

## 5. Verification for any build
- Unit tests: the CORE port vectors and the prompt-builder snapshots.
- A fixed regression set of 10 styles (tops, dress, pants, set, plus) rendered before and after, and the real images reviewed. Pixel reports alone don't count.
- UI ship gate: screenshots at desktop, 430 and 440; loading, empty and error states; every image loads.
