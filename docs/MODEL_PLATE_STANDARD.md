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
