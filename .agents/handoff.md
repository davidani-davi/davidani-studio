# Handoff — davidani-studio

**Written:** 2026-09-04 by Claude Code (Mac mini)
**Branch:** main (image-studio/flat-lay-consistency fast-forwarded into it)
**Last commits:** `1acd04a` /api/model-shots · `468ea5d` Model Studio Split Ledger
**Deployed:** production (git push only) — /api/model-shots answers 401 without a token

## Just done
1. **Split Ledger on both Model Studios.** `/model-studio` and
   `/model-studio-beta` now use RunLedger + PaneSplitter + StageView +
   ModelComposer with Setup / ERP photos / Run details drawers. Model runs are
   read by `lib/model-run-pipeline.ts` (intake · views · model · delivery),
   not Image Studio's canvas/backdrop strip. Every run seeds a `pending` card
   with its own clock; stranded cards are swept on mount, history change and
   focus. Downloads go through `/api/download`. The old three-pane CSS is gone.
   New pure modules (all tested): `model-composer-slots`, `model-pose-line`,
   `model-run-pipeline`. Shared composer parts: `components/ledger/ComposerParts.tsx`.
2. **`/api/model-shots`** — one view of the four-view run per call, for the
   Faire extension. Calls the studio's own analyze/generate route handlers as
   functions (no HTTP hop, no session cookie); the four-view directives moved
   to `lib/multi-model-prompt.ts`, imported by both the client and the route.
   Auth: `X-DDTO-TOKEN` vs `MODEL_SHOTS_TOKEN`, falling back to `APP_PASSWORD`,
   or a valid session cookie. Fails closed. `vercel.json` gives it maxDuration 800.

## Plates (2026-09-04, later)
The "big head / same model every time" work. Measured: house photography puts
the head at 9-11% of frame on a full-body 2:3 frame over rgb(249,237,226); every
old plate (kylie/celine/sydney) is a head-to-thigh crop at 19-23%. That IS the
big head, and the canvas decides it — no prompt reaches it.

- `docs/MODEL_PLATE_STANDARD.md` — the measured standard and where plates come from.
- `public/models/studio 01..12` — twelve new plate sets. Front = a real photograph
  harvested from our own ERP galleries; side/back/full derived from that front so
  it stays the same woman. `plates.json` records provenance.
- `lib/plate-assign.ts` — the plate is assigned from the style code:
  deterministic (a style always returns on the same model, and a Plus twin takes
  its regular twin's) and spread across the set. `/api/model-shots` defaults to
  `humanModelId: "auto"` and reports `assigned`.
- Tooling lives in faire-management: `plate_harvest.py` (scan/adopt),
  `plate_derive.py`, `plate_install.py`.

## Next steps
- A real four-view generation through `/api/model-shots` has NOT been run yet
  (needs the studio password; it is not on this machine). Once
  `DAVIDANI_STUDIO_PASSWORD` is in `~/davidani-marketing-agent/.env`:
  `curl -s -X POST https://davidani-studio.vercel.app/api/model-shots -H "X-DDTO-TOKEN: $PW" -H 'Content-Type: application/json' -d '{"garmentImageUrls":["<erp full-res url>"],"humanModelId":"kylie 1","poseId":"kylie 1","view":"front"}'`
- Optional: set `MODEL_SHOTS_TOKEN` in Vercel so the extension's key is
  revocable without changing the team password.

## Gotchas
- Local dev cannot generate: the kie path uploads the pose canvas via fal, so
  it wants `FAL_KEY`, which is not on this machine. Production resolves poses
  as public studio URLs instead, so only production can be tested end to end.
- `tsc` clean; 584 tests pass. `npx next dev -p 3111` with
  `APP_PASSWORD=devpass AUTH_SECRET=devsecret` is enough to browse the UI.
