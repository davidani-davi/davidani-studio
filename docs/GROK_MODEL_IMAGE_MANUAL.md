# Model-image bot: operating manual

**For any bot (Grok, or anything else with a vision read and an image-edit call) that has to
turn one garment photograph into a Davi & Dani model shot.**

This is the GPT Image 2 generator written out as instructions instead of code. Everything here
is what `POST /api/model-shots` on davidani-studio actually does as of 2026-09-05 — the same
plates, the same vision prompts, the same gates. Follow it and the output is our catalogue.
Skip a step and you get the failure that step exists to prevent; each one is named at the end.

---

## 0. The one rule everything else serves

**The plate is the canvas. The garment photo is a reference. The model is never generated.**

A plate is a real studio photograph of a real woman on our real backdrop. The bot's job is to
*replace the clothing in that photograph* and change nothing else — not her face, not her hands,
not the backdrop, not the crop. It is a retouch, not an illustration.

This is why no prompt can rescue a bad plate: the plate decides head size, backdrop colour,
lighting and proportions before a word of prompt is read. And it is why you must never generate
the person from text. Text-to-image gives you four sisters instead of one woman.

Corollary: the call must be an **image edit with the plate as the base image**. A text-to-image
call cannot do this job no matter how good the prompt. If your image tool has no edit endpoint
that accepts a base canvas plus reference images, stop and use Mode B in §8.

---

## 1. Inputs

| Input | Required | Where it comes from | If missing |
|---|---|---|---|
| Garment photo(s) | **yes** | ERP gallery, flat-lay or on-model | cannot run |
| Style code | for auto plate | e.g. `DWJ62218` | caller must name a plate by hand |
| Garment type | strongly | Faire taxonomy name, e.g. `Cardigan - Women's` | falls back to vision, which guesses |
| Listing title | strongly | the approved title | closure is guessed |
| Fabric | helpful | ERP fibre content | texture is guessed |
| Colourway | helpful | ERP colour name | render is uncheckable against the order |
| View | yes | one of `front` `side` `back` `full` | defaults to `front` |
| Operator note | no | a Redo's fix instruction | — |

Two garment photos means **the front and back of ONE garment**, never two garments. Say so in
the prompt or the model will render a two-piece.

**One call per view.** Never ask for four views in one image. A four-view call returns a collage,
and a timeout loses the whole set instead of one frame.

---

## 2. Classify the garment → which views, which framing

The category decides how many views are shot and, more importantly, **which crop of the plate
each view is shot against**. A pant shot on a full-length plate wastes two thirds of the frame
on a face nobody is buying.

Match the type name in order — first rule that hits wins:

| Pattern in the type/title | Category |
|---|---|
| `set` | set |
| `jumpsuit` `romper` `overall` `dress` `gown` | dress |
| `skirt` `skort` | skirt |
| `pants` `shorts` `jeans` `leggings` `trousers` `joggers` `culottes` | pants |
| `jacket` `coat` `shacket` `kimono` `outerwear` `bomber` `puffer` `blazer` `cape` `poncho` | outerwear |
| `top` `shirt` `blouse` `sweater` `cardigan` `tee` `hoodie` `sweatshirt` `tunic` `vest` `tank` `cami` | top |
| nothing matched | unknown |

Order matters: a "Top & Pant Set" is a **set** before it is a top; a "Shirt Jacket" is
**outerwear** before it is a shirt; an "Outerwear Vest" is outerwear before a vest is a top.

Then the shot plan:

| Category | Views, in order | Plate framing |
|---|---|---|
| pants, skirt | front, side, full | `low` for front/side, `full` for full |
| top, outerwear (hem not long) | front, side, back, full | `crop` for front/side/back, `full` for full |
| top, outerwear with a **long** hem | front, side, back, full | `full` throughout — the hem is in every frame |
| dress, set, unknown | front, side, back, full | `full` throughout |

**Hem is the second dimension** (`hemFor`, 2026-09-05). Before choosing the framing, read the
type and title for a hem word: any kind of coat (`coat`, `peacoat`, `overcoat`, `topcoat`,
`trench`, `duster`), `longline`, `maxi`, `midi`, `mid-calf`, `knee-length`, `below the knee`,
`ankle-length`, `floor-length`, `full-length` → hem **long**; `cropped` / `crop` → hem **short**
and wins; an explicit `known.hem` wins over both. "Long sleeve" is not a hem word. A long top or
outerwear piece takes the full-length plate in every view: the head-to-thigh crop plate has no
room for the hem, and the engine either shortens the garment to fit the frame (a mid-calf coat
came back a shacket on the side) or stretches the figure to keep the hem in frame (a tent on the
front). Under a long layer the plate's own trousers and shoes would show, so the swap widens to
the full look and the brief dresses the model below the hem in plain black straight-leg trousers
and plain black ankle boots — the same in every view of the set (§7).

`crop NN` and `low NN` are **the same photograph re-framed**, not different plates. If the
re-framed family is not installed, use the full-length plate — the shot survives, it is just
less tight.

---

## 3. Read the garment (vision pass A)

Send the garment photo to a vision model with this system prompt **verbatim**. Every clause in
it is a bug that was shipped once.

```
You are a product catalog analyzer. You see a single garment photograph and must output exactly two lines, in this exact format, with no preamble, no markdown, and no extra lines:

GARMENT: <a short noun phrase describing the garment — include primary color, fabric/texture, an explicit silhouette / cut / fit descriptor, body-length descriptor for tops/jackets/cardigans, and garment type. For pants and jeans, choose the most accurate mainstream leg-shape word: barrel-fit, wide-leg, straight-leg, flare, bootcut, skinny, slim, relaxed, baggy, tapered, cargo, jogger, trouser, palazzo, cropped, or bermuda. Example: "hip-length boxy cream fleece bomber jacket", "barrel-fit dark indigo denim jeans", "wide-leg cream linen trousers".>
FEATURES: <comma-separated noun phrases enumerating clearly visible structural details. ALWAYS begin with a silhouette clause that restates the garment's cut/fit/leg-shape/body length in concrete visual terms. For jackets, tops, cardigans, sweaters, and shirts, explicitly state where the body hem appears to land: cropped above waist, at waistband, below waistband, high hip, hip length, below hip, tunic length, etc.>

RULES:
- NEVER invent text, letters, numbers, logos, brand names, or made-up words.
- NEVER describe individual motifs inside a print/pattern. Name the pattern TYPE only (e.g. "scattered oval patch design", "all-over floral print", "plaid"). However, you MUST describe the COVERAGE and PLACEMENT of every graphic or pattern — state exactly which areas it covers: e.g. "all-over scattered patches covering the full chest, torso, and both sleeves", "graphic on left chest panel only", "patch on right sleeve only". Coverage and placement are required even when motif detail is omitted.
- ALL-OVER PATCH COUNT RULE: If the garment features multiple individual patches, appliqués, or motifs of visually similar size scattered across the body, you MUST describe them as a group using plural language and state their approximate count. NEVER describe an all-over multi-patch design using singular language like "a patch on the chest" — that falsely implies one dominant patch and will cause the generator to produce a single oversized chest graphic. Instead write: "approximately [N] similarly-sized oval patches scattered all over the chest, torso, and both sleeves with no single patch larger than the others."
- Use only real, common English words.
- Describe only the garment itself. Ignore background, hanger, or mannequin.
- PANTS SHAPE AUDIT: If the garment has two leg openings, a waistband, and no neckline, it is a bottom. Never call pants a top. Rounded outward curve + tapered ankle = barrel; consistent width = wide-leg or straight-leg; widening below knee = flare or bootcut; close fit through ankle = skinny or slim; roomy thigh narrowing to ankle = tapered or jogger.
- If the garment is barrel pants, both GARMENT and FEATURES must explicitly say barrel/barrel-shaped. Do not soften barrel pants into straight-leg, relaxed, or wide-leg.
- HEM GEOMETRY AUDIT: For tops, jackets, cardigans, sweaters, shirts, blouses, hoodies, pullovers, and outerwear, examine whether the front hem and back hem land at the same height. If the back panel is visibly longer than the front, say so explicitly in both GARMENT and FEATURES: "high-low hem", "shirttail hem", "stepped hem", "extended back hem", or "asymmetric hem with longer back panel". Treat the longer back panel as part of the SAME garment.
- LAYERING DISAMBIGUATION: Do not describe any visible inner-fabric portion as an "undershirt", "cami", "inner top", "second layer", "underlayer", "layered piece", "two-piece", or any phrase that implies more than one garment, UNLESS the photograph clearly shows two physically separate garments hanging together. A longer back hem peeking below a shorter front hem on the same hanger is ONE garment with an asymmetric hem — never two garments. A contrasting band visible at a hem is part of the garment's own construction, not a second garment.
- ONE GARMENT DEFAULT: If only one garment is hanging in the photograph, both GARMENT and FEATURES must describe ONE garment.
- FRONT PANEL ONLY RULE: If this photograph shows BOTH the front AND back of the garment side by side, you MUST describe ONLY the front panel. Back-panel graphics, back embroidery, center-back prints and back-only text must NEVER appear in GARMENT or FEATURES. To identify the front panel: look for a button placket, chest pocket, front zip, front yoke, front-facing collar/lapel, or a chest label.
- Output exactly two lines: GARMENT: and FEATURES:, nothing else.
```

Cache the result per photo URL. The same photo never needs reading twice.

---

## 4. Overrule the vision read with what we already know

**This is the highest-value step in the manual and the easiest to skip.**

The garment phrase is roughly 13 words out of a 1,348-word prompt, and the entire product
identity of the shot rides on them. On DWJ62218 vision read the open placket of a cardigan as a
"keyhole cutout detail" — and the render came back a closed pullover with a keyhole in it.
Nothing downstream could recover: the other 1,335 words are about hems and layering.

The answer was in our own systems the whole time. Apply this precedence, high to low:

1. **Garment type — from the style code.** `WJ` is a cardigan. If the vision phrase names a
   different garment noun, replace the noun. Do not argue with it, overwrite it. If vision named
   no type at all, append ours.
2. **Closure — from the listing title and description we wrote.** Search the copy in this order:
   `button-front` / `button-up` → `zip-front` / `full-zip` → `snap-front` → `tie-front` / `wrap`
   → `open-front` → `pullover`. If the copy names none *and* the type is one that opens down the
   front by nature — cardigan, jacket, blazer, coat, kimono, shacket, vest — the closure is
   `open-front`.
3. **Fabric — from the ERP fibre content.** Append `fabric: 45% Polyester 55% Acrylic`. This is
   what makes a knit read as a knit.
4. **Colourway — from the ERP colour name.** Append
   `colourway: navy and blue, matching the uploaded reference exactly`, so the render is
   checkable against the colour the buyer will actually order rather than "blue-ish".
5. **Length — from the title and type** (2026-09-05). `longline` / `duster` → "longline, the hem
   falls at mid-calf, well below the knee"; `maxi` / `floor-length` / `full-length` →
   floor-length; `midi` / `mid-calf` → midi-length; `knee-length` / `below the knee` →
   knee-length; `ankle-length`; `cropped` → "the hem sits at the natural waist"; a hem read as
   long with no word in the copy → knee-length. Strike vision's own length words ("tunic-length",
   "mid-length", "hip-length") from the phrase and put ours in front of the type noun:
   `longline plaid coat`. On DJ67094 vision read a mid-calf coat as "tunic-length" and the crop
   plate turned it into a shacket.
6. **Fit — from the copy.** `oversized` / `relaxed` / `boxy` from title or description;
   `slim` / `fitted` / `tailored` from the title only (descriptions say "fitted" of anything).
   Append `fit: an oversized, relaxed fit` to the features.

When the garment opens, do three things, not one:

- Put the closure directly in front of the garment noun: `button-front cardigan`.
- **Strike the misread** — delete any `keyhole` / `cutout` from both the phrase and the features.
  An open placket misread as a neckline cutout will otherwise be rendered as an actual hole.
- Append this clause verbatim:
  `front closure: a button-front placket at center front — this garment OPENS down the full
  center front and is worn open or fastened, never rendered as a closed pullover with a
  continuous front panel`

For a pullover, assert the opposite so nothing invents a placket:
`front closure: a closed pullover front with no opening placket`

**Log every override.** A silent correction is indistinguishable from a bug on the day the known
facts are wrong. Emit a `corrections` list — `type: "vest" → "cardigan" (style code)` — and show
it to the operator.

---

## 5. Pick the plate

**Deterministic from the style code.** Hash the code (FNV-1a) and index into the installed
plate list. The same style must always come back on the same woman — a retry, a fifth view, or a
reshoot next week all have to match what was already published. Never pick at random and never
renumber the plates: numbering is keyed to the source style, and renumbering silently re-shoots
the whole catalogue on different models.

Then swap in the framing family from §2 (`crop NN` / `low NN`), falling back to the full-length
plate when that family is not installed.

A plate qualifies only if it measures:

| Property | Standard |
|---|---|
| backdrop | within 30 per channel of **rgb(249, 237, 226)**, corner spread ≤ 34 |
| aspect | **2:3** ± 0.06 |
| width | ≥ 1200 px |
| head height | **5–14%** of frame height; house target **9–11%** |
| people | exactly one, hands and feet not cut off |
| outfit | simple enough to be swapped — not a floor-length coat |
| view | `front`/`full` face camera with face visible; `side` is a true profile; `back` is a true rear view |

The head number is the whole reason the plates were rebuilt. Our old plates ran 19–23% — head
to thigh — and every render copied it. That is what "the head is too big" meant.

---

## 6. Read the plate (vision pass B)

The prompt has to name what it is preserving, or the model feels free to change it. Read the
plate with this system prompt, verbatim, and cache per plate URL:

```
You are a fashion photography analyst. You see a single photograph of a human model in a studio. Output exactly four lines in this exact format, with no preamble, no markdown, and no extra lines:

CURRENT_GARMENT: <short noun phrase describing the clothing the model is currently wearing that must be REPLACED. Include primary color and garment type.>
MODEL_IDENTITY: <short noun phrase capturing the model's appearance that must be preserved exactly: hair (color, length, style), skin tone, facial features, body proportions, and FACE LIGHTING / EXPOSURE character when clearly visible.>
POSE: <short noun phrase describing the model's stance, arm position, leg position, and camera angle.>
SCENE: <short noun phrase describing the background, lighting, exact background COLOR / BRIGHTNESS / TONAL VALUE, and all non-swapped wardrobe items (shoes, accessories, other clothing).>

RULES:
- Describe only what you can see with certainty. Do NOT invent details.
- Do NOT invent text, logos, brand names, or numbers.
- Use only real, common English words.
- Keep each line concise — one noun phrase, no sentences, no commentary.
- Preserve literal photographic conditions rather than vague style words: whether the face is bright, evenly exposed, softly shadowed, or low-contrast, and whether the backdrop is bright white, light gray, warm cream, or another specific tone.
- Output exactly the four lines above, nothing else.

ANTI-HALLUCINATION RULES — violating any of these produces bad outputs:
- NEVER guess a hardware material. If a button, zipper pull, rivet, or buckle's material cannot be identified with certainty, describe ONLY its color and shape. Do NOT write "pearl", "pearl-like", "horn", "bone", "faux-bone", "wooden", "metallic", "brass-looking", "leather-like", or "tortoiseshell".
- NEVER use the word "trim" or "trimmed" unless it is clearly a DIFFERENT color from the garment body. A ruffle in the same color as the body is self-fabric. The word "trim" implies contrast to the image model.
- NEVER use hedge qualifiers such as "-like", "-looking", "-style", "-ish", "sort of", "kind of", or "appears to be". If you cannot identify a detail with certainty, OMIT it entirely.

DESCRIPTOR DISCIPLINE — from controlled prompt tests, not optional:
- Use only words that name a visible, renderable physical property.
- NEVER use abstract or quantifier words such as: "easy", "medium", "moderate", "nice", "great", "beautiful", "basic", "standard", "regular", "normal".
- NEVER repeat the same descriptor word across your four output lines. Each descriptor token must appear at most ONCE across all four lines.
- Pick material-consistent adjectives. Do NOT describe a knit as "crisp", a denim as "drapey", a silk as "stiff".
```

---

## 7. Build the prompt

Two prompts are in service. **The long one is the benchmark; the short one is the challenger.**
Use the long one unless you are deliberately testing.

### 7a. The lean brief (~150 words) — start here if you are writing this fresh

Everything the long stack says eighteen times about hems, said once. Fill the slots:

```
Photo 1 is a real studio photograph of our model. Photo 2 is the garment to put on her.
Replace only {REGION} with the garment in photo 2, exactly as it is: {GARMENT}.
Details to carry over: {FEATURES}.
Fit and drape it the way it hangs in the garment photo: the same length, sleeve length,
closure, neckline, print scale and colour. Do not shorten, crop, tuck or restyle it to match
what she wore before.
Keep every other pixel of photo 1 as it is: her face, hair, skin, hands, jewellery, pose, the
clothing that is not being replaced, the cream backdrop, the lighting, the camera and the crop.
{VIEW_LINE}
{OPERATOR_NOTE}
Output one photograph, nothing else: no text, no collage, no alternate views.
```

`{REGION}` by category — this is the only part of the plate the model may touch:

| Category | REGION |
|---|---|
| top, outerwear (hem not long) | `what she wears on her upper body` |
| top, outerwear with a long hem | `her whole outfit` — then say what goes below the hem: `plain black straight-leg trousers and plain black ankle boots, the same in every view` |
| pants, skirt, shorts | `what she wears on her lower body` |
| dress, romper, jumpsuit | `her whole outfit` |
| anything else | `the garment she wears` |

`{VIEW_LINE}`:

- front — `This is the front view.`
- side — `This is the side view: the garment as it reads from the side of the pose in photo 1.`
- back — `This is the back view: the garment's back, as photo 1 already shows the model from behind.`
- full — `This is the full-length view.`

With a back photo, replace the first line with:
`Photo 1 is a real studio photograph of our model. Photo 2 is the front of the garment to put on
her and photo 3 is its back.`

`{OPERATOR_NOTE}`, on a Redo only: `Operator correction for this view: {note}.`

Known lean-brief gap: it can carry the plate's own layer through (a white tee under an open
cardigan) and it has missed a neckline. If you use it, name the neckline and the hem explicitly
in `{FEATURES}`.

### 7b. The full stack (~1,350 words) — the benchmark

Five layers, concatenated in this order. L1, L2, L3 and L5 are byte-identical across all four
views; only L4 changes. That is the honest summary of this prompt: **94% of every call is the
same text, and the view is named last.**

**GPT Image 2 sees only the base prompt.** The GPT optimizer (`optimizeForGptImage` →
`stripNegativePrompt`) cuts everything from `Negative prompt:` to the END of the string, and the
multi-view suffix — framing rule, scale rule, styling rule, consistency contract — is appended
after that marker. So the GPT editor has never received any of it. Anything that must reach GPT
goes into the base prompt: the garment contract (§4) or `applyStyling`, which rewrites the
analyzer's keep-list (strikes the plate's trousers/shoes) and appends `STYLING: …` before the
negative block. Restoring the suffix for GPT is a prompt change that has not been evaluated.

**L1 — canvas + garment firewall**

```
Edit the first image. Treat the first image as the base canvas that must be preserved for composition, subject, pose, camera angle, lighting, and background. Use every additional image only as a visual reference for the garment or product details. Garment source firewall: the first image may control model identity, body, pose, camera, framing, lighting, and background only. Do not borrow any garment category, silhouette, crop point, body length, sleeve length, hem position, neckline, waistband exposure, fabric, color, trim, print, or styling from the first image's existing clothing. Every garment feature must come from the uploaded garment reference image or explicit text instructions. If the first image shows a cropped top, cropped jacket, short hem, exposed waistband, tucked styling, or different garment length, ignore those old garment features completely unless the uploaded garment itself has the same feature. Do not use an additional reference image as the final layout. Do not output a standalone product photo, flat lay, hanger image, mannequin image, torso display form, or isolated garment unless the prompt explicitly asks for a product-only image.
```

**L2 — the swap.** Slots: `{IDENTITY}` `{POSE}` `{SCENE}` from vision B; `{GARMENT}` `{FEATURES}`
from §3 as corrected by §4; `{CURRENT}` is the plate's existing clothing.

```
Use Image A as the base image and keep the model's body, face, identity ({IDENTITY}), pose ({POSE}), hair, expression, lighting, shadows, camera angle, depth of field, and background ({SCENE}) completely unchanged; take the {GARMENT} from Image B and apply it onto the model — replace only the {REGION} garment area with the new {GARMENT}; preserve any visible skirt, pants, shorts, or other {OTHER_REGION} garment from Image A exactly as-is — same color, shape, hem, waistband, drape, and coverage; do not remove, crop out, fade out, or simplify it. remove only the portion of {CURRENT} that conflicts with the new {GARMENT}, and carefully match lighting direction, fabric drape, body contour, perspective, and shadow behavior so everything blends naturally; STRUCTURE PRIORITY: render the garment with the EXACT silhouette and construction visible in Image B — body length, hem geometry (preserve any high-low, shirttail, stepped, or asymmetric hem with the back panel longer than the front exactly as shown), sleeve length and volume, cuff shape, neckline depth and shape, collar height, waistband, drape, and overall body fit; preserve the garment's exact construction from Image B, including: {FEATURES}; treat any visible difference between front-hem height and back-hem height in Image B as the SAME garment's intentional high-low / shirttail / stepped hem geometry, not as a separate cami, undershirt, inner top, or layered piece — render the asymmetric hem on the model exactly as one continuous garment with a longer back panel, never split into two pieces; render the garment as a worn garment on this specific model and pose with natural drape, fit, volume, and contour responding to the body and scene, not a static copy of the flat-lay shape from Image B; Product length authority: the uploaded garment reference controls the true body length, hem placement, sleeve length, and coverage of the new garment. Do not inherit, match, or average the current shirt, tank, sweater, or jacket length from the model pose photograph. If the model pose is wearing a cropped or at-waist top, ignore that old hem completely. If the uploaded garment extends below the waistband, to the high hip, to the hip, or lower, render the new garment at that same longer coverage on the model. Do not crop jackets or tops for no reason, and do not expose the waistband unless the uploaded product is actually cropped. The selected model-pose image is not a garment reference. Match the garment's fit and length on-body as closely as possible to the uploaded product reference, without drifting smaller, larger, shorter, or longer. remove all neck labels, brand tags, size tags, care labels, and sewn-in woven tags from the rendered garment; Image A is the lighting and exposure authority — match its background brightness, backdrop tonal value, facial exposure, facial brightness, and face lighting pattern exactly; do not darken, mute, gray, warm, or cool the scene relative to Image A; output a photorealistic 4K editorial fashion catalog image in 2:3 aspect ratio with anatomically correct proportions, clean garment edges, and high-detail textures. Negative prompt: no face alteration, no body reshape, no pose drift, no garment-shape drift, no flattened high-low hem, no straightened shirttail hem, no separate inner garment, no layered cami, no contrasting underlayer, no straightening of barrel or flared pants, no widening of skinny pants, no cropped jacket unless the uploaded jacket is cropped, no matching the old top length.
```

**L3 — four-view identity contract**

```
Combined garment identity contract for this four-view set: {GARMENT}. The same physical SKU must keep the combined front/back feature map in every angle: Front-facing source of truth: {FEATURES}. The front and back uploads are paired evidence for the same garment and must be reconciled into one complete product map before generating any angle. All four outputs must look like one real garment photographed from front, side, back, and full-body angles, not four related garments, not four colorways, and not four reinterpretations. Keep the same garment length, volume, fit, fabric texture, color, construction logic, pocket size and placement, closure type, cuff/hem behavior, graphics, and trim placement across the set. ALL-OVER PATTERN RULE: if the garment reference shows a scattered, all-over, or repeat graphic/patch/print that covers the full body surface (chest, torso, sleeves), reproduce that pattern across ALL those areas in every view — do not simplify to sleeve-only or partial placement. The pattern density and surface coverage must match the reference exactly. Only reveal angle-specific information that would naturally be visible from that view.
```

**L4 — this view.** The only layer that changes:

```
Multi Model Studio directive: generate the {VIEW} view only. This run is part of one four-view ecommerce photoshoot set: front, side, back, and full. Keep the exact same model identity, face, body proportions, lighting, warm beige studio background, camera quality, garment color, construction, trims, texture, and styling continuity across the set. Do not generate variants, do not create a collage, and do not change the selected view into another angle.
```

**L5 — the firewall again**

```
Final garment-source firewall: the model pose/canvas image is only the body, pose, camera, framing, lighting, and background reference. The uploaded garment image or images are the only source of truth for the replacement garment. Do not copy, average, or be influenced by the canvas image's existing clothing length, cropped hem, tucked styling, waistband exposure, sleeve length, neckline, silhouette, fabric, color, trims, or outfit proportions. If the canvas model is wearing a cropped garment but the uploaded garment is longer, render the uploaded garment longer exactly as indicated by the product reference.
```

Yes, L1 and L5 say the same thing 7,600 characters apart. That is deliberate: the firewall is the
rule the model breaks most, and it is stated at both ends of the prompt.

---

## 8. Generate

### Mode A — call our studio (preferred)

```
POST https://davidani-studio.vercel.app/api/model-shots
X-DDTO-TOKEN: <MODEL_SHOTS_TOKEN, or APP_PASSWORD when that is not set>
Content-Type: application/json

{
  "garmentImageUrls": ["https://…front.jpg", "https://…back.jpg"],
  "view": "front",
  "humanModelId": "auto",
  "known": { "styleCode": "DWJ62218", "type": "Cardigan - Women's",
             "title": "Two-Tone Striped Button-Front Cardigan",
             "fabric": "45% Polyester 55% Acrylic", "color": "NAVY/BLUE" }
}
```

Everything in §2–§7 happens inside. Defaults since 2026-09-05: `modelId: "gpt-image"`,
`gptVariant: "native4k"`. One call per view; fire the views in parallel. `humanModelId: "auto"`
needs a `styleCode` to assign from. Reachable by name if you need them: `modelId: "nano-banana"`
(the pre-change editor), `gptVariant: "auto"` (the 1200×1792 benchmark), `gptVariant: "lean"`
(§7a), `engine: "tryon"` (FASHN — keeps the photograph, loses silhouette).

The response carries `url`, the `prompt` actually sent, `humanModelId` / `poseId` / `assigned`,
`category`, `framing`, and `corrections` from §4. Read `corrections` — it is how a wrong known
fact becomes visible instead of silent.

### Mode B — drive an image model directly

Requirements, all of them:

- an **edit** call with the plate as the base image and the garment photo(s) as further
  references — image order is **plate first**, garment second, back third
- output **2048 × 3072** (2:3, both edges multiples of 16, 6.3 MP — under GPT Image 2's 8.3 MP
  cap, and above the 2000 × 3000 deliverable so nothing is upsampled on the way out)
- one image, PNG
- no automatic "portrait enhancement" pass — anything that rewrites faces neutralises the
  plate's model and breaks set consistency

Asking for the native size is free — same quality, deliverable size, about ten seconds more —
and it is the difference on a `low`-framed plate, where the auto size broke the framing and the
native size held it.

Do **not** try to constrain the edit with an API mask. We tested it: a mask built from the
try-on engine's footprint is read as guidance, not as a boundary — it rewrote a low plate into a
full figure and redrew hair and shoes. The only useful mask is a paste-back composite done after
the fact, outside the model.

---

## 9. Judge the result before anyone sees it

Measure first — arithmetic is free and catches most of it. The four corners of a studio frame
are always seamless paper, so "is this our backdrop, evenly lit" needs no model call.

- backdrop within 30 per channel of rgb(249, 237, 226), corner spread ≤ 34
- 2:3 ± 0.06, ≥ 1200 px wide
- head 5–14% of frame height

Then ask a vision model, one binary question each: exactly one person · head percentage ·
full-body or cropped · which way is she facing · is the face visible · are limbs cut off · is
the outfit replaceable · **is text or a badge burned into the photo**.

On a fail, **retry once with the fault named in the prompt** — append
`Correct these faults from the previous attempt: {reasons}.` — and then stop. Three good views
beat four with a warped one, because every future render inherits whatever you keep.

**Read the last check with judgement.** `overlay_text` exists because Faire burns a PLUS+ ribbon
into plus-size heroes. It cannot tell a burned-in badge from a garment whose *print is literally
words*, or from a watermark inherited from the source photograph. Studio 24 failed three
generations on it while passing every other measure; the render was clean and the garment simply
said LES CITRONS all over itself. When this check fires and everything else passes, look at the
image before you throw it away.

---

## 10. Deliver

Downscale to **2000 × 3000 JPEG, quality 92**. That is the house delivery size and the ERP
gallery's expectation.

**Nothing reaches the ERP without approval.** The operator sees the render and accepts it; only
accepted shots are uploaded. This is a standing rule, not a preference.

---

## 11. The failure catalogue

Each of these shipped once. The fix is the step that now prevents it.

| What you see | Why | Fix |
|---|---|---|
| Open cardigan rendered as a closed pullover, with a hole at the neck | vision read the placket as a "keyhole cutout" | §4 — the style code and the title override vision, and the misread is struck |
| Garment comes back cropped when the product is hip-length | the model copied the plate's existing top hem | §7 L1/L5 firewall + "Product length authority" |
| One garment rendered as a top plus a cami | a longer back hem read as a second garment | §3 layering rules + L2's high-low clause |
| One oversized chest graphic instead of scattered patches | singular language in the vision read | §3 all-over patch count rule |
| Barrel pants rendered straight-leg | "barrel" softened in the read | §3 pants shape audit |
| Low-framed pant shot reframed into a full figure | auto output size | §8 — ask for 2048 × 3072 |
| Face changed / hair redrawn | a portrait-enhancement pass, or a mask read as guidance | §8 — no raw portrait rewrite, no API mask |
| Four views that look like four sisters | the person was generated instead of preserved | §0 — the plate is a real photograph |
| Every style on the same woman in the same stance | random or fixed plate choice | §5 — deterministic hash, spread across the set |
| A style comes back on a different model after a retry | plates renumbered | §5 — numbering is keyed to the source style, never renumber |
| A clean render rejected for "text burned in" | the garment's print is words, or a source watermark | §9 — look at it |
| Collage, or two views in one frame | more than one view asked for in a call | §1 — one call per view |

---

## 12. The bot's own instructions

Paste this as the bot's system prompt; it is the manual compressed to what it must never get
wrong.

```
You produce Davi & Dani model shots from garment photographs.

The plate is a real studio photograph of a real model. You are retouching that photograph:
replace the clothing and change nothing else — not her face, hair, hands, jewellery, pose, the
cream backdrop, the lighting, or the crop. Never generate the person. Never accept a
text-to-image call for this job; it must be an edit with the plate as the base image, plate
first, garment photos after.

Before you build a prompt:
1. Name the category from the garment type, and take the view list and plate framing from it.
2. Read the garment photo with the catalog-analyzer prompt.
3. Overrule that read with what we know: the style code decides the garment type, our listing
   title decides the closure, the ERP decides fabric and colourway. When the garment opens down
   the front, say so and strike any "keyhole" or "cutout" from the read. Report every override.
4. Assign the plate deterministically from the style code. Never at random.
5. Read the plate so the prompt can name what it is preserving.

One call per view. Ask for 2048x3072. Judge the result on backdrop, aspect, head size and one
person before showing it; retry once with the fault named, then stop. Downscale to 2000x3000
JPEG q92. Nothing reaches the ERP until the operator approves it.

Two garment photos are the front and back of ONE garment. Never render two garments.
When a check fires but the image looks right, say so and show it rather than discarding it.
```

---

*Sources in the code: `app/api/model-shots/route.ts`, `lib/gpt-variants.ts`,
`lib/garment-contract.ts`, `lib/plate-framing.ts`, `lib/plate-assign.ts`,
`lib/multi-model-prompt.ts`, `lib/prompt-strategy.ts`, `lib/fal.ts`; the plate standard in
`thumbnail-optimizer/plate_harvest.py`, `plate_derive.py`, `plate_install.py`. Companion docs:
`MODEL_PLATE_STANDARD.md`, `MODEL_SHOT_PROMPT_SYSTEM.md`, `MODEL_MAKER_VS_DOJI_GOOGLE.md`.*
