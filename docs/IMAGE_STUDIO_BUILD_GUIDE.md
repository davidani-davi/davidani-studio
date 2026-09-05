# Image Studio — complete build guide

How the Davi & Dani Image Studio is built, in the order you would build it
again from an empty folder. Written to be handed to another engineer or agent
with no access to this repo: every load-bearing constant, prompt clause and
gotcha is stated here rather than referenced.

Current build: `davidani-studio` v0.2.0.0, Next.js 16 App Router, deployed on
Vercel (`davidani-studio.vercel.app`).

---

## 0. What it actually does

One operator takes an iPhone photo of a garment on a table, a floor, a
play-mat — anything. Image Studio returns a Zara-grade catalog flat lay of
that garment: same background, same framing, same lighting as every other
product in the catalog, at a fixed pixel size, every time.

The whole design follows from one fact: **the approved look is a composite,
not a photograph.** It was measured off `davi-flatlay.psd`, a hand-built comp
whose reference layer is byte-identical `#edeeee` everywhere outside a ~20px
edge halo. No camera produces that. So the target is not "take a nicer photo",
it is "generate → snap the background to a flat fill → deliver at a locked
size". There is **no cast shadow** in the approved look (the PSD has a shadow
layer, switched off — an abandoned experiment, not the standard).

Locked product constants — hardcode these, never let a UI control them:

| Thing | Value | Enforced in |
|---|---|---|
| Canvas | 2160 × 2700 (4:5 portrait) | server-side in `/api/generate` + `/api/finalize-image` |
| Backdrop | `#edeeee` / rgb(237,238,238) | canvas presets + post-render snap |
| Delivered format | JPEG, sharp quality 92, mozjpeg | `/api/finalize-image` |
| Generation aspect ratio | `"4:5"` | must match the canvas — see gotcha #1 |
| Shadow | none | prompt LIGHTING clause |

---

## 1. Stack and scaffold

```bash
npx create-next-app@latest studio --ts --tailwind --app --eslint
cd studio
npm i @fal-ai/client @vercel/blob sharp clsx tailwind-merge lucide-react motion
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react \
        @testing-library/jest-dom
```

- **Next.js App Router, TypeScript, Tailwind.** Route handlers are the whole
  backend; there is no separate server.
- **fal.ai** for Seedream and GPT Image 2; **kie.ai** for Nano Banana 2. Two
  backends, one dispatcher (§4).
- **sharp** for the resize + background snap. Node runtime only.
- **No database.** History is `localStorage` + an optional Vercel Blob mirror.
- **Vitest** — unit tests live beside the code as `*.test.ts`; run `npm test`
  and `npm run build` before shipping.

Environment variables (`.env.local`, and the same three in Vercel):

```
APP_PASSWORD=…       # one shared team password
AUTH_SECRET=…        # 32+ random chars: openssl rand -hex 32
FAL_KEY=…            # fal.ai dashboard
KIE_AI_API_KEY=…     # kie.ai, for Nano Banana 2
# optional
ERP_USER_ID= / ERP_PASSWORD=      # lets the ERP assert garment category
BLOB_READ_WRITE_TOKEN=            # cloud history mirror
```

---

## 2. Auth — signed cookie, no database

A single shared password. Edge-compatible HMAC over Web Crypto, no library.

`lib/auth.ts`:

```ts
const COOKIE_NAME = "davidani_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return b64url(sig);
}

export async function createSessionToken(secret: string) {
  const payload = JSON.stringify({ iat: Date.now(), exp: Date.now() + MAX_AGE_SECONDS * 1000 });
  const body = b64url(new TextEncoder().encode(payload));
  return `${body}.${await hmac(secret, body)}`;
}
// verifySessionToken: recompute the sig, compare, then check exp.
```

`proxy.ts` at the repo root (Next 16's renamed middleware) redirects everything
unauthenticated to `/login`:

```ts
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/history/cleanup"];
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"] };
```

`/api/auth` POST compares the password server-side and sets the cookie; DELETE
clears it. The password never reaches the client; neither does `FAL_KEY` —
every provider call is proxied through a route handler.

Rotating `APP_PASSWORD` leaves existing sessions valid (same signing secret);
rotating `AUTH_SECRET` kills every session immediately. There is no rate
limiting — if the password leaks, someone can burn your fal.ai credit.

---

## 3. Upload

`/api/upload` (Node runtime, `maxDuration = 120`) takes a multipart form,
pushes each file to fal storage, returns the URLs. Before uploading, normalize
anything the downstream provider will not accept — HEIC from iPhones,
oversized files. kie.ai in particular only accepts a known MIME allowlist, so
there is a compat layer (`lib/kie-image-compat.ts`) that decides pass-through
vs. re-encode, and only trusts a small host allowlist for normalization.

Client-side, resize before upload (`lib/image-resize.ts`) — a 12MP iPhone
photo carries no extra signal for an edit model and costs seconds of upload.

---

## 4. Model catalog and the two backends

`lib/models.ts` is the entire catalog. `inputShape` is the dispatch key: it
selects both the backend and the argument shape.

```ts
export const MODELS = {
  "nano-banana": { endpoint: "nano-banana-2",                    inputShape: "kie" },
  "seedream-4":  { endpoint: "fal-ai/bytedance/seedream/v4/edit", inputShape: "image_urls_seedream" },
  "gpt-image":   { endpoint: "openai/gpt-image-2/edit",           inputShape: "gpt" },
};
```

**kie.ai flow** (async, task-create + poll):

1. `POST https://api.kie.ai/api/v1/jobs/createTask` with
   `{ model, input: { prompt, image_input, aspect_ratio, output_format } }`
   → `{ data: { taskId } }`
2. `GET  …/jobs/recordInfo?taskId=…` every few seconds until
   `state === "success" | "fail"`
3. parse `data.resultJson` → `{ resultUrls: [] }`

Auth is `Authorization: Bearer <KIE_AI_API_KEY>`. The reference-image field
name is model-specific — `nano-banana-2` wants `image_input`, `google/
nano-banana-edit` wants `image_urls`. **Using the wrong field does not error;
it silently falls back to text-to-image** and you get a plausible garment that
is not the customer's garment. Result URLs expire ~24h, so re-host anything
you need to keep.

**fal.ai flow** is `fal.subscribe(endpoint, { input })` with the client
configured once from `FAL_KEY`.

Why the split: fal's `fal-ai/nano-banana/edit` slug serves an older Gemini 2.0
variant — darker output, drops fine detail like fringe. kie.ai proxies current
Nano Banana 2.

---

## 5. The analyze pass

`/api/analyze` is called before generation. It does two things:

1. **Vision.** One call to `fal-ai/any-llm/vision` with
   `anthropic/claude-haiku-4.5`, asked for constrained noun phrases
   (GARMENT / FEATURES / …). Haiku over a bigger model deliberately: the task
   is format-constrained extraction, accuracy is comparable, and it saves ~3s
   per generation. Wrap it in a retry with `[0, 700, 1600]ms` backoff on
   502 / overloaded / rate-limit strings.
2. **Category → canvas.** The garment's category settles which canvas it
   renders onto (§6), then both canvas variants of the prompt are assembled
   and returned.

Two cache lessons baked in:

- Cache the **vision step alone**, keyed only on image URLs + the two-piece
  flag. Prompt assembly is pure and cheap. An earlier version keyed the cache
  on `backgroundMode` too, which paid for a second vision round-trip just to
  describe the same photo against a different canvas.
- Return **both** canvas variants. A front/back run for a category with an
  approved front canvas but no back one needs `preserve` for the front and
  `backdrop` for the back at the same time. Assembling both is free; making
  the client guess is not.

If the ERP (or a decodable style code) asserts the category, trust that over
vision — `CategoryTrust` is `"asserted" | "inferred"` and the registry treats
them differently.

---

## 6. Canvas registry — why one canvas is not enough

`image_urls[0]` is **not** the user's photo. It is an approved studio canvas:
a real flat lay of a *different* garment, on the exact `#edeeee` sweep, at
2160×2700. The prompt is written as a canvas edit — every clause says preserve
the first image's background, lighting and framing. Send no canvas and
`image_urls[0]` becomes the phone photo, and the model faithfully preserves
the bedroom floor. That was back mode's original bug.

Measured garment occupancy varies enormously by category, and the prompt tells
the model to match the canvas's proportional area, so the canvas must match the
category:

```
outerwear  ~77% W × ~54% H      dress   ~50% W × ~76% H
top        ~82% W × ~53% H      skirt   ~52% W × ~69% H
set        ~63% W × ~70% H
```

```ts
const CANVASES = {
  outerwear: { front: "/product-shots/canvas-outerwear-front.png",
               back:  "/product-shots/canvas-outerwear-back.png" },
  top:   { front: "/product-shots/canvas-top-front.png" },
  dress: { front: "/product-shots/canvas-dress-front.png" },
  skirt: { front: "/product-shots/canvas-skirt-front.png" },
  set:   { front: "/product-shots/canvas-set-front.png" },
  // pants: no approved flat lay yet → empty sweep. Deliberately absent rather
  // than pointed at a top canvas, which would ask trousers to fill the frame
  // like a bomber.
};
```

Two background modes:

- **`preserve`** — a real preset canvas with a garment on it. Background *and*
  composition are copied from it.
- **`backdrop`** — `/product-shots/studio-backdrop-empty.png`, the garment-free
  sweep, used as the fallback and for back views. It is the background
  authority but has no subject, so composition cannot be copied; the prompt
  switches to *specifying* framing in words instead.

Category inference is an ordered first-match scan and the order is load-bearing:
`set` before `skirt` ("matching top and skirt set" is a set), `outerwear` before
`top` ("denim jacket"; a cardigan is filed under top because it lies flat like
one), `dress` before `skirt` ("shirt dress"). Avoid bare tokens that trap —
no bare "short" (matches "short sleeve"), no bare "denim", no bare "pant".

Every canvas file must be exactly 2160×2700 and corner-exact `#edeeee`. Enforce
that in a test — a drifting canvas teaches the model the wrong background.

Adding a category later is: shoot one flat lay, drop it in
`public/product-shots/`, add a line to the registry. Until then that category
still ships a clean centred `#edeeee` product shot via the sweep.

---

## 7. The framing spec — measured, not described

The single highest-leverage file. Vague framing ("comfortable, even margins")
is exactly what lets scale drift between rows, and drift is only visible
against a number.

Measured from the PSD's Reference layer (a crew-neck cardigan):

```
canvas            2160 × 2700
garment bbox      x 189–1970, y 623–2060   (1782 × 1438)
side margins      L = R = 189, exactly
occupancy         82.5% width, 53.3% height
```

`189 × 2 + 1782 = 2160` exactly — the garment is fitted to **width** and its
height falls out of the aspect ratio.

Do **not** turn that into "span 82.5% of the width". That is correct for a wide
garment and would push a dress or trousers past the frame. Instead: a centred
**safe area**, with the garment contain-fitted into it — touching on whichever
axis binds first, clearing on the other.

The two axes are **not** symmetric (assuming they were was a real mistake here):

```ts
export const FLATLAY_CANVAS = { width: 2160, height: 2700 };
export const FLATLAY_MARGIN_RATIO = 0.0875;          // 189/2160, from the comp
export const FLATLAY_VERTICAL_MARGIN_RATIO = 0.12;   // from canvas-dress-front
export const FLATLAY_MAX_WIDTH_RATIO  = 1 - 0.0875 * 2;  // 82.5%
export const FLATLAY_MAX_HEIGHT_RATIO = 1 - 0.12   * 2;  // 76%
```

The vertical figure cannot be derived from the comp — on that cardigan width
binds, so its vertical margins are just what fell out of the ratio. It comes
from the tightest height-bound canvas in the library (`canvas-dress-front`, 76.1%
tall, 12.4/11.5% clearance). A square safe area would have enlarged that canvas
to 82.5% and broken the tightest approved tall-garment framing.

Both numbers are **caps**, not targets. The approved library spreads 69–83% on
the binding axis, so a rule forcing the garment to *touch* the safe area would
contradict `skirt-front` and `set-front`; a rule forbidding it to *exceed* the
safe area is consistent with all six.

That function emits the prompt clause verbatim, so the prompt and the spec can
never disagree.

---

## 8. The prompt

Three layers, stacked.

**a. Intent prefix.** Image Studio passes `intent: "product-shot"`; Model
Studio passes `"model-swap"`. They are near-opposites and mixing them is
catastrophic — the model-swap prefix says "do not output a flat lay", which for
Image Studio puts an instruction at position zero telling the model not to make
the deliverable.

**b. Source firewall.** The canvas must not dictate the garment:

> Canvas source firewall: the first image is a studio canvas. It controls the
> background, lighting, shadow character, camera angle, framing, composition,
> and the scale and placement of the garment within the frame — and nothing
> else. Do not borrow any garment category, silhouette, cut, fit, length,
> sleeve or leg shape, hem position, neckline, waistband, fabric, color, print,
> trim, or hardware from the garment shown on the canvas.

Plus, at the top level: *product-only, no human model, no face, no hands, no
body; output exactly one image — not a collage, not a side-by-side, not a grid.*

**c. The body** (`buildTwoImagePrompt(garment, features, backgroundMode)`), in
this order:

1. Garment swap statement — "Replace the garment … with a different garment:
   a {garment}." The clause after the colon is later parsed back out to title
   the run card, so keep the shape.
2. Feature list from vision — "match exactly".
3. **SILHOUETTE AUTHORITY** — silhouette/cut/fit/leg width come from the
   *reference photo*, never the canvas. Without this, Nano Banana inherits the
   canvas's shape and a barrel-fit jean renders straight-leg.
4. Background clause, mode-dependent.
5. **STUDIO COMPOSITION STANDARD** — in `preserve` mode: match the canvas's
   composition exactly, same proportional area, no zoom. In `backdrop` mode:
   the measured framing clause from §7, plus "re-center and straighten rather
   than copying position, angle or scale".
6. **Render fresh** — do not copy the canvas garment's specific wrinkles.
   Arrange as a **filled** flat lay: gently padded from within, sleeves and
   legs keep tubular volume, ribbed collars/cuffs stay raised, the garment sits
   slightly proud of the background.
7. Fabric: smoothly steamed, no harsh creases or storage folds, **but retain
   the soft natural folds a filled garment makes** at the elbow, under the arm,
   above the hem. Asking for zero wrinkles *and* perfect mirror symmetry is what
   produced the cardboard-cutout look.
8. Canonical layout per type, balanced and centred — "but it is a real garment
   resting on a surface, NOT a mirrored graphic: small natural differences
   between the two sleeves are correct and must not be corrected away."
9. **LIGHTING** — flat, even, diffused frontal light, **no cast, drop or
   grounding shadow**; background stays an unbroken sweep right up to the
   garment edge. Only self-shading inside the folds.
10. Remove all neck labels, brand/size/care tags.
11. Garment-isolation and surface-authority clauses — deliberately **last**.
12. "Hyper-realistic 4K e-commerce product photography, Zara-style catalog
    quality."

Two structural rules learned the hard way:

- **Position is load-bearing.** When the isolation clause was inserted right
  after the garment name, it pushed STUDIO COMPOSITION STANDARD from ~46% to
  ~55% of a 26%-longer prompt and garment scale visibly drifted (a cardigan
  went 73% → 81% of frame height against a 53% canvas). New clauses get
  **appended**, so no previously-tuned clause moves and the new one gets
  recency.
- **Descriptor discipline.** Render the template once with empty
  garment/features to collect the descriptor tokens it already uses, then strip
  those (and forbidden non-physical words) from the analyzer's output before
  the real render. Otherwise vision's adjectives duplicate and fight the
  template's.

Per-model normalization lives in `lib/prompt-strategy.ts` — e.g. GPT Image gets
the negative-prompt block stripped and whitespace normalized.

---

## 9. Generate → finalize → snap

`/api/generate` (Node, `maxDuration = 300`):

- Validates `modelId`, non-empty `prompt`, at least one image URL.
- **Ignores any client-supplied output size.** The 2160×2700 lock is resolved
  server-side, so a new UI path, code flow or retry branch can never ship the
  wrong resolution. Raw callers (Image Playground) opt out explicitly.
- `deferResize: true` returns the model's native output immediately.

`/api/finalize-image` then does the expensive part in the background while the
operator already sees an image:

1. fetch the native URL,
2. `normalizeStudioBackground()` — flood-fill the border region and snap it to
   `#edeeee`,
3. sharp resize to 2160×2700, `fit: "cover"`,
4. re-encode JPEG q92 mozjpeg, re-upload, return `{ url, snap }`.

The snap is necessary because the model lands a few levels off even with a
pixel-exact canvas — a measured real run came back `#dfe2e9`, which is 14 off
on R. Ask deterministically, don't ask the prompt more nicely.

**Surface the snap report to the UI.** `BackgroundSnapReport` carries
`{ applied, coverage, sampled, skipReason, failed }`. `skipReason: "border not
neutral"` is exactly what a render on a painted cinderblock ledge produces: the
chroma gate correctly declines, the image ships un-normalized, and at thumbnail
size it looks like every other output. Logging that to the server console makes
a real failure invisible; putting it on the run card makes it labelled. Note the
report type deliberately holds no Buffer and imports only constants, so it can
live in `components/` and be persisted to `localStorage` with the history item.

Batch runs skip finalize and resize inline inside `/api/generate` — so batch
must be told to emit JPEG explicitly, or the two paths deliver different file
types for the same product standard (they did, for a while: JPEG bytes named
`.png`).

---

## 10. The UI — Split Ledger

`app/page.tsx` is a run ledger, not a form:

- **Composer** (bottom) — references, model, prompt, Start.
- **Run ledger** (left rail) — one card per run, with a "New" button in the
  header that empties the composer and drops any pending card.
- **Stage** (right) — the selected run's variants, lightbox, download,
  feedback markup.

Persistence keys (all `localStorage`):

```
davidani_history_v1                  runs
davidani_image_current_run_v1        selected run
davidani_image_jobs_v1               in-flight jobs
image-studio:ledger-width            pane split
davidani_user_id_v1                  who, for the team activity feed
```

**Derive run status once, in a pure tested module.** `lib/run-pipeline.ts`
reduces a run to the four-word strip under its card (intake / side / canvas /
backdrop, each `ok | warn | muted`). The card, the stage header and the ledger
filter all ask the same two questions — what happened, and is it worth a second
look — and three components deriving that independently is three chances to
disagree. It reads only fields the run already stores; nothing new is persisted.

**Stranded runs.** A run card restored from `localStorage` with `pending` set
paints a spinner forever if the tab died mid-generation — one was seen spinning
for 42 hours. `isStrandedRun` / `dropStrandedRuns` drop any pending run past
3× its expected duration with a 10-minute floor, applied on mount, on history
refresh, and on window focus. Expected durations, measured over the 26 Aug test
set: `gpt-image` 120s, `nano-banana` 50s, `seedream-4` 60s.

The client `fetch` for generate aborts at **330s** against a route
`maxDuration` of 300 — the client timeout must be *longer* than the server's,
or you abort a run that was about to succeed.

Optional: mirror history to Vercel Blob (`/api/history`, `lib/cloud-history.ts`)
so a run survives a cleared browser, with a daily cron to prune. Downloads go
through `/api/download`, which has a host allowlist — remember to add the
provider's temp-file host or downloads 403 silently.

---

## 11. Deploy

1. Push to GitHub.
2. Vercel → New Project → import.
3. Add `APP_PASSWORD`, `AUTH_SECRET`, `FAL_KEY`, `KIE_AI_API_KEY`.
4. `vercel.json` for anything needing more than the default duration and for
   crons:

```json
{
  "functions": { "app/api/generate-model/route.ts": { "maxDuration": 800 } },
  "crons": [{ "path": "/api/history/cleanup", "schedule": "30 8 * * *" }]
}
```

Deploys are `git push` only. Hobby tier + a shared password is $0 hosting;
image cost is pass-through (~$0.03/image on Nano Banana or Seedream).

---

## 12. The gotchas, in one list

1. **Aspect ratio must match the output box.** Generate at `4:5`, deliver
   2160×2700. If they disagree, the `fit: "cover"` resize crops to fill — a 2:3
   box on a 4:5 render shaves ~17% of the width and clips sleeve tips.
2. **Never let the client pick the output size.** Lock it server-side.
3. **`image_urls[0]` is always a canvas**, never the user's photo. No canvas =
   the model preserves their bedroom floor.
4. **The prompt intent prefix is not cosmetic.** The model-swap prefix in a
   product-shot run forbids the deliverable.
5. **Appending beats inserting.** Clause position shifts scale.
6. **Don't ban folds.** Zero wrinkles + mirror symmetry = cardboard cutout.
7. **No cast shadow.** The approved comp has none.
8. **kie.ai's image field is model-specific** and the wrong one silently
   degrades to text-to-image.
9. **Client abort > server maxDuration.** 330 vs 300.
10. **Drop stranded pending runs** on mount, refresh and focus.
11. **The two safe-area axes differ.** 8.75% horizontal, 12% vertical.
12. **Surface the background-snap skip reason.** An un-normalized render looks
    fine at thumbnail size.
13. **Test the canvas assets themselves** — exact dimensions, corner-exact
    `#edeeee`.
14. **Batch and single must deliver the same file type.** Batch skips finalize.

---

## 13. Extending it

**A new model:** add an entry to `lib/models.ts` with its `endpoint` and an
`inputShape`; if the backend wants a new argument shape, add the branch in the
`generate()` dispatcher and a case to `lib/prompt-strategy.ts` if it needs
prompt normalization. Add its expected duration to `EXPECTED_RUN_SECONDS`.

**A new garment category:** shoot one approved flat lay at 2160×2700 on exact
`#edeeee`, drop it in `public/product-shots/`, add a line to `CANVASES`, add
the word list to the ordered category scan (mind the first-match order), and
add the asset test. Until it exists, the category already ships via the empty
sweep.

**A new studio:** the pattern generalizes — locked output size in
`lib/output-sizes.ts`, its own intent prefix, its own canvas registry. Model
Studio (2000×3000, 2:3, on-model) is the same machine with the opposite prompt.
