# Handoff — Simple garment swap
Updated 2026-09-10 14:48 PDT by Codex. Branch codex/garment-only-pixel-lock; parent ff5c8ad.
- Shipped `editMode:simple` for Faire Model Studio. Each view gets its matching
  model reference + ONE original garment photo (back photo for back when supplied).
- Short verbatim prompt, 1024×1536 GPT / native1K Nano, no provider mask,
  generated anchors, analysis pass, forced4K, restoration or portrait retry rewrite.
- 31 reviewed face-bearing built-in references bind SHA256 and native dimensions.
  Original face pixels retained then verified after PNG encode and hosted readback.
  Low/back views remain native; unreviewed/changed face references fail before spend.
- Real deployed brown-top front + side: 393216 protected pixels each, zero changed;
  visually reviewed. Body/hair below protected band may change. See docs/simple-garment-swap.md.
- 874 tests passed; npm build passed. Production ixqho54vw aliased to Studio.
- Management release /tmp/davidani-face-lock-release: Chrome2.109.0, Daily2.35.0, SW85.
  New sessions default simple; saved method choices stay intact. Previous workflow remains.
- Saved-shots retains simple metadata. No live ERP/Faire listing changes.
- Restore tag before-simple-swap-20260910 points to ff5c8ad; original restore tag intact.
- Preserve unrelated tsconfig.tsbuildinfo. Extend presets only after visual review.
- Next: user tries the new mode; assess garment fit across their real styles.
