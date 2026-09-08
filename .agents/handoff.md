# handoff — davidani-studio

Written 2026-09-08 by Claude Code. Branch main, last commit c15dab0 (pushed).

## Just done
- Vision + celine reference (plate) sets on the three live poses. Bases = the tank fronts
  of studio 03 / 05 / 19 (candidates.json rows 42/43/44 in the faire-management data root,
  `file` instead of ERP url). 18 GPT Image 2 masked head swaps (neutral/smile/teeth × 2 faces
  × 3 poses), 30 KIE derives, all accepted by the house standard first attempt.
  Installed as studio 61, 80–96 (celine: 61 80 81 / 85 86 87 / 91 92 93; vision: 82 83 84 /
  88 89 90 / 94 95 96). Each carries `base_plate`, outfit/hem/legs fields copied from its base.
  crop/low families cut; lib/models-static-manifest.ts rebuilt.
- Earlier today: face anchor (f49bab4), blend restore (31d3fb8), both verified live on DJ62231.

## Next steps
1. Confirm the Vercel build of c15dab0 is READY and `/api/models` lists studio 96.
2. David reviews the two sheets (sent); retire any rejected set with `git mv` to
   public/models/hide/ + hide/plates.json (never delete).
3. Decide whether studio 03/05/19 (real face) stay in the auto pool now that the house-face
   sets cover the same poses.

## Gotchas
- Another session may share this checkout: commit with explicit pathspecs, never `git add -A`
  (tsconfig.tsbuildinfo is dirty and must not be committed).
- plate_install pins head-swapped plates to their slug only (0539021 in faire-management);
  before that fix the vision sets would have overwritten studio 03/05/19.
- plate_derive.py --slug runs are merge-safe in parallel (4 at a time); `--all` would also
  derive every staged row lacking views — do not use it.
