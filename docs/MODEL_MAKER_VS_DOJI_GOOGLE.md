# Our model maker vs Doji vs Google Try On — research, hypotheses, plan (2026-09-05)

Why their pictures pass as photographs and ours read as renders, what they built
that we did not, and what of it we can take. Companion page: the "Try-On Engines
Compared" artifact. Sources at the end. Nothing here changes the shipped pipeline;
the try-on engine described in the plan lives behind an `engine` switch and the
old path is tagged `model-maker-v1-nano-banana-2026-09-05`.

## What each system is

**Ours (davidani-studio `/api/model-shots`, extension "Model shots").** One ERP
garment photo + one house plate (a real studio photograph of one of 27 models,
cream backdrop, 2:3) → four views (front / side / back / full), one call per view.
Each call: two Claude-vision reads (garment, pose), a 1,348-word prompt assembled
from five layers, and `nano-banana-2` (Gemini's image model, via kie.ai) asked to
"edit the first image" at 4K. The output is a whole new frame: 3392×5056, every
pixel generated. Delivery 2000×3000 JPEG into the ERP gallery. 69–340 s a view,
about $0.12 at 4K; Vercel's 300 s cap kills roughly one view in four.

**Doji (doji.com, iOS, $14M seed 2025; Dargan ex-Apple/Meta, Winkens ex-DeepMind).**
The user takes six selfies and two full-body photos; ~30 minutes later they have
a "digital twin" — a per-person model (Lensa-style avatar training, retrainable
from a new photo set). Outfits are rendered onto the twin from product photos or
any pasted URL, with feed, video and a size/fit angle. "Its own diffusion models"
for both the twin and the try-on; nothing about the architecture is published.

**Google (Shopping "try on", Doppl, Vertex AI `virtual-try-on-001`).** The
published core is TryOnDiffusion (CVPR 2023): two U-Nets, one for the person and
one for the garment, sharing information through cross-attention so the garment
is warped *implicitly* rather than cut-and-pasted; trained on **millions of image
pairs of the same person wearing the same garment in two poses** from the Shopping
Graph. The person image is kept; "every pixel of the garment" is generated. 2025
added a selfie path (Nano Banana builds a full-body avatar first), shoes, more
countries, and Doppl (video). The same model is sold to developers on Vertex AI:
`personImage` + `productImages`, output at the input's resolution, up to 4 images
a request, 50 requests a minute, 10 MB inputs, SynthID watermark.

## The chart

| | Ours today | Doji | Google |
|---|---|---|---|
| Job | wholesale catalogue photos: one garment on a house model, 4 views | a consumer trying clothes on *themselves* | shoppers trying listings on themselves or on real models |
| The person | 27 real plates (studio photos, families studio/crop/low) | a per-user model trained on 8 photos (~30 min) | your full-body photo, a selfie → avatar, or a library of real models XXS–4XL |
| The garment | ERP photo + a 13-word caption inside 1,348 words | product photo or any URL | Shopping Graph product image; Doppl takes any photo |
| Generator | general image editor (`nano-banana-2`) steered by prose | proprietary try-on diffusion + identity model | TryOnDiffusion: Parallel-UNet, garment via cross-attention |
| What is generated | **the whole frame** — face, skin, backdrop re-rendered | the outfit on a twin that already *is* the person | **the garment only**; the photo stays the photo |
| Pose / body | described in words, plate as "reference" | learned from the user's photos | person image + pose, trained on two-pose pairs |
| Training data | none (zero-shot prompting) | undisclosed + per-user fine-tune | millions of person/garment pairs |
| Views / set | 4 separate calls, 304 words asking for "the same person" | one identity → every render matches; video | 1–4 samples per request; Doppl animates |
| Resolution | 3392×5056 synthetic → 2000×3000 | app resolution | same as the input photo |
| Time / cost | 69–340 s, ~$0.12, timeouts | seconds after the 30-min build | seconds; per-image Imagen pricing |
| Tells | smooth skin, redrawn face, head size, backdrop drift, hem fights | likeness not photo; identity solid | drape/fold/cling right; SynthID, C2PA |
| Human loop | tick keepers, Redo with a note | retrain twin, scroll outfits | pick size, choose a sample |

## Why theirs fool people — hypotheses, testable

1. **Preservation beats regeneration.** In their outputs everything outside the
   garment is a real photograph: the face, the skin's pores, the lens, the noise,
   the backdrop. Ours regenerates all of it, and a viewer's eye goes to the face
   first. *Test:* run a purpose-built try-on model on one of our plates and diff
   the face region against the plate — it should be identical.
2. **The garment enters as pixels, not prose.** A garment encoder with
   cross-attention carries print scale, placket, hem and cuff geometry directly.
   Our 13-word caption cannot; the two "firewalls" and eighteen mentions of "hem"
   in the prompt are the evidence of the fight. *Test:* print-heavy styles on both
   engines, judged against the ERP photo.
3. **Physics is learned from pairs.** Two-pose pairs of the same garment teach
   fold, cling and stretch; a general editor guesses from priors and averages the
   plate's old outfit in. *Test:* barrel pants and cropped cardigans — the exact
   cases the prompt teardown documents failing.
4. **Identity comes from data, not adjectives.** Doji trains a twin; Google keeps
   the photo. Our four views ask in words for the same person back. Our
   equivalent asset already exists — a plate family is one real model in several
   poses from one shoot — but only pays off if the person is preserved (1).
5. **Honest resolution.** Theirs output the photo's own resolution; ours asks
   for 4K and gets synthetic detail, then 23 MB PNGs and 300 s timeouts. A
   1296-tall try-on composited back onto the 3000-tall plate would be *more*
   real than a 5056-tall render.
6. **Sampling plus choice.** Four candidates and a pick beats one shot. We
   already have the vision judge (print_audit-style) to do the pick.

## What we can take, in order

**0. Backup (done).** Tag `model-maker-v1-nano-banana-2026-09-05` on the studio;
the nano path stays the default until David flips it.

**1. A try-on engine, same contract as theirs (today).** `engine: "tryon"` on
`/api/model-shots`: plate URL + garment URL → FASHN v1.6 on fal (the fal client
and key are already in the studio; 864×1296, 2:3 like our plates, `quality`
mode, `category` from the style code, `garment_photo_type` auto, seed from the
style code so a re-run reproduces, no prompt at all). The back view takes the
back photo when the caller sent one. Google's own model (Vertex AI
`virtual-try-on-001`) has the identical contract — person image + product image
— and drops into the same engine once a GCP project exists; it also answers (5)
outright by returning the plate's resolution.

**2. A bake-off, not a belief.** Same style, same plate, both engines, four
views; David judges. Candidates: a print (hypothesis 2), barrel pants and a
cropped cardigan (3), a plain top (1).

**3. Full-resolution composite (Google's cascade, done cheaply).** Take the
try-on result, mask the garment region (person parsing, or the difference
against the plate), upsample only that region and paste it onto the 2000×3000
plate. Everything outside the garment is then literally the photograph. Or skip
it by using Vertex, whose output is already at plate resolution.

**4. Samples and a judge.** `num_samples` 3–4, Claude-vision picks by fidelity
to the ERP photo (print coverage, hem length, neckline), the rest are offered as
alternates in the panel.

**5. Keep the editor for what try-on can't do.** Two-piece sets, accessories,
a styling change ("sleeves rolled"), side/back with no back photo, reposing.
FLUX Try-On Pro takes a styling prompt; nano-banana stays for the rest.

**6. Retire the prose for the new engine.** L1–L5 vanish; the garment vision
read survives only for category and the judge. The prompt teardown's seven
observations stop being a maintenance burden.

**7. Doji-shaped extras, later.** Faire listing videos from the front view
(image-to-video); a "twin" per plate model is just the plate family we have.

## The bake-off (2026-09-05, front view, one plate per style, three engines)

Six styles through `engine: "tryon"` (FASHN v1.6), the v1 editor on `nano-banana-2`
(4K) and the v1 editor on GPT Image 2 (`modelId: "gpt-image"`). Sheets were sent
to David; he judges. What the numbers and my own eyes say:

| Style | Plate | Try-on | Editor · nano | Editor · GPT Image 2 |
|---|---|---|---|---|
| DWJ62218 striped cardigan | crop 22 | 23 s · face 0.1% changed · white tee from the ERP photo kept under it, hem to the hip | 56 s · 2.8% · hem cropped above the belt | 90 s · 8.6% · 1200×1792 |
| DP62140AP plaid barrel pants | low 07 | 42 s · plaid right, **barrel silhouette lost** (reads straight) | 97 s · barrel right, but **re-dressed the top in matching plaid** | 93 s · barrel right, top kept |
| DWT68181 striped sweater (flat photo) | crop 09 | 22 s · 0.2% · stripes **wave and drift** across the chest | 104 s · 2.7% · stripes crisp, colour dull | 91 s · 1.9% · crisp, pink seam kept |
| DWT60401 deer sweater (on-model photo) | crop 17 | 25 s · 0.1% · intarsia and scalloped hem faithful | 95 s · 5.1% · faithful | 90 s · 2.1% · faithful |
| DT62181 ruffle blouse (flat) | crop 10 | 21 s · 0.4% · plausible but a different tier structure | 70 s · 2.6% · cape structure right | 93 s · 0.2% · right |
| DP62206 floral denim (flat) | low 02 | 40 s · florals placed, leg slimmer than the photo | 95 s · faithful | 96 s · faithful |

"face n% changed" = share of pixels in the top 22% of the frame that moved by more
than 24/255 against the plate (meaningless on the waist-down `low` plates, where that
band is the garment).

**Reading.** Hypothesis 1 holds: the try-on leaves the photograph alone (0.1–0.4%
on every crop plate) and is 2–4× faster. Hypotheses 2 and 3 do **not** hold for
FASHN on our garments: the whole-frame editors were *more* faithful to silhouette
(barrel, cape, hem) and to a flat-photo print (the stripes). The editor's own tell
showed up once: nano re-dressed the plate's top to match the pants (DP62140AP).
GPT Image 2 was the most faithful editor but redraws the face most on one case and
tops out at 1200×1792. Two engine fixes came out of the run: the plate's own outfit
must be segmented out (`segmentation_free` off — the first pass left the plate's
turtleneck collar under the cardigan), and the try-on's 864×1296 needs the
full-res composite (step 3) before it can ship at 2000×3000.

## What this is not

Not a rewrite. The route grows a second engine; the plates, the picker, the ERP
upload, the Redo note and the approvals all stay. If the bake-off says the
try-on engine is worse, delete `lib/tryon-engine.ts` and the branch, and nothing
else moved.

## Sources

- Google, "Google's generative AI is improving virtual fitting rooms" (2023) — two U-Nets, cross-attention, millions of two-pose pairs, "every pixel of the garment from scratch".
- TryOnDiffusion: A Tale of Two UNets, arXiv 2306.08276 (CVPR 2023).
- Google, "studio-quality digital try-on" and I/O 2025 shopping updates — selfie path on Nano Banana, real-model library, Doppl.
- Google Cloud docs: Generate virtual try-on images; model `virtual-try-on-001` (4 images/request, input resolution kept, 50 rpm, 10 MB).
- TechCrunch, "Doji raises $14M to make virtual try-ons fun through AI avatars" (May 2025); fashion-press coverage of the six-selfie / two-body-photo twin (~30 min) and retraining.
- fal.ai, "10 best virtual try-on APIs in 2026" — FASHN v1.6 (864×1296, $0.075), Kling Kolors v1.5 ($0.07), FLUX Try-On Pro, image-apps-v2, Leffa; FASHN v1.6 API schema.
- This repo: `docs/MODEL_SHOT_PROMPT_SYSTEM.md` (the 1,348-word stack, timings), `docs/MODEL_PLATE_STANDARD.md`.
