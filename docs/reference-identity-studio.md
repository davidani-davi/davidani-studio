# Reference Identity Studio

Open `/reference-identity-studio` from Model Studio → Create reference identities,
 or from Models & pose references. Uses the existing Studio sign-in.

1. Choose Celine (loose hair or half-up hair) or Vision (blonde). The visible
   thumbnail is the actual identity master, stored unchanged in `public/identity-masters`.
2. Name the reference set and upload any combination of front, side, back and full.
   PNG/JPEG/WebP, 20 MB maximum; uploaded photos are decoded and validated before generation.
3. Select views and generate. Four selected views submit four independent edits.
4. Reopen a saved run to see its results. Each card offers the original PNG,
   the two input photos, the exact prompt and provider request ID. Select any
   sources and generate again to create a new run without altering old results.
5. Save selected completed results to the model library. Review face-protection
   boundaries for future garment edits; this step never modifies these images.
   The new library entry is imported in one event, and can then be renamed,
   replaced per photo, deleted or restored in `/admin/models`.

## Generation contract

`lib/reference-identity-core.ts` defines the single approved prompt, shared by
all four views. Image 1 = that view's original upload. Image 2 = selected original
identity master. GPT Image 2.5 via the app's existing fal endpoint, high quality,
PNG, one image per call. `verbatimPrompt:true`, `useDefaultReference:false`,
`outputSize:null`; no `raw:true` (it invokes legacy face neutralization), masks,
retouching, sharpening, output resizing, portrait fallback or generated-front chaining.
This uses the application's provider; it does not claim identical results to
Codex's built-in image generation service. Identity/garment fidelity is reviewed visually.

## Persistence and failure recovery

Immutable `reference-identity/sets/<UUID>.json` receipts capture source filenames,
URLs, identity master, prompt and model. Each angle reserves a unique existing
`shot-tasks/identity-<UUID>-<view>.json` task before scheduling work with `after()`.
Retrying an identical submission resumes unreserved jobs; existing tasks never
trigger another paid call. Inputs cannot be changed under an existing request ID.
The client keeps its unconfirmed request ID locally for safe network retries.
Provider errors are per view. Permanent PNG storage gets three attempts without
re-generating. If storage fails, the provider image remains downloadable with a
warning; it cannot be imported until uploaded through reference admin.
Sources/results are immutable `model-admin/photos` assets. Production requires
Blob persistence. Local development falls back to `.data` and `public/user-assets`.

## Verification

- `npm test` and `npm run build`.
- `scripts/test-reference-identity-studio.cjs`: browser flow with real local
  uploads and mocked generation. Uses the same local setup as model admin's test.
- Real production test uses DETP60100 front `_5(1)`, side `_11(1)`, back `_15(1)`,
  full `_2(1)` with Celine's original loose-hair brown-jacket identity master.

The live run link accepts `?set=<UUID>` for reopening from another device.
If a worker exceeds its deadline without finishing, its view becomes retryable;
no new paid generation is started automatically by polling.
