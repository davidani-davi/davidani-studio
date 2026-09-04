import type { PipelineStep, RunFacts } from "./run-pipeline";

/**
 * The four-word strip for an ON-MODEL run.
 *
 * Image Studio's strip reads intake / side / canvas / backdrop, and three of
 * those are facts about a flat lay on an approved canvas: a Model Studio run
 * has no canvas to route to and no sweep to measure, so the shared strip
 * printed "Own canvas · Not measured" on every model run — two of its four
 * words spent saying nothing, and a four-view run mislabelled "Front + back"
 * because the shared reader only knows those two sides.
 *
 * What a model run can actually go wrong at: it can be shot on the wrong
 * person, and — the failure the multi-view path really does hit — it can come
 * back with three of its four views. So the strip is intake / views / model /
 * delivery, and the last one counts.
 */

/** "front · variant 2" -> "front". Labels carry a variant suffix on retries. */
function viewOf(label: string): string {
  return (label.split("·")[0] ?? "").trim().toLowerCase();
}

const VIEW_ORDER = ["front", "side", "back", "full"];

/** "Front", "Front + back", "4 views", or null when the run recorded none. */
export function modelRunViews(run: RunFacts): string | null {
  const views = Array.from(new Set((run.viewLabels ?? []).map(viewOf).filter(Boolean)));
  if (views.length === 0) return null;
  if (views.length >= 4) return `${views.length} views`;
  const ordered = views.sort((a, b) => VIEW_ORDER.indexOf(a) - VIEW_ORDER.indexOf(b));
  const nice = ordered.map((v) => v.charAt(0).toUpperCase() + v.slice(1));
  return nice.join(" + ");
}

/** Card title. A model run's prompt is a garment swap, not the Image Studio
 *  template, so the style number is the best short name it has. */
export function modelRunTitle(run: RunFacts & { humanModelId?: string }): string {
  if (run.styleName?.trim()) return run.styleName.trim();
  const views = modelRunViews(run);
  if (run.batch) return "Batch run";
  return views ? `On model · ${views}` : "On-model shot";
}

export function modelRunPipeline(
  run: RunFacts & { humanModelId?: string; poseId?: string }
): PipelineStep[] {
  const steps: PipelineStep[] = [];

  const intake = (run.sourceImageUrls ?? []).filter(Boolean).length;
  steps.push(
    intake > 0
      ? { key: "intake", label: intake > 1 ? `${intake} photos` : "Intake", tone: "ok" }
      : { key: "intake", label: "No intake", tone: "muted",
          detail: "This run did not record the garment photo it started from." }
  );

  const views = modelRunViews(run);
  steps.push(
    views
      ? { key: "side", label: views, tone: "ok" }
      : { key: "side", label: "View not recorded", tone: "muted" }
  );

  steps.push(
    run.humanModelId
      ? { key: "canvas", label: run.humanModelId, tone: "ok",
          detail: run.poseId ? `Pose ${run.poseId}` : undefined }
      : { key: "canvas", label: "Model not recorded", tone: "muted" }
  );

  // Delivery: the multi-view path can come back with three of four, and the
  // run is saved either way — without this the card looked finished.
  const expected =
    run.pending?.variants ?? ((run.viewLabels ?? []).length || run.imageUrls.length);
  const landed = run.imageUrls.filter(Boolean).length;
  if (run.pending) {
    steps.push({ key: "backdrop", label: `${landed}/${expected} painting`, tone: "muted" });
  } else if (expected > 0 && landed < expected) {
    steps.push({
      key: "backdrop",
      label: `${landed} of ${expected}`,
      tone: "warn",
      detail: "Some views never came back — retry them from Details.",
    });
  } else {
    steps.push({ key: "backdrop", label: landed === 1 ? "Delivered" : `${landed} delivered`, tone: "ok" });
  }

  return steps;
}
