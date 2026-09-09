# Handoff — davidani-studio

Written 2026-09-09T05:56:43+00:00 by Codex. Branch main; last asset commit a6af7f9; revision 2 verified live.

## Accomplished
- David rejected the current reference library and requested just Vision/Celine,
  based on the real pink/yellow DETP58027 shoot with minimal generations.
- Archived all 25 prior active sets / 75 folders intact to
  public/models/hide/retired-before-detp58027-2026-09-09/ (includes old plates.json).
- New studio 97 = Vision, studio 98 = Celine; four linked PNGs each.
- Originals: front _6 (byte-identical to attachment), side _8, back _11, full _2.
- Revision 2: David approved clearer side retries with fuller head/shorter neck.
  Six new front/back/full edits from originals + faces; approved sides reused.
  revision-02/ holds all eight outputs/prompts/ZIPs; no edit chains or upscale.
- Originals 2000x3000; outputs native 1024x1536, no upsampling disguised as detail.
- crop 97/98 reuse front/side/back bytes. low 97/98 are face-free pixel crops of
  original _2 and _7, preserving pants workflow with no additional generation.
- Added metadata display_name so identities show as Vision/Celine; rebuilt manifest.
- /api/models and both page initializers hide internal crops; sidebar shows both faces.
- Revision validation: 23 registry/metadata/API tests pass; eight native PNGs and
  matching crop bytes checked; both four-view sets visually inspected.
- Source photos, PNGs, prompts, ZIPs and review sheets are in faire-management:
  output/imagegen/detp58027-house-references/.

## Next steps
1. LIVE revision 2 (a6af7f9): deployment/test check passed and all eight PNG bytes
   match saved outputs. Refresh Studio; IDs remain 97 Vision / 98 Celine.
2. David reviews remaining views. Revisions should start from original shoot photos
   and original identity refs, not re-generate an already edited reference.
3. Model generation engine stays GPT Image 2.5 by default; no pipeline prompt change.

## Gotchas
- Front/side/back follow original head-to-thigh crops; full is a different real pose.
- Raw source means original published JPEGs, not camera-RAW sensor files.
- npm run models:manifest lacks vite-node locally; ran existing script with installed
  Vite createServer({configFile:false}).ssrLoadModule instead. No dependency change.
- Existing tsconfig.tsbuildinfo edits belong to build state; exclude from commit.
- Saved-shot deletion deletes Blob image: re-save from original before dropping.
