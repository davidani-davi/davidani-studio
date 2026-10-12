import { unstable_cache } from "next/cache";
import { listAllHumanModels } from "@/lib/models-registry";

/**
 * The model catalogue for PAGE RENDERS only. Building it fresh costs a Blob
 * list plus one fetch per catalogue change (0.5 s warm, 1.3 s cold, measured
 * 2026-10-12), and Single / Multi model paid that on every tab click.
 *
 * Staleness is bounded twice: the copy expires after 5 minutes, and
 * ModelStudioClient re-reads /api/models (uncached) as soon as it mounts, so
 * a reference added or deleted a moment ago is corrected within a second.
 * Generation routes keep calling listAllHumanModels directly: they must
 * never act on a stale catalogue.
 */
export const listAllHumanModelsForPage = unstable_cache(
  listAllHumanModels,
  ["human-models-page-v1"],
  { revalidate: 300, tags: ["human-models"] }
);
