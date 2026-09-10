# Model Studio default: Nano Banana Pro reference edit

Approved by David on September 9, 2026 after reviewing DET67046 Pink Peach,
Celine, front/side/back/full. This replaces the default used by Faire Model
Studio (`/api/model-shots`), not the separate multi-model experiment editor.

- Model ID `nano-banana-pro`, Fal endpoint `fal-ai/nano-banana-pro/edit`.
- Native 1K for closer views, 2K for full-body, 2:3, PNG, one output. No upscale, sharpen, backdrop restoration,
  extra face edit or other finishing pass.
- Front sources: current model front reference, original ERP garment front.
- Each later view: finished front, original model front reference, ERP garment.
  Back uses the optional ERP back. A missing back reference is explicit in the
  prompt; do not invent back graphics or construction.
- Side, back and full are independent siblings. A front URL is required.
- Current Celine1 reference hash `f10f3e9a0ed8b61cd0adfacb1c143c11b2a20cef77ca3713e80780df2176e808`
  matches the approved test. Reference identities are not replaced by outputs.
- Explicit GPT Image2/2.5 and try-on remain available. Existing jobs/results
  are retained; the new default applies to new requests.
- Category framing and operator corrections are supported. Approved visual
  evidence covers the Pink Peach top; other garments still need visual review.

Evidence in Faire repo: `output/imagegen/det67046-pink-peach-nano-set/`.
Tests cover source order, sibling continuity, no-anchor rejection, native
output passthrough, route default dispatch and bypass of legacy render stages.

Full-body follow-up: Celine’s face was blurry at 1K. A native 2K render
using the same prompt and original inputs resolved the eyes and facial contours
more clearly while retaining soft skin and fabric. No extra editing pass.
