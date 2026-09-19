/**
 * Publishes the house-face identity specs as a static JSON file.
 *
 * The specs are authored in TypeScript (lib/face-identity.ts) because that is
 * where the negation and booster guards run. But the tool that actually needs
 * them — thumbnail-optimizer/plate_derive.py, which derives a plate's side,
 * back and full views from its front — is Python in another repo. Rather than
 * keep a second copy of the measurements there and let the two drift, the
 * spec is emitted into public/, which Vercel serves, and plate_derive fetches
 * it next to the face reference PNGs it already pulls from the same folder.
 *
 * Regenerate with `npm run faces:identity`. lib/face-identity.test.ts fails if
 * the committed file is out of date, so a spec edit cannot ship without it.
 */
import { writeFileSync } from "node:fs";
import { FACE_IDENTITIES, identityPromptOf, IDENTITY_RULE } from "../lib/face-identity";
import { HOUSE_FACES } from "../lib/no-plate";

export const IDENTITY_JSON_PATH = "public/models/hide/faces/identity.json";

/** The published shape: the measurements, and the paragraph rendered from them. */
export function identityDocument() {
  const faces: Record<string, { spec: unknown; prompt: string }> = {};
  for (const face of Object.keys(HOUSE_FACES).sort() as (keyof typeof FACE_IDENTITIES)[]) {
    faces[face] = { spec: FACE_IDENTITIES[face], prompt: identityPromptOf(face) };
  }
  // No timestamp: a generated-at field would make every regeneration a diff
  // and the freshness test unrunnable.
  return { rule: IDENTITY_RULE.trim(), faces };
}

/** Serialized exactly as the file on disk stores it. */
export function identityJson(): string {
  return JSON.stringify(identityDocument(), null, 2) + "\n";
}

// Only when run as the script. The freshness test imports this module to
// compare against the committed file; if the write ran on import it would
// rewrite the file first and the comparison could never fail.
if (process.argv[1] && /emit-face-identity\.mts$/.test(process.argv[1])) {
  writeFileSync(IDENTITY_JSON_PATH, identityJson());
  console.log(`wrote ${IDENTITY_JSON_PATH}`);
}
