/**
 * Shared studio-background constants.
 *
 * Kept in its own module (no node built-ins, no sharp) so the client bundle
 * can import it — lib/fal.ts pulls in fs/path and can only be type-imported
 * from client components.
 */

/**
 * Locked Image Studio backdrop color. Every canvas preset in
 * public/product-shots/ measures exactly this at the corners, and
 * normalizeStudioBackground() snaps finished renders back to it.
 */
export const STUDIO_BACKGROUND_HEX = "#edeeee";

/** Same value as RGB, for pixel work. */
export const STUDIO_BACKGROUND_RGB = { r: 0xed, g: 0xee, b: 0xee } as const;

/** Garment-free studio sweep used as the back-mode canvas. */
export const STUDIO_BACKDROP_PATH = "/product-shots/studio-backdrop-empty.png";

/**
 * Which canvas occupies image_urls[0] for a generation.
 *
 * - "preserve": a styled preset canvas that already has both a clean sweep
 *   and a garment on it (front mode). Background and composition are copied
 *   from it.
 * - "backdrop": the empty sweep with no garment (back mode). It is the
 *   background authority, but composition can't be copied from it — there is
 *   no subject there to match.
 *
 * Back mode previously passed no canvas at all, leaving the user's own phone
 * photo at image_urls[0] while the prompt still said to preserve that image's
 * background. The model obeyed and kept the floor it was shot on.
 */
export type BackgroundCanvasMode = "preserve" | "backdrop";
