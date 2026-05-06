/**
 * Locked output dimensions for every studio.
 *
 * These are enforced SERVER-SIDE in the route handlers — clients do not need
 * to pass outputSize and any client-supplied value is ignored. This ensures
 * that adding a new UI path, new code flow, or new retry branch can never
 * accidentally produce images at the wrong resolution.
 *
 * Image Studio  → 2160 × 2700  (4:5 portrait, flat-lay catalog)
 * Model Studios → 2000 × 3000  (2:3 portrait, on-model ecommerce)
 */

// Image Studio flat-lay — resize enforced server-side in /api/generate.
export const IMAGE_STUDIO_OUTPUT_SIZE = { width: 2160, height: 2700 } as const;

// Model Studios — no resize, native 4K 2:3 output from kie.ai for speed.
// export const MODEL_STUDIO_OUTPUT_SIZE = { width: 2000, height: 3000 } as const;
