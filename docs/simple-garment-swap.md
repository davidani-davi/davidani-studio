# Simple garment swap — 2026-09-10

The Faire Model Studio default for new sessions is `simple`. Existing saved editing-method choices remain intact; select **Simple garment swap** to switch an old set. Previous workflow remains selectable, with existing images and history retained.

Each requested view makes one independent edit: image 1 is that view's installed model reference; image 2 is the original garment front, or the garment back for a back view when supplied. Generated images are never inputs to other views. Missing garment backs remain visibly marked as inferred. The front preview remains a review step; generating the remaining views and regenerating selected views run concurrently.

The prompt only requests garment replacement, garment fidelity, unchanged pose/framing/other clothes, and no face enhancement. GPT renders 1024 × 1536 PNG; Nano uses its native 1K PNG. There is no provider edit mask, analysis/rewrite pass, forced 4K output, face restoration or background normalization. Model Studio still uses its existing provider endpoints; this reproduces the successful two-photo workflow, not a guarantee that the chat image tool and Studio's provider produce identical results.

Face-bearing built-in references have 31 reviewed presets in `lib/simple-face-presets.json`. Presets bind native dimensions and decoded RGBA SHA256. Original top pixels through the whole face are retained, with a short transition below them. Only the generated body is resized when needed; reference pixels are never resized. Protected pixels are compared after PNG encoding/decoding, and the uploaded PNG is read back and checked byte-for-byte. This preserves the face, not all hair, hands, footwear or body pixels. Waist-down and rear views return native output without a face-compositing pass. Unreviewed or changed face references fail before generation; use Previous workflow or review a new preset.

Real production tests: brown mannequin top on Celine 2 front and side, independent simultaneous requests. Both delivered 1024 × 1536 PNGs with 393,216 protected pixels and zero changes. Visual review passed. Results recorded in management `output/simple-garment-swap/`.

Rollback: tag `restore/model-studio-before-simple-swap-20260910` points to ff5c8ad in Studio and c04c8c0 in management. Earlier `restore/model-studio-before-garment-only-20260910` also remains intact. Roll back through a new reviewed deployment; don't reset shared working trees.

## Color consistency adjustment — 2.109.1
The garment photo is now explicitly the sole color reference: hue, saturation and midtone brightness, with natural fold shadows/highlights. The generic ERP color-name instruction is omitted so it cannot compete with the photograph. Two inputs, one generation and the exact same face-composition code remain. A fresh Celine1 brown-top four-view trial passed protected-pixel verification on front/side/full; back has no visible face. Visual comparison still shows shade variation, so this is a prompt-level consistency improvement, not an exact color-lock guarantee. No segmentation, color grading or added AI stage was introduced.
