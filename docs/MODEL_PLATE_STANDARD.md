# The model plate standard

A model shot inherits its framing, backdrop, lighting and body proportions from
the **plate** it is generated against — the plate is the canvas, the garment is
the reference. No prompt fixes a bad plate; the canvas decides.

Everything below was measured off twelve of our own studio photographs on
2026-09-04, not chosen.

| | house photography | old plates (kylie / celine / sydney) |
|---|---|---|
| head height, share of frame | **9–11%** (full-body) | **19–23%** |
| framing | full body, margin above head and below shoes | head-to-thigh crop |
| backdrop | warm cream **rgb(249, 237, 226)**, corners agree within ~20 | warm cream, but tighter and darker at that crop |
| aspect | 2:3 | 2:3 |
| delivery | 2000 × 3000 | 1024–2000 wide, mixed |

That head-size gap is "the head is big": at a head-to-thigh crop the head takes
twice the share of the frame it takes in our own catalogue, and every render
copies it.

## What qualifies as a plate

Enforced in `thumbnail-optimizer/plate_harvest.py` (`plate_verdict`, unit
tested). Half is arithmetic on the pixels — the four corners of a studio frame
are always seamless paper, so "is this our backdrop, lit evenly" needs no model
call. The other half is what only vision can answer.

- backdrop within 30 per channel of rgb(249,237,226), corner spread ≤ 34
- 2:3 ± 0.06, at least 1200px wide
- head 5–14% of frame height (9–11 scores best)
- exactly one model, framed without cutting off hands or feet
- an outfit simple enough to be swapped — not a floor-length coat
- per view: `front`/`full` face the camera with the face visible; `side` is a
  profile; `back` is a true rear view. A side plate rejected for "not
  front-facing" was a bug, not a standard.

## Where plates come from

**The front is a real photograph.** Harvested from our own ERP galleries, where
our studio files are style-coded and full resolution (the vendor's are UUIDs at
1024px). A real frame of a real model in the real studio is the only version of
"looks like our studio" that is not an opinion.

**The other three views are generated from that front** by
`plate_derive.py` — same woman, same outfit, same room, camera moved. Generating
a person from text was the alternative, and it gives you four sisters instead of
one woman. Each derived view is measured against this same standard before it is
kept, and retried once with the fault named.

Installed by `plate_install.py` into `public/models/studio NN/`, normalised to
2000×3000 JPEG, with `public/models/plates.json` recording which style each
plate came from.

## Which plate a style gets

`lib/plate-assign.ts`. Deterministic from the style code, so a style always
returns on the same model — a retry, a fifth view, or a reshoot next week all
match what was published — and spread across the set, so the catalogue stops
being one woman in one stance under every garment. A Plus twin is assigned its
regular twin's plate: same garment, same body.

Callers ask for `humanModelId: "auto"` (the default when none is named) and get
back which plate was chosen in `assigned`.

## Framings (2026-09-05)

A house plate is full-length; Faire's listing photos are not. A top or a jacket
is shot head to mid-thigh with the garment filling the frame, pants and skirts
from the waist down with no head in frame, and only dresses, sets and the one
"full shot" show the whole figure. Three families share each photograph:

| family      | frame                                  | used for                                                        |
|-------------|----------------------------------------|-----------------------------------------------------------------|
| `studio NN` | head to shoes, head 9–11 % of frame    | dresses, jumpsuits, rompers, sets, and the "full" view of all    |
| `crop NN`   | head to mid-thigh, head ~20 % of frame | front, side and back of tops and outerwear                      |
| `low NN`    | natural waist to shoes, no head        | front and side of pants and skirts (bottoms shoot no back view) |

`crop` and `low` are pixel crops of `studio NN`, never a second generation
(faire-management `thumbnail-optimizer/plate_crop.py`): 2:3 at 1200×1800,
geometry relative to the figure height H = head top → shoe bottom, crop =
−0.03 H … 0.58 H, low = 0.40 H … 1.03 H. Only `studio NN` shows in a picker;
`/api/model-shots` swaps in the sibling for the framing the garment category
needs (`lib/plate-framing.ts`), and the extension plans the same views
(`model_shots_core.js categoryFor`). The category comes from the Faire taxonomy
name the style code maps to, so a "Top & Pant Set" is a set, not pants.

Pipeline: harvest → install → `plate_crop.py` → `npm run models:manifest`.
The kylie / celine / sydney / pants plates retired to `public/models/hide/`
the same day: the right framing for a top, the wrong models.

## What the model wears (2026-09-05)

A bottom is shot on `low NN`, and the generator repaints the model's legs with
the garment. That works when the legs are already trousers and not when they
are a dress or a long skirt: there is nothing to repaint and the hem bleeds
into the result. So each house plate carries `wears` (pants / shorts / skirt /
dress / jumpsuit / other) and `low_ok` in `plates.json`, read by
`lib/plate-wear.ts`. The automatic assignment keeps pants and skirts to the
`low_ok` subset (`assignPlate(code, plates, { category })`, still deterministic
and still spread), `/api/model-shots` GET serves `wears` / `lowOk` per model and
`previews.{full,crop,low}` per pose, and the extension's picker shows a bottom
only the trouser plates, previewed waist-down. The tags come from
faire-management `thumbnail-optimizer/plate_wear.py` (Claude vision over the
front plate); `plate_harvest.py` asks new candidates the same question and
`plate_install.py` records the answer, so a new plate arrives tagged. First
pass: 23 of 27 plates take a bottom; studio 08, 12, 22 and 23 wear skirts.
