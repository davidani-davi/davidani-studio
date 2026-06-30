/**
 * Locked output dimensions for every studio.
 *
 * These are enforced SERVER-SIDE in the route handlers — clients do not need
 * to pass outputSize and any client-supplied value is ignored. This ensures
 * that adding a new UI path, new code flow, or new retry branch can never
 * accidentally produce images at the wrong resolution.
 *
 * Image Studio  → 2160 × 3240  (2:3 portrait, on-model catalog)
 * Model Studios → 2000 × 3000  (2:3 portrait, on-model ecommerce)
 *
 * NOTE: this MUST match the aspect ratio requested at generation time
 * (aspectRatio: "2:3"). If they disagree, the server-side `fit: "cover"`
 * resize in lib/fal.ts crops the generated image to fill the mismatched
 * box — e.g. a 4:5 output box on a 2:3 generation chops off the head/feet.
 */

// Image Studio — resize enforced server-side in /api/generate.
// 2:3 portrait, matching the generation aspect ratio so the cover-resize
// is a clean downscale with no cropping.
export const IMAGE_STUDIO_OUTPUT_SIZE = { width: 2160, height: 3240 } as const;

// Model Studios — no resize, native 4K 2:3 output from kie.ai for speed.
// export const MODEL_STUDIO_OUTPUT_SIZE = { width: 2000, height: 3000 } as const;

// CAD Pattern Extractor — square repeat tile. Resize enforced server-side in
// /api/cad-extract. 1:1 so the cover-resize is a clean downscale (no crop)
// when generation is requested at aspectRatio "1:1".
export const CAD_STUDIO_OUTPUT_SIZE = { width: 2048, height: 2048 } as const;
